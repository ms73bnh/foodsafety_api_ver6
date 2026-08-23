import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getEmbedding } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JUNK_KEYWORDS = ['심의위원', '위원장', '참석자', '기타사항', '일시', '장소'];
const CHUNK_SIZE = 500;
const OVERLAP = 100;

function splitIntoChunks(text, size = CHUNK_SIZE, overlap = OVERLAP) {
  if (!text || text.length <= size) return text ? [text] : [];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

// GET: 청킹 현황
export async function GET() {
  const [totalMeetings, chunkedMeetings, totalChunks, embeddedChunks] = await Promise.all([
    prisma.committee_meetings.count(),
    prisma.committee_meetings.count({ where: { chunks: { some: {} } } }),
    prisma.committee_chunks.count(),
    prisma.committee_chunks.count({ where: { NOT: { embedding: null } } }),
  ]);
  return NextResponse.json({ totalMeetings, chunkedMeetings, pendingMeetings: totalMeetings - chunkedMeetings, totalChunks, embeddedChunks });
}

// POST: 배치 청킹 + 임베딩
// body: { batch: 3, offset: 0, mode: 'missing'|'all' }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(parseInt(body.batch || '3'), 5);
  const offset = parseInt(body.offset || '0');
  const mode = body.mode || 'missing';

  // re-embed 모드: 청크는 있지만 임베딩이 null인 청크만 재처리
  if (mode === 're-embed') {
    const chunks = await prisma.committee_chunks.findMany({
      where: { embedding: null },
      orderBy: { id: 'asc' },
      take: batchSize * 2, // 청크 단위 처리 (딜레이 포함이므로 작게)
    });

    if (chunks.length === 0) return NextResponse.json({ done: true, processed: 0 });

    let embedded = 0;
    const errors = [];
    for (const chunk of chunks) {
      let vec = [];
      let errMsg = null;
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.embedContent({ model: 'gemini-embedding-001', contents: chunk.content.substring(0, 2048) });
        vec = result.embeddings?.[0]?.values || [];
      } catch (e) {
        errMsg = e.message?.substring(0, 100);
        errors.push(errMsg);
      }
      if (vec.length > 0) {
        await prisma.committee_chunks.update({ where: { id: chunk.id }, data: { embedding: JSON.stringify(vec) } });
        embedded++;
        await new Promise(r => setTimeout(r, 500));
      } else {
        await new Promise(r => setTimeout(r, errMsg ? 2000 : 500));
      }
    }

    const remaining = await prisma.committee_chunks.count({ where: { embedding: null } });
    return NextResponse.json({ done: remaining === 0 || chunks.length < batchSize * 2, processed: chunks.length, embedded, remaining, nextOffset: 0, errors: errors.slice(0, 3) });
  }

  const where = mode === 'all' ? {} : { chunks: { none: {} } };

  const meetings = await prisma.committee_meetings.findMany({
    where,
    orderBy: { id: 'asc' },
    skip: mode === 'all' ? offset : 0,
    take: batchSize,
    include: {
      agendas: { select: { ingredientName: true, result: true, agendaType: true, meetingId: true } },
    },
  });

  if (meetings.length === 0) return NextResponse.json({ done: true, processed: 0 });

  const results = [];

  for (const meeting of meetings) {
    if (mode === 'all') {
      await prisma.committee_chunks.deleteMany({ where: { meetingId: meeting.id } });
    }

    const chunksToCreate = [];

    // 1. 안건 청크 (원료명 + 결과 + 회차 포함 → 세부 안건 질문에 최적)
    const validAgendas = meeting.agendas.filter(
      a => a.ingredientName?.length >= 2 && !JUNK_KEYWORDS.some(k => a.ingredientName.includes(k))
    );
    for (let i = 0; i < validAgendas.length; i++) {
      const a = validAgendas[i];
      const content = `[안건] ${meeting.title} (${meeting.meetingNo || ''} ${meeting.meetingDate || meeting.postDate || ''})\n원료명: ${a.ingredientName}\n심의 구분: ${a.agendaType || '신규인정'}\n심의 결과: ${a.result}`;
      chunksToCreate.push({ chunkType: 'agenda', content, orderIndex: i });
    }

    // 2. PDF 청크
    if (meeting.pdfContent) {
      const pdfChunks = splitIntoChunks(meeting.pdfContent);
      pdfChunks.forEach((c, i) => {
        const content = `[PDF] ${meeting.title} (${meeting.meetingNo || ''} ${meeting.meetingDate || meeting.postDate || ''})\n${c}`;
        chunksToCreate.push({ chunkType: 'pdf', content, orderIndex: i });
      });
    }

    // 3. 본문 청크 (rawContent)
    if (meeting.rawContent) {
      const bodyChunks = splitIntoChunks(meeting.rawContent);
      bodyChunks.forEach((c, i) => {
        const content = `[본문] ${meeting.title} (${meeting.meetingNo || ''} ${meeting.meetingDate || meeting.postDate || ''})\n${c}`;
        chunksToCreate.push({ chunkType: 'body', content, orderIndex: i });
      });
    }

    // 임베딩 생성 + DB 저장
    let embeddedCount = 0;
    for (const chunk of chunksToCreate) {
      let embedding = null;
      try {
        const vec = await getEmbedding(chunk.content);
        if (vec?.length > 0) { embedding = JSON.stringify(vec); embeddedCount++; }
      } catch (e) {}
      await prisma.committee_chunks.create({
        data: { meetingId: meeting.id, ...chunk, embedding },
      });
    }

    results.push({ id: meeting.id, title: meeting.title.substring(0, 30), chunks: chunksToCreate.length, embedded: embeddedCount });
  }

  return NextResponse.json({ done: meetings.length < batchSize, processed: meetings.length, nextOffset: mode === 'all' ? offset + meetings.length : 0, results });
}
