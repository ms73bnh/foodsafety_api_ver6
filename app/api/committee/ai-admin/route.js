import crypto from 'node:crypto';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, getEmbeddings } from '@/lib/e5';
import {
  analyzeCommitteeQuestion,
  finishGeminiStreamLog,
  getGeminiConfiguration,
  streamGeminiResponse,
} from '@/lib/gemini';
import { createAiLog, completeAiLog, listAiLogs } from '@/lib/committeeAiLogs';
import {
  COMMITTEE_PROMPT_SETTING_KEYS,
  DEFAULT_COMMITTEE_SYSTEM_PROMPT,
  DEFAULT_EVIDENCE_VALIDATION_PROMPT,
  DEFAULT_QUESTION_ANALYSIS_PROMPT,
} from '@/lib/committeePrompt';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DEFAULT_PROMPTS = {
  system: DEFAULT_COMMITTEE_SYSTEM_PROMPT,
  questionAnalysis: DEFAULT_QUESTION_ANALYSIS_PROMPT,
  evidenceValidation: DEFAULT_EVIDENCE_VALIDATION_PROMPT,
};

function requireAdmin(request) {
  const user = getCurrentUser(request);
  return user?.role === 'ADMIN' ? user : null;
}

function logContext(user) {
  return {
    requestId: crypto.randomUUID(),
    userId: Number.isInteger(Number(user?.id)) ? Number(user.id) : null,
    username: user?.username ? String(user.username).slice(0, 100) : null,
  };
}

async function getPrompts() {
  const rows = await prisma.system_settings.findMany({
    where: { key: { in: Object.values(COMMITTEE_PROMPT_SETTING_KEYS) } },
  });
  const settings = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    system: settings[COMMITTEE_PROMPT_SETTING_KEYS.system] || DEFAULT_PROMPTS.system,
    questionAnalysis: settings[COMMITTEE_PROMPT_SETTING_KEYS.questionAnalysis] || DEFAULT_PROMPTS.questionAnalysis,
    evidenceValidation: settings[COMMITTEE_PROMPT_SETTING_KEYS.evidenceValidation] || DEFAULT_PROMPTS.evidenceValidation,
  };
}

async function getEmbeddingErrors() {
  return prisma.$queryRawUnsafe(`
    SELECT COALESCE("embeddingError", '오류 내용 없음') AS "error", COUNT(*)::int AS "count"
    FROM "committee_chunks"
    WHERE "embeddingStatus" = 'failed'
    GROUP BY "embeddingError"
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `).catch(() => []);
}

export async function GET(request) {
  const user = requireAdmin(request);
  if (!user) return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  try {
    const [prompts, logs, totalChunks, embeddedChunks, pendingChunks, failedChunks, embeddingErrors] = await Promise.all([
      getPrompts(),
      listAiLogs(50),
      prisma.committee_chunks.count(),
      prisma.committee_chunks.count({ where: { embeddingStatus: 'completed', embeddingDimensions: EMBEDDING_DIMENSIONS } }),
      prisma.committee_chunks.count({ where: { embeddingStatus: 'pending' } }),
      prisma.committee_chunks.count({ where: { embeddingStatus: 'failed' } }),
      getEmbeddingErrors(),
    ]);
    return Response.json({
      e5: {
        configured: Boolean(process.env.E5_EMBEDDING_URL && process.env.E5_API_KEY),
        url: process.env.E5_EMBEDDING_URL || '',
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        totalChunks,
        embeddedChunks,
        pendingChunks,
        failedChunks,
        errors: embeddingErrors,
      },
      gemini: getGeminiConfiguration(),
      prompts,
      logs,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'AI 관리 정보를 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = requireAdmin(request);
  if (!user) return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });

  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'save-prompts') {
      const prompts = body.prompts || {};
      if (!String(prompts.system || '').trim()) throw new Error('최종 답변 시스템 프롬프트가 비어 있습니다.');
      if (!String(prompts.questionAnalysis || '').includes('{{question}}')) throw new Error('질문 분석 프롬프트에 {{question}}이 필요합니다.');
      if (!String(prompts.evidenceValidation || '').includes('{{question}}') || !String(prompts.evidenceValidation || '').includes('{{evidence}}')) {
        throw new Error('근거 검증 프롬프트에 {{question}}과 {{evidence}}가 필요합니다.');
      }
      await prisma.$transaction(Object.entries(COMMITTEE_PROMPT_SETTING_KEYS).map(([name, key]) =>
        prisma.system_settings.upsert({
          where: { key },
          create: { key, value: String(prompts[name]).trim(), updatedBy: user.username },
          update: { value: String(prompts[name]).trim(), updatedBy: user.username },
        })
      ));
      return Response.json({ success: true, prompts: await getPrompts() });
    }

    if (action === 'reset-prompts') {
      await prisma.system_settings.deleteMany({ where: { key: { in: Object.values(COMMITTEE_PROMPT_SETTING_KEYS) } } });
      return Response.json({ success: true, prompts: DEFAULT_PROMPTS });
    }

    if (action === 'test-e5') {
      const context = logContext(user);
      const startedAt = Date.now();
      const prompt = String(body.text || '건강기능식품 심의 결과').slice(0, 500);
      const id = await createAiLog({ ...context, stage: 'E5_DIAGNOSTIC', provider: 'e5', model: EMBEDDING_MODEL, prompt });
      try {
        const [vector] = await getEmbeddings([prompt], { inputType: 'query' });
        const result = { dimensions: vector.length, sample: vector.slice(0, 5), elapsedMs: Date.now() - startedAt };
        await completeAiLog(id, { response: result, durationMs: result.elapsedMs });
        return Response.json({ success: true, result });
      } catch (error) {
        await completeAiLog(id, { status: 'FAILED', durationMs: Date.now() - startedAt, error: error.message });
        throw error;
      }
    }

    const prompts = await getPrompts();
    const context = logContext(user);
    if (action === 'test-gemini-analysis') {
      const result = await analyzeCommitteeQuestion('제202차 건강기능식품심의위원회의 주요 심의 결과는?', {
        promptTemplate: prompts.questionAnalysis,
        logContext: context,
        bypassCache: true,
      });
      return Response.json({ success: true, result });
    }

    if (action === 'test-gemini-answer') {
      const testPrompt = '[참고자료]\n제202차 회의 테스트 자료: 테스트 원료의 심의 결과는 인정입니다.\n\n[질문]\n테스트 원료의 심의 결과를 한 문장으로 답하세요.';
      const { stream, model, logId, startedAt } = await streamGeminiResponse(testPrompt, prompts.system, {
        stage: 'FINAL_ANSWER_TEST',
        logContext: context,
      });
      let answer = '';
      try {
        for await (const chunk of stream) {
          const parts = chunk.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) if (!part.thought && part.text) answer += part.text;
          } else if (chunk.text) {
            answer += chunk.text;
          }
        }
        await finishGeminiStreamLog(logId, { model, response: answer, durationMs: Date.now() - startedAt });
      } catch (error) {
        await finishGeminiStreamLog(logId, { model, status: 'FAILED', response: answer, durationMs: Date.now() - startedAt, error: error.message });
        throw error;
      }
      return Response.json({ success: true, result: { model, answer } });
    }

    return Response.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'AI 관리 작업에 실패했습니다.' }, { status: 500 });
  }
}
