import prisma from '@/lib/prisma';
import { getEmbedding, cosineSimilarity, getGeminiModel } from '@/lib/gemini';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function todayKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// 비로그인 IP용 인메모리 백업 Map
const ipCountMap = new Map();

/**
 * 사용자별 Rate Limit 확인 및 처리
 */
async function checkAndIncrementUserChatLimit(req) {
  const currentUser = getCurrentUser(req);
  const today = todayKST();

  // 1. 관리자(ADMIN)는 무제한!
  if (currentUser && currentUser.role === 'ADMIN') {
    return {
      allowed: true,
      isAdmin: true,
      remaining: 9999,
      limit: 9999,
      used: 0,
    };
  }

  // 2. 로그인된 일반 사용자 (DB 기반 관리)
  if (currentUser && currentUser.id) {
    const dbUser = await prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, username: true, role: true, dailyChatLimit: true, dailyChatCount: true, lastChatDate: true }
    });

    if (dbUser) {
      if (dbUser.role === 'ADMIN') {
        return { allowed: true, isAdmin: true, remaining: 9999, limit: 9999, used: 0 };
      }

      // 날짜가 바뀌었으면 카운트 0으로 리셋
      let currentCount = dbUser.lastChatDate === today ? (dbUser.dailyChatCount || 0) : 0;
      const limit = dbUser.dailyChatLimit || 20;

      if (currentCount >= limit) {
        return {
          allowed: false,
          isAdmin: false,
          remaining: 0,
          limit,
          used: currentCount,
          message: `오늘 사용 가능한 질문 횟수(${limit}회)를 모두 사용했습니다. 내일 다시 이용해 주시거나 관리자에게 문의해 주세요.`,
        };
      }

      // 카운트 1 증가
      const nextCount = currentCount + 1;
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          dailyChatCount: nextCount,
          lastChatDate: today,
        }
      });

      return {
        allowed: true,
        isAdmin: false,
        remaining: Math.max(0, limit - nextCount),
        limit,
        used: nextCount,
      };
    }
  }

  // 3. 비로그인 사용자 (IP 기준 10회 제한)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const ipKey = `${today}:${ip}`;
  const ipCount = ipCountMap.get(ipKey) || 0;
  const ipLimit = 10;

  if (ipCount >= ipLimit) {
    return {
      allowed: false,
      isAdmin: false,
      remaining: 0,
      limit: ipLimit,
      used: ipCount,
      message: `비로그인 사용자의 일일 질문 한도(${ipLimit}회)에 도달했습니다. 로그인 후 이용해 주세요.`,
    };
  }

  ipCountMap.set(ipKey, ipCount + 1);
  return {
    allowed: true,
    isAdmin: false,
    remaining: Math.max(0, ipLimit - ipCount - 1),
    limit: ipLimit,
    used: ipCount + 1,
  };
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

    // ── 사용자별 Rate Limit 검사 (관리자 무제한) ─────────────────────────
    const rateCheck = await checkAndIncrementUserChatLimit(req);

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({ error: rateCheck.message, rateLimited: true, remaining: 0 }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const cleanQuestion = question.trim();

    // 1. 사용자 질문을 임베딩 벡터로 변환
    let queryVector = [];
    try {
      queryVector = await getEmbedding(cleanQuestion);
    } catch (embErr) {
      console.warn('Embedding generation failed, falling back to keyword search:', embErr.message);
    }

    // 2. DB에서 전체 심의 안건 로드 (최신 500개)
    const allAgendas = await prisma.committee_agendas.findMany({
      include: { meeting: true },
      orderBy: { id: 'desc' },
      take: 500,
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

    // 4. 프롬프트 구성
    const contextItems = topMatches.map((m, idx) => {
      return `[참고자료 ${idx + 1}]
- 회의명: ${m.meeting?.title || '식약처 건강기능식품심의위원회'}
- 일시: ${m.meeting?.meetingDate || m.meeting?.postDate || '날짜 미상'}
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

    // 5. Gemini 스트리밍 생성 (모델 자동 폴백 지원)
    let resultStream = null;
    const candidateModels = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-pro'];
    let lastGenError = null;

    for (const mName of candidateModels) {
      try {
        const model = getGeminiModel(mName);
        resultStream = await model.generateContentStream(prompt);
        if (resultStream) break;
      } catch (err) {
        lastGenError = err;
        console.warn(`Model ${mName} generation failed, trying next fallback:`, err.message);
      }
    }

    if (!resultStream) {
      throw new Error(`AI 답변 생성 실패: ${lastGenError?.message || '사용 가능한 Gemini 모델을 찾을 수 없습니다.'}`);
    }

    const encoder = new TextEncoder();
    const { remaining, isAdmin: isAdminUser } = rateCheck;

    const customReadable = new ReadableStream({
      async start(controller) {
        const refData = topMatches.map(m => ({
          id: m.id,
          ingredientName: m.ingredientName,
          result: m.result,
          meetingNo: m.meeting?.meetingNo,
          meetingDate: m.meeting?.meetingDate || m.meeting?.postDate,
          meetingTitle: m.meeting?.title,
          pdfFileName: m.meeting?.pdfFileName,
          pdfFileUrl: m.meeting?.pdfFileUrl,
        }));
        controller.enqueue(encoder.encode(`__REF__:${JSON.stringify({ refs: refData, remaining, isAdmin: isAdminUser })}\n\n`));

        try {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) controller.enqueue(encoder.encode(chunkText));
          }
        } catch (streamErr) {
          controller.enqueue(encoder.encode(`\n[답변 스트리밍 중 오류 발생: ${streamErr.message}]`));
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
    return new Response(JSON.stringify({ error: error.message || '서버 응답 오류가 발생했습니다.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 현재 사용자의 남은 질문 횟수 조회 (GET)
export async function GET(req) {
  try {
    const currentUser = getCurrentUser(req);
    const today = todayKST();

    if (currentUser && currentUser.role === 'ADMIN') {
      return new Response(
        JSON.stringify({
          isAdmin: true,
          limit: 9999,
          used: 0,
          remaining: 9999,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (currentUser && currentUser.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { dailyChatLimit: true, dailyChatCount: true, lastChatDate: true, role: true }
      });
      if (dbUser) {
        const isAdminUser = dbUser.role === 'ADMIN';
        const limit = isAdminUser ? 9999 : (dbUser.dailyChatLimit || 20);
        const used = dbUser.lastChatDate === today ? (dbUser.dailyChatCount || 0) : 0;
        return new Response(
          JSON.stringify({
            isAdmin: isAdminUser,
            limit,
            used,
            remaining: isAdminUser ? 9999 : Math.max(0, limit - used),
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 비로그인
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';
    const ipKey = `${today}:${ip}`;
    const used = ipCountMap.get(ipKey) || 0;
    const limit = 10;

    return new Response(
      JSON.stringify({
        isAdmin: false,
        limit,
        used,
        remaining: Math.max(0, limit - used),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
