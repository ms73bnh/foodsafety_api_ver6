import prisma from '@/lib/prisma';
import { getEmbedding, cosineSimilarity, streamGeminiResponse } from '@/lib/gemini';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    const lowerQ = cleanQuestion.toLowerCase();

    // 0. 커스텀 시스템 프롬프트 로드 (관리자 설정 or 기본값)
    let systemInstruction;
    try {
      const settingRow = await prisma.system_settings.findUnique({ where: { key: 'committee_system_prompt' } });
      systemInstruction = settingRow?.value || null;
    } catch (e) { systemInstruction = null; }

    if (!systemInstruction) {
      systemInstruction = `당신은 식약처 건강기능식품심의위원회 전문 AI 도우미입니다.
아래 [참고자료]를 분석하여 질문에 자연스럽고 명확한 한국어 문장으로 답변하세요.

답변 규칙:
1. 참고자료 원문을 그대로 복사하지 마세요. 반드시 내용을 요약·정리하여 답변하세요.
2. 답변 형식: "~했습니다", "~입니다" 등 완성된 문장으로 작성하세요.
3. 원료명, 회차, 일시, 심의결과(인정/불인정/보완)를 명시하세요.
4. 참고자료에 없는 내용은 "해당 정보가 데이터에 없습니다"라고 답하세요.
5. 500자 이내로 핵심만 작성하고, 마크다운(굵게, 목록)으로 가독성을 높이세요.

나쁜 예시 (하지 말것): "결과(2019.12.13) 저분자콜라겐펩타이드(기능성 추가)(제1차) 인정"
좋은 예시: "**저분자콜라겐펩타이드**는 제174차 회의(2019.12.13)에서 기능성 추가 및 섭취량 변경 건으로 심의되어 **인정** 결정을 받았습니다."`;
    }

    // 1. 질문 의도 분류
    const isRecentQuery = /최근|최신|마지막|새로운|방금|요즘|가장 최근|최근에|최신|최근 등록|최근 게시/.test(lowerQ);
    const isMemberQuery = /위원|명단|위원장|참석|구성원|멤버|기|임기/.test(lowerQ);
    const isAgendaQuery = /심의|인정|불인정|보완|원료|성분|결과|안건/.test(lowerQ);

    // 2. 항상 포함: 최신 회의 5건 목록 (어떤 질문이든 기본 컨텍스트)
    const latestMeetings = await prisma.committee_meetings.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      include: { agendas: { select: { ingredientName: true, result: true }, take: 10 } },
    });

    // 2-1. 회의 레벨 임베딩 검색 (contentEmbedding 있는 경우)
    let meetingEmbedContext = '';
    try {
      let qVec = [];
      try { qVec = await getEmbedding(cleanQuestion); } catch (e) {}
      if (qVec.length > 0) {
        const meetingsWithEmbed = await prisma.committee_meetings.findMany({
          where: { NOT: { contentEmbedding: null } },
          orderBy: { id: 'desc' },
          take: 100,
          select: {
            id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
            rawContent: true, pdfContent: true, contentEmbedding: true,
            agendas: { select: { ingredientName: true, result: true }, take: 5 },
          },
        });
        const scoredMeetings = meetingsWithEmbed.map(m => {
          let score = 0;
          try { score = cosineSimilarity(qVec, JSON.parse(m.contentEmbedding)); } catch (e) {}
          if (m.meetingNo && lowerQ.includes(m.meetingNo)) score += 0.4;
          if (m.title && lowerQ.includes(m.title.substring(0, 6))) score += 0.2;
          return { ...m, score };
        }).filter(m => m.score > 0.1).sort((a, b) => b.score - a.score).slice(0, 3);

        meetingEmbedContext = scoredMeetings.map((m, i) =>
          `[회의자료 ${i + 1}] 제목: ${m.title}\n` +
          `회차: ${m.meetingNo || '-'} | 일시: ${m.meetingDate || m.postDate || '-'}\n` +
          (m.agendas.length ? `심의 안건 및 결과:\n${m.agendas.map(a => `  - ${a.ingredientName}: ${a.result}`).join('\n')}\n` : '') +
          (m.pdfContent ? `PDF 요약: ${m.pdfContent.substring(0, 600)}` : '')
        ).join('\n\n');
      }
    } catch (e) { /* 회의 임베딩 검색 실패 시 무시 */ }

    const latestMeetingsContext = latestMeetings.map((m, i) =>
      `[최신회의 ${i + 1}] ${m.title} | ${m.meetingDate || m.postDate || '-'} | 등록일: ${m.postDate || '-'}` +
      (m.agendas.length ? `\n  안건: ${m.agendas.map(a => `${a.ingredientName}(${a.result})`).join(', ')}` : '')
    ).join('\n');

    // 3. 본문 키워드 검색 (위원명단·참석자 등 rawContent 필요 시)
    let rawContentContext = '';
    if (isMemberQuery || isRecentQuery) {
      const keywords = cleanQuestion.split(/[\s,]+/).filter(k => k.length >= 2);
      const found = await prisma.committee_meetings.findMany({
        where: keywords.length ? { OR: keywords.map(k => ({ rawContent: { contains: k } })) } : {},
        orderBy: { id: 'desc' },
        take: 3,
        select: { title: true, meetingNo: true, meetingDate: true, postDate: true, rawContent: true },
      }).catch(() => []);

      rawContentContext = found.map((m, i) =>
        `[본문자료 ${i + 1}] 제목: ${m.title}\n` +
        `회차: ${m.meetingNo || '-'} | 일시: ${m.meetingDate || m.postDate || '-'}\n` +
        `내용 요약: ${(m.rawContent || '').replace(/\n+/g, ' ').substring(0, 400)}`
      ).join('\n\n');
    }

    // 4. 안건 임베딩 검색 (원료명·심의결과 질문 시)
    let agendaContext = '';
    let topMatches = [];
    if (isAgendaQuery || (!isMemberQuery && !isRecentQuery)) {
      let queryVector = [];
      try { queryVector = await getEmbedding(cleanQuestion); } catch (e) {}

      const allAgendas = await prisma.committee_agendas.findMany({
        include: { meeting: true },
        orderBy: { id: 'desc' },
        take: 300,
      });

      const scored = allAgendas.map(item => {
        let score = 0;
        if (queryVector.length > 0 && item.embedding) {
          try { score = cosineSimilarity(queryVector, JSON.parse(item.embedding)); } catch (e) {}
        }
        if (lowerQ.includes(item.ingredientName.toLowerCase())) score += 0.5;
        if (item.result && lowerQ.includes(item.result)) score += 0.15;
        if (item.meeting?.meetingNo && lowerQ.includes(item.meeting.meetingNo)) score += 0.3;
        return { ...item, score };
      }).filter(i => i.score > 0.05);

      scored.sort((a, b) => b.score - a.score);
      topMatches = scored.slice(0, 5);

      agendaContext = topMatches.map((m, idx) =>
        `[안건 ${idx + 1}]\n` +
        `- 원료명: ${m.ingredientName}\n` +
        `- 심의 구분: ${m.agendaType || '신규인정'}\n` +
        `- 심의 결과: ${m.result}\n` +
        `- 회차: ${m.meeting?.meetingNo || '-'}\n` +
        `- 일시: ${m.meeting?.meetingDate || m.meeting?.postDate || '-'}`
      ).join('\n\n');
    }

    // 5. 컨텍스트 조합
    const contextParts = [
      `[최신 회의 목록]\n${latestMeetingsContext}`,
      rawContentContext ? `[관련 회의 본문]\n${rawContentContext}` : '',
      meetingEmbedContext ? `[회의록 유사도 검색결과]\n${meetingEmbedContext}` : '',
      agendaContext ? `[심의 안건 검색결과]\n${agendaContext}` : '',
    ].filter(Boolean).join('\n\n---\n\n');

    const prompt = `${systemInstruction}

[참고자료]:
${contextParts}

[질문]: ${cleanQuestion}

위 참고자료 기반으로 핵심만 요약해서 답변하세요.`;

    // 5. Gemini 스트리밍 생성
    const resultStream = await streamGeminiResponse(prompt);

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
          for await (const chunk of resultStream) {
            const chunkText = chunk.text;
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
