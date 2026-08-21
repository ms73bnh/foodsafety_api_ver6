import prisma from '@/lib/prisma';
import { getEmbedding, cosineSimilarity, getGeminiModel } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

// ─── Rate Limit 설정 ──────────────────────────────────────────────
const USER_DAILY_LIMIT = 20;    // 사용자(IP)별 하루 최대 질문 수
const GLOBAL_DAILY_LIMIT = 500; // 전체 시스템 하루 최대 질문 수

/** 오늘 날짜 문자열 (KST 기준 YYYY-MM-DD) */
function todayKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const dailyCountMap = new Map(); // "YYYY-MM-DD:ip" → count
const globalCountMap = new Map(); // "YYYY-MM-DD" → count

function checkRateLimit(ip) {
  const today = todayKST();
  const userKey = `${today}:${ip}`;
  const globalKey = today;

  const userCount = dailyCountMap.get(userKey) || 0;
  const globalCount = globalCountMap.get(globalKey) || 0;

  if (globalCount >= GLOBAL_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'global',
      remaining: 0,
      message: `오늘의 전체 질문 한도(${GLOBAL_DAILY_LIMIT}회)에 도달했습니다. 내일 다시 이용해 주세요.`,
    };
  }
  if (userCount >= USER_DAILY_LIMIT) {
    return {
      allowed: false,
      reason: 'user',
      remaining: 0,
      message: `오늘 사용 가능한 질문 횟수(${USER_DAILY_LIMIT}회)를 모두 사용했습니다. 내일 다시 이용해 주세요.`,
    };
  }

  return {
    allowed: true,
    remaining: USER_DAILY_LIMIT - userCount - 1,
    userCount: userCount + 1,
    globalCount: globalCount + 1,
    userKey,
    globalKey,
  };
}

function incrementCount(check) {
  if (!check.userKey) return;
  dailyCountMap.set(check.userKey, check.userCount);
  globalCountMap.set(check.globalKey, check.globalCount);
}

export async function POST(req) {
  try {
    const { question, history = [] } = await req.json();

    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: '질문 내용을 입력해주세요.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Rate Limit 체크 ──────────────────────────────────────────
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const rateCheck = checkRateLimit(ip);

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.message, rateLimited: true }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }
    incrementCount(rateCheck);

    const cleanQuestion = question.trim();

    // 1. 사용자 질문을 임베딩 벡터로 변환
    let queryVector = [];
    try {
      queryVector = await getEmbedding(cleanQuestion);
    } catch (embErr) {
      console.warn('Embedding generation failed, falling back to keyword search:', embErr.message);
    }

    // 2. DB에서 안건 및 회의록 데이터 로드
    const allAgendas = await prisma.committee_agendas.findMany({
      include: { meeting: true },
      orderBy: { id: 'desc' },
      take: 200,
    });

    // 3. 하이브리드 유사도 계산
    const scored = allAgendas.map(item => {
      let score = 0;
      if (queryVector.length > 0 && item.embedding) {
        try {
          const vec = JSON.parse(item.embedding);
          score = cosineSimilarity(queryVector, vec);
        } catch (e) {}
      }
      const lowerQ = cleanQuestion.toLowerCase();
      if (lowerQ.includes(item.ingredientName.toLowerCase())) score += 0.4;
      if (item.result && lowerQ.includes(item.result)) score += 0.15;
      if (item.meeting?.meetingNo && lowerQ.includes(item.meeting.meetingNo)) score += 0.3;
      return { ...item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 6);

    // 4. Gemini 프롬프트 구성
    const contextItems = topMatches.map((m, idx) => {
      return `[참고자료 ${idx + 1}]
- 회의명: ${m.meeting?.title || '식약처 건강기능식품심의위원회'}
- 일시: ${m.meeting?.meetingDate || '날짜 미상'}
- 담당부서: ${m.meeting?.department || '영양기능연구과'}
- 안건(원료명): ${m.ingredientName} (${m.agendaType || '신규인정'})
- 심의결과: ${m.result}
- 안건원문: ${m.rawName}`;
    }).join('\n\n');

    const systemInstruction = `당신은 대한민국 식품의약품안전처(식약처) 건강기능식품심의위원회 전문 분석 AI 도우미입니다.
제공된 [공식 심의위원회 회의록 참고자료]를 기반으로 사용자의 질문에 대해 명확하고 신뢰성 높게 한국어로 답변하세요.

답변 가이드라인:
1. 심의 결과(인정 / 보완 / 불인정 등)를 명확히 구분하여 답변하세요.
2. 회차(예: 제202차), 일시, 원료명, 신청 구분(신규 인정, 기능성 추가 등) 정보를 포함하여 답변의 신뢰성을 높이세요.
3. 근거 자료에 없는 내용을 임의로 지어내지 말고, 회의록에 기록된 사실을 바탕으로 정중하고 명료하게 설명하세요.
4. 가독성을 위해 마크다운(글머리 기호, 굵은 글씨, 표 등)을 적극 활용하세요.`;

    const prompt = `${systemInstruction}

[공식 심의위원회 회의록 참고자료]:
${contextItems || '관련 회의록 자료가 충분하지 않습니다.'}

[사용자 질문]:
${cleanQuestion}

위 참고자료를 바탕으로 사용자의 질문에 대해 전문적이고 명확하게 답변해 주세요.`;

    // 5. Gemini 스트리밍 응답
    const model = getGeminiModel();
    const resultStream = await model.generateContentStream(prompt);

    const encoder = new TextEncoder();
    const remaining = rateCheck.remaining;

    const customReadable = new ReadableStream({
      async start(controller) {
        const refData = topMatches.map(m => ({
          id: m.id,
          ingredientName: m.ingredientName,
          result: m.result,
          meetingNo: m.meeting?.meetingNo,
          meetingDate: m.meeting?.meetingDate,
          meetingTitle: m.meeting?.title,
          pdfFileName: m.meeting?.pdfFileName,
          pdfFileUrl: m.meeting?.pdfFileUrl,
        }));
        controller.enqueue(encoder.encode(`__REF__:${JSON.stringify({ refs: refData, remaining })}\n\n`));

        try {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) controller.enqueue(encoder.encode(chunkText));
          }
        } catch (streamErr) {
          controller.enqueue(encoder.encode(`\n[오류 발생: ${streamErr.message}]`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(customReadable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
        'X-RateLimit-Remaining': String(remaining),
      },
    });
  } catch (error) {
    console.error('Committee Chat API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 남은 질문 횟수 조회 (GET)
export async function GET(req) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const today = todayKST();
  const userKey = `${today}:${ip}`;
  const globalKey = today;
  const userCount = dailyCountMap.get(userKey) || 0;
  const globalCount = globalCountMap.get(globalKey) || 0;

  return new Response(
    JSON.stringify({
      userUsed: userCount,
      userLimit: USER_DAILY_LIMIT,
      userRemaining: Math.max(0, USER_DAILY_LIMIT - userCount),
      globalUsed: globalCount,
      globalLimit: GLOBAL_DAILY_LIMIT,
      globalRemaining: Math.max(0, GLOBAL_DAILY_LIMIT - globalCount),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
