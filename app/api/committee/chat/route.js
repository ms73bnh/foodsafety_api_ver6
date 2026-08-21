import prisma from '@/lib/prisma';
import { getEmbedding, cosineSimilarity, getGeminiModel } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { question, history = [] } = await req.json();

    if (!question || !question.trim()) {
      return new Response(JSON.stringify({ error: '질문 내용을 입력해주세요.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanQuestion = question.trim();

    // 1. 사용자 질문을 임베딩 벡터로 변환
    let queryVector = [];
    try {
      queryVector = await getEmbedding(cleanQuestion);
    } catch (embErr) {
      console.warn('Embedding generation failed, falling back to keyword search:', embErr.message);
    }

    // 2. DB에서 모든 안건 및 회의록 데이터 로드
    const allAgendas = await prisma.committee_agendas.findMany({
      include: {
        meeting: true,
      },
      orderBy: { id: 'desc' },
      take: 200, // 최근 200개 안건 검색 대상
    });

    // 3. 하이브리드 유사도 계산 (벡터 코사인 유사도 + 키워드 매칭 가중치)
    const scored = allAgendas.map(item => {
      let score = 0;

      // 벡터 유사도
      if (queryVector.length > 0 && item.embedding) {
        try {
          const vec = JSON.parse(item.embedding);
          score = cosineSimilarity(queryVector, vec);
        } catch (e) {}
      }

      // 키워드 직접 포함 시 가중치 추가
      const lowerQ = cleanQuestion.toLowerCase();
      if (lowerQ.includes(item.ingredientName.toLowerCase())) {
        score += 0.4;
      }
      if (item.result && lowerQ.includes(item.result)) {
        score += 0.15;
      }
      if (item.meeting?.meetingNo && lowerQ.includes(item.meeting.meetingNo)) {
        score += 0.3;
      }

      return {
        ...item,
        score,
      };
    });

    // 상위 6개 관련 안건 추출
    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 6);

    // 4. Gemini 프롬프트 컨텍스트 구성
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

    // 5. Gemini 2.0 Flash 스트리밍 응답 생성
    const model = getGeminiModel();
    const resultStream = await model.generateContentStream(prompt);

    // 6. SSE / Web Stream 형태로 클라이언트에 전송
    const encoder = new TextEncoder();
    const customReadable = new ReadableStream({
      async start(controller) {
        // 첫머리에 참조 데이터 메타정보 전송 (JSON chunk)
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
        controller.enqueue(encoder.encode(`__REF__:${JSON.stringify(refData)}\n\n`));

        try {
          for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(encoder.encode(chunkText));
            }
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
