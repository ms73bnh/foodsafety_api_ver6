import prisma from '@/lib/prisma';
import { getEmbedding, cosineSimilarity, streamGeminiResponse } from '@/lib/gemini';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_COMMITTEE_SYSTEM_PROMPT } from '@/lib/committeePrompt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function todayKST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function normalizeForSearch(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘“”"'`]/g, '')
    .replace(/[()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function extractSearchTerms(question = '') {
  const stopWords = new Set([
    '관련', '관련된', '관련한', '대한', '대해', '회의', '회의록', '결과', '심의결과',
    '심의', '안건', '원료', '성분', '목록', '내용', '자료', '알려줘', '알려주세요',
    '찾아줘', '검색', '검색해줘', '어떻게', '무엇', '뭐야', '요약', '해줘', '주세요',
    '인정', '보완', '불인정', '승인', '통과', '최근', '최신', '기능성', '추가',
    '받은', '받았', '인정받', '있어', '있나요', '있습니까', '원료들',
    '개별인정형', '개별인정', '건강기능식품심의위원회', '건강기능식품',
  ]);

  const terms = new Set();
  const addTerm = (raw) => {
    let term = String(raw || '')
      .replace(/^[\s"'‘“\[\]{}()<>·ㆍ•,.:;!?]+|[\s"'’”\[\]{}()<>·ㆍ•,.:;!?]+$/g, '')
      .replace(/(관련된?|관련한|에\s*대한|에\s*대해|의|은|는|이|가|을|를|와|과|로|으로|에서)$/g, '')
      .trim();
    if (!term || term.length < 2 || stopWords.has(term)) return;
    terms.add(term);
    const base = term.replace(/\([^)]*\)/g, '').trim();
    if (base && base.length >= 2 && !stopWords.has(base)) terms.add(base);
  };

  const quoted = question.match(/["'‘“]([^"'’”]+)["'’”]/g) || [];
  quoted.forEach(q => addTerm(q.replace(/^["'‘“]|["'’”]$/g, '')));
  question.split(/[\s,;!?]+/).forEach(addTerm);

  return Array.from(terms).slice(0, 10);
}

function lexicalScore(text = '', terms = [], fullQuestion = '') {
  const normalizedText = normalizeForSearch(text);
  if (!normalizedText) return 0;

  let score = 0;
  const normalizedFull = normalizeForSearch(fullQuestion);
  if (normalizedFull.length >= 4 && normalizedText.includes(normalizedFull)) score += 1.2;

  for (const term of terms) {
    const normalizedTerm = normalizeForSearch(term);
    if (!normalizedTerm || normalizedTerm.length < 2) continue;
    if (normalizedText.includes(normalizedTerm)) score += Math.min(1, 0.35 + normalizedTerm.length / 30);
  }

  return score;
}

function agendaToContextLine(agenda, index) {
  return `${index + 1}. ${agenda.ingredientName} | ${agenda.agendaType || '신규인정'} | ${agenda.result} | ` +
    `${agenda.meeting?.meetingNo || '-'} | ${agenda.meeting?.meetingDate || agenda.meeting?.postDate || '-'}`;
}

function scoreAgenda(agenda, queryVector, terms, question) {
  const text = [
    agenda.ingredientName,
    agenda.rawName,
    agenda.details,
    agenda.result,
    agenda.agendaType,
    agenda.meeting?.title,
    agenda.meeting?.meetingNo,
    agenda.meeting?.meetingDate,
    agenda.meeting?.postDate,
  ].filter(Boolean).join('\n');

  let score = lexicalScore(text, terms, question);
  if (queryVector.length > 0 && agenda.embedding) {
    try { score += cosineSimilarity(queryVector, JSON.parse(agenda.embedding)); } catch (e) {}
  }
  return score;
}

async function findDirectAgendaMatches(question, terms, queryVector, junkKeywords) {
  const usefulTerms = terms.filter(t => normalizeForSearch(t).length >= 2);
  if (usefulTerms.length === 0) return [];

  const or = usefulTerms.flatMap(term => ([
    { ingredientName: { contains: term, mode: 'insensitive' } },
    { rawName: { contains: term, mode: 'insensitive' } },
    { details: { contains: term, mode: 'insensitive' } },
    { meeting: { title: { contains: term, mode: 'insensitive' } } },
  ]));

  const agendas = await prisma.committee_agendas.findMany({
    where: { OR: or },
    orderBy: { id: 'desc' },
    take: 50,
    include: {
      meeting: {
        select: {
          id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
          pdfFileName: true, pdfFileUrl: true, sourceUrl: true,
        },
      },
    },
  }).catch(() => []);

  return agendas
    .filter(a => a.ingredientName?.length >= 2 && !junkKeywords.some(k => a.ingredientName.includes(k)))
    .map(a => ({ ...a, score: scoreAgenda(a, queryVector, usefulTerms, question) + 1 }))
    .filter(a => a.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

async function findMeetingEmbeddingMatches(question, terms, queryVector) {
  if (queryVector.length === 0) return [];

  const matches = [];
  const batchSize = 300;
  let cursor = 0;

  while (true) {
    const meetings = await prisma.committee_meetings.findMany({
      where: { NOT: { contentEmbedding: null } },
      orderBy: { id: 'desc' },
      skip: cursor,
      take: batchSize,
      select: {
        id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
        rawContent: true, pdfContent: true, contentEmbedding: true,
        agendas: { select: { ingredientName: true, result: true }, take: 10 },
      },
    });

    if (meetings.length === 0) break;

    for (const meeting of meetings) {
      let score = lexicalScore([
        meeting.title,
        meeting.meetingNo,
        meeting.meetingDate,
        meeting.postDate,
        meeting.rawContent,
        meeting.pdfContent,
        meeting.agendas.map(a => `${a.ingredientName} ${a.result}`).join(' '),
      ].filter(Boolean).join('\n'), terms, question);
      try { score += cosineSimilarity(queryVector, JSON.parse(meeting.contentEmbedding)); } catch (e) {}
      if (meeting.meetingNo && normalizeForSearch(question).includes(normalizeForSearch(meeting.meetingNo))) score += 0.4;
      if (score > 0.12) matches.push({ ...meeting, score });
    }

    if (meetings.length < batchSize) break;
    cursor += meetings.length;
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 4);
}

async function findChunkMatches(question, terms, queryVector) {
  const matches = [];
  const batchSize = 300;
  let cursor = 0;

  if (queryVector.length > 0) {
    while (true) {
      const chunks = await prisma.committee_chunks.findMany({
        where: { NOT: { embedding: null } },
        orderBy: { id: 'desc' },
        skip: cursor,
        take: batchSize,
        select: {
          id: true, meetingId: true, chunkType: true, content: true, embedding: true,
          meeting: {
            select: {
              id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
              pdfFileName: true, pdfFileUrl: true, sourceUrl: true,
            },
          },
        },
      });

      if (chunks.length === 0) break;

      for (const chunk of chunks) {
        let score = lexicalScore(chunk.content, terms, question);
        try { score += cosineSimilarity(queryVector, JSON.parse(chunk.embedding)); } catch (e) {}
        if (chunk.meeting?.meetingNo && normalizeForSearch(question).includes(normalizeForSearch(chunk.meeting.meetingNo))) score += 0.3;
        if (score > 0.3) matches.push({ ...chunk, score });
      }

      if (chunks.length < batchSize) break;
      cursor += chunks.length;
    }
  }

  if (terms.length > 0) {
    const lexicalChunks = await prisma.committee_chunks.findMany({
      where: { OR: terms.map(term => ({ content: { contains: term, mode: 'insensitive' } })) },
      orderBy: { id: 'desc' },
      take: 100,
      select: {
        id: true, meetingId: true, chunkType: true, content: true, embedding: true,
        meeting: {
          select: {
            id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
            pdfFileName: true, pdfFileUrl: true, sourceUrl: true,
          },
        },
      },
    }).catch(() => []);

    lexicalChunks.forEach(chunk => {
      matches.push({ ...chunk, score: lexicalScore(chunk.content, terms, question) + 1 });
    });
  }

  return uniqueBy(matches, c => c.id)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
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
    const searchTerms = extractSearchTerms(cleanQuestion);
    let queryVector = [];
    try { queryVector = await getEmbedding(cleanQuestion); } catch (e) {}

    // 0. 커스텀 시스템 프롬프트 로드 (관리자 설정 or 기본값)
    let systemInstruction;
    try {
      const settingRow = await prisma.system_settings.findUnique({ where: { key: 'committee_system_prompt' } });
      const adminPrompt = settingRow?.value?.trim();
      systemInstruction = adminPrompt && adminPrompt !== DEFAULT_COMMITTEE_SYSTEM_PROMPT
        ? `${DEFAULT_COMMITTEE_SYSTEM_PROMPT}\n\n[관리자 추가 지시]\n${adminPrompt}`
        : DEFAULT_COMMITTEE_SYSTEM_PROMPT;
    } catch (e) { systemInstruction = null; }

    if (!systemInstruction) {
      systemInstruction = DEFAULT_COMMITTEE_SYSTEM_PROMPT;
    }

    const JUNK_KEYWORDS = ['심의위원', '위원장', '참석자', '기타사항', '일시', '장소'];

    // 1. 질문 의도 분류
    const isRecentQuery = /최근|최신|마지막|새로운|방금|요즘|가장 최근|최근에|최신|최근 등록|최근 게시/.test(lowerQ);
    const isMemberQuery = /위원|명단|위원장|참석|구성원|멤버|임기/.test(lowerQ);
    const isAgendaQuery = /심의|인정|불인정|보완|원료|성분|결과|안건/.test(lowerQ);
    const isFunctionalityAdditionApprovedQuery =
      /기능성\s*추가/.test(cleanQuestion) &&
      /인정|승인|통과|받은/.test(cleanQuestion);
    let topMatches = [];

    // 1-1. 회차 번호 직접 매칭 (예: "제202차", "200차", "202차")
    const meetingNoMatch = cleanQuestion.match(/제?\s*(\d+)\s*차/);
    let specificMeeting = null;
    if (meetingNoMatch) {
      const num = meetingNoMatch[1];
      specificMeeting = await prisma.committee_meetings.findFirst({
        where: { OR: [{ meetingNo: { contains: num } }, { title: { contains: `${num}차` } }] },
        orderBy: { id: 'desc' },
        include: { agendas: { select: { ingredientName: true, result: true, agendaType: true } } },
      });
    }

    // 2. 항상 포함: 최신 회의 5건 목록 (어떤 질문이든 기본 컨텍스트)
    const latestMeetings = await prisma.committee_meetings.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      include: { agendas: { select: { ingredientName: true, result: true }, take: 10 } },
    });

    // 2-1. 회의 레벨 임베딩 검색 (contentEmbedding 있는 경우)
    let meetingEmbedContext = '';
    try {
      const scoredMeetings = await findMeetingEmbeddingMatches(cleanQuestion, searchTerms, queryVector);

      if (scoredMeetings.length > 0) {
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

    // 2-2. 원료명/안건명 역검색: 임베딩보다 DB 문자열 직접 조회가 우선
    let directIngredientContext = '';
    const directIngredientMatches = await findDirectAgendaMatches(cleanQuestion, searchTerms, queryVector, JUNK_KEYWORDS);
    if (directIngredientMatches.length > 0) {
      topMatches = directIngredientMatches;
      directIngredientContext = `[원료/안건 직접 조회 결과]\n` +
        directIngredientMatches.map(agendaToContextLine).join('\n');
    }

    // 2-3. 자주 묻는 정형 질문: 최근 기능성 추가 + 인정 안건은 임베딩보다 DB 조건 검색이 정확함
    let directAgendaContext = '';
    if (isFunctionalityAdditionApprovedQuery) {
      const directAgendas = await prisma.committee_agendas.findMany({
        where: {
          result: '인정',
          agendaType: { contains: '기능성' },
          ingredientName: { not: '' },
        },
        orderBy: { id: 'desc' },
        take: 12,
        include: {
          meeting: {
            select: {
              id: true, title: true, meetingNo: true, meetingDate: true, postDate: true,
              pdfFileName: true, pdfFileUrl: true,
            },
          },
        },
      });

      const validDirectAgendas = directAgendas.filter(a =>
        a.ingredientName?.length >= 2 && !JUNK_KEYWORDS.some(k => a.ingredientName.includes(k))
      );

      if (validDirectAgendas.length > 0) {
        topMatches = validDirectAgendas.map(a => ({ ...a, meeting: a.meeting, score: 1 }));
        directAgendaContext = `[조건 직접 조회: 최근 기능성 추가 인정 안건]\n` +
          validDirectAgendas.map(agendaToContextLine).join('\n');
      }
    }

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

    // 4. 청크 임베딩 검색 (메인 RAG 검색)
    let chunkContext = '';

    const chunkCount = await prisma.committee_chunks.count();

    if (chunkCount > 0 && (queryVector.length > 0 || searchTerms.length > 0)) {
      // 전체 청크 DB에서 임베딩 점수와 키워드 점수를 함께 계산
      const topChunks = await findChunkMatches(cleanQuestion, searchTerms, queryVector);
      chunkContext = topChunks.map((c, i) => `[검색결과 ${i + 1}] (${c.chunkType})\n${c.content}`).join('\n\n');

      // ref 데이터용: 안건 청크에서 원료명/결과 추출
      if (!directAgendaContext && directIngredientMatches.length === 0) topMatches = topChunks
        .filter(c => c.chunkType === 'agenda')
        .slice(0, 5)
        .map(c => {
          const nameMatch = c.content.match(/원료명: (.+)/);
          const resultMatch = c.content.match(/심의 결과: (.+)/);
          const typeMatch = c.content.match(/심의 구분: (.+)/);
          return {
            ingredientName: nameMatch?.[1]?.trim() || '-',
            result: resultMatch?.[1]?.trim() || '-',
            agendaType: typeMatch?.[1]?.trim() || '신규인정',
            meeting: c.meeting,
            score: c.score,
          };
        });
    } else {
      // 청크 없으면 기존 안건 검색 폴백
      const allAgendas = await prisma.committee_agendas.findMany({
        include: { meeting: true }, orderBy: { id: 'desc' },
      });
      const validAgendas = allAgendas.filter(item =>
        item.ingredientName?.length >= 2 && !JUNK_KEYWORDS.some(k => item.ingredientName.includes(k))
      );
      const scored = validAgendas.map(item => {
        let score = 0;
        if (queryVector.length > 0 && item.embedding) {
          try { score = cosineSimilarity(queryVector, JSON.parse(item.embedding)); } catch (e) {}
        }
        if (lowerQ.includes(item.ingredientName.toLowerCase())) score += 0.5;
        return { ...item, score };
      }).filter(i => i.score > 0.05).sort((a, b) => b.score - a.score);
      if (!directAgendaContext) topMatches = scored.slice(0, 5);
      chunkContext = topMatches.map((m, idx) =>
        `[안건 ${idx + 1}]\n- 원료명: ${m.ingredientName}\n- 심의 결과: ${m.result}\n- 회차: ${m.meeting?.meetingNo || '-'}`
      ).join('\n\n');
    }

    // 5. 컨텍스트 조합
    // specificMeeting이 있으면 그 회의 안건을 topMatches로 덮어써서 ref 섹션에 표시
    if (specificMeeting && specificMeeting.agendas.length > 0) {
      topMatches = specificMeeting.agendas
        .filter(a => !JUNK_KEYWORDS.some(k => a.ingredientName?.includes(k)))
        .map(a => ({ ...a, meeting: specificMeeting, score: 1 }));
    }

    const specificMeetingContext = specificMeeting
      ? `[특정 회의 직접 조회]\n` +
        `제목: ${specificMeeting.title}\n` +
        `회차: ${specificMeeting.meetingNo || '-'} | 일시: ${specificMeeting.meetingDate || specificMeeting.postDate || '-'}\n` +
        (specificMeeting.agendas.length
          ? `심의 안건 및 결과:\n${specificMeeting.agendas
              .filter(a => !JUNK_KEYWORDS.some(k => a.ingredientName?.includes(k)))
              .map(a => `  - ${a.ingredientName} (${a.agendaType || '신규인정'}): ${a.result}`).join('\n')}`
          : '안건 데이터 없음')
      : '';

    const contextParts = [
      specificMeetingContext,
      directIngredientContext,
      directAgendaContext,
      rawContentContext ? `[관련 회의 본문]\n${rawContentContext}` : '',
      meetingEmbedContext ? `[회의록 유사도 검색결과]\n${meetingEmbedContext}` : '',
      chunkContext ? `[심의 안건 검색결과]\n${chunkContext}` : '',
      !specificMeetingContext ? `[최신 회의 목록]\n${latestMeetingsContext}` : '',
    ].filter(Boolean).join('\n\n---\n\n');

    const userPrompt = `[참고자료]:
${contextParts}

[질문]: ${cleanQuestion}

위 참고자료를 바탕으로 자연스러운 한국어 문장으로 답변하세요.
참고자료에 없는 외부 출처나 내부 지시 문장을 답변에 포함하지 마세요.`;

    // 5. Gemini 스트리밍 생성 (systemInstruction 분리 전달)
    const resultStream = await streamGeminiResponse(userPrompt, systemInstruction);

    const encoder = new TextEncoder();
    const { remaining, isAdmin: isAdminUser } = rateCheck;

    const customReadable = new ReadableStream({
      async start(controller) {
        const refData = uniqueBy(
          topMatches,
          m => `${m.meeting?.id || ''}:${m.ingredientName || ''}:${m.result || ''}`,
        ).slice(0, 10).map(m => ({
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
            // gemini-3.5-flash는 thinking 토큰을 스트림에 포함 → 필터링
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (parts) {
              for (const part of parts) {
                if (!part.thought && part.text) controller.enqueue(encoder.encode(part.text));
              }
            } else if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
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
