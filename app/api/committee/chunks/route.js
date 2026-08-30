import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  getEmbeddings,
} from '@/lib/e5';
import {
  CHUNK_OVERLAP,
  CHUNK_TARGET_SIZE,
  CHUNK_VERSION,
  chunkContentHash,
  splitIntoSemanticChunks,
} from '@/lib/committeeChunks';
import { extractPdfTextFromUrl } from '@/lib/committeePdf';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JUNK_KEYWORDS = ['심의위원', '위원장', '참석자', '기타사항', '일시', '장소'];

function buildMeetingChunks(meeting) {
  const chunks = [];
  const meetingLabel = `${meeting.title} (${meeting.meetingNo || ''} ${meeting.meetingDate || meeting.postDate || ''})`;
  const validAgendas = meeting.agendas.filter(
    agenda => agenda.ingredientName?.length >= 2 && !JUNK_KEYWORDS.some(keyword => agenda.ingredientName.includes(keyword)),
  );

  validAgendas.forEach((agenda, index) => {
    const content = [
      `[안건] ${meetingLabel}`,
      `원료명: ${agenda.ingredientName}`,
      `심의 구분: ${agenda.agendaType || '신규인정'}`,
      `심의 결과: ${agenda.result}`,
      agenda.details ? `상세 내용: ${agenda.details}` : '',
    ].filter(Boolean).join('\n');
    chunks.push({ chunkType: 'agenda', content, orderIndex: index });
  });

  if (meeting.pdfContent) {
    splitIntoSemanticChunks(meeting.pdfContent).forEach((text, index) => {
      chunks.push({ chunkType: 'pdf', content: `[PDF] ${meetingLabel}\n${text}`, orderIndex: index });
    });
  }

  if (meeting.rawContent) {
    splitIntoSemanticChunks(meeting.rawContent).forEach((text, index) => {
      chunks.push({ chunkType: 'body', content: `[본문] ${meetingLabel}\n${text}`, orderIndex: index });
    });
  }

  const unique = new Map();
  for (const chunk of chunks) {
    const contentHash = chunkContentHash(chunk.content);
    if (!unique.has(contentHash)) unique.set(contentHash, { ...chunk, contentHash });
  }
  return Array.from(unique.values());
}

async function reusableEmbeddingMap(contentHashes = []) {
  if (contentHashes.length === 0) return new Map();
  const rows = await prisma.committee_chunks.findMany({
    where: {
      contentHash: { in: contentHashes },
      embeddingStatus: 'completed',
      embeddingModel: EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
      embedding: { not: null },
    },
    select: { contentHash: true, embedding: true },
  });
  return new Map(rows.map(row => [row.contentHash, row.embedding]));
}

async function resolveEmbeddings(chunks, reusable = new Map()) {
  const resolved = new Map(reusable);
  const errors = [];
  let apiCalls = 0;

  const unresolvedByHash = new Map();
  for (const chunk of chunks) {
    if (!resolved.has(chunk.contentHash)) unresolvedByHash.set(chunk.contentHash, chunk.content);
  }
  const unresolved = Array.from(unresolvedByHash, ([contentHash, content]) => ({ contentHash, content }));

  for (let index = 0; index < unresolved.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = unresolved.slice(index, index + EMBEDDING_BATCH_SIZE);
    try {
      apiCalls++;
      const vectors = await getEmbeddings(batch.map(item => item.content), { inputType: 'document' });
      batch.forEach((item, vectorIndex) => {
        const vector = vectors[vectorIndex] || [];
        if (vector.length === EMBEDDING_DIMENSIONS) resolved.set(item.contentHash, JSON.stringify(vector));
      });
    } catch (error) {
      errors.push(error.message?.substring(0, 300) || '알 수 없는 임베딩 오류');
    }
  }

  const now = new Date();
  const rows = chunks.map(chunk => {
    const embedding = resolved.get(chunk.contentHash) || null;
    return {
      ...chunk,
      chunkVersion: CHUNK_VERSION,
      embedding,
      embeddingModel: embedding ? EMBEDDING_MODEL : null,
      embeddingDimensions: embedding ? EMBEDDING_DIMENSIONS : null,
      embeddingStatus: embedding ? 'completed' : 'failed',
      embeddingError: embedding ? null : (errors.at(-1) || '임베딩 결과가 비어 있습니다.'),
      embeddedAt: embedding ? now : null,
    };
  });

  return { rows, errors, apiCalls };
}

export async function GET() {
  const [totalMeetings, chunkedMeetings, totalChunks, embeddedChunks, pendingChunks, failedChunks] = await Promise.all([
    prisma.committee_meetings.count(),
    prisma.committee_meetings.count({ where: { chunks: { some: {} } } }),
    prisma.committee_chunks.count(),
    prisma.committee_chunks.count({ where: {
      embeddingStatus: 'completed',
      embeddingModel: EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
    } }),
    prisma.committee_chunks.count({ where: { embeddingStatus: 'pending' } }),
    prisma.committee_chunks.count({ where: { embeddingStatus: 'failed' } }),
  ]);
  return NextResponse.json({
    totalMeetings,
    chunkedMeetings,
    pendingMeetings: totalMeetings - chunkedMeetings,
    totalChunks,
    embeddedChunks,
    pendingChunks,
    failedChunks,
    chunkVersion: CHUNK_VERSION,
    chunkTargetSize: CHUNK_TARGET_SIZE,
    overlap: CHUNK_OVERLAP,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(Math.max(parseInt(body.batch || '3'), 1), 5);
  const offset = Math.max(parseInt(body.offset || '0'), 0);
  const mode = body.mode || 'missing';

  if (mode === 're-embed') {
    if (body.retryFailed) {
      await prisma.committee_chunks.updateMany({
        where: { embeddingStatus: 'failed' },
        data: { embeddingStatus: 'pending', embeddingError: null },
      });
    }

    const chunks = await prisma.committee_chunks.findMany({
      where: { embeddingStatus: 'pending' },
      orderBy: { id: 'asc' },
      take: batchSize * EMBEDDING_BATCH_SIZE,
      select: { id: true, meetingId: true, chunkType: true, content: true, contentHash: true, orderIndex: true },
    });

    if (chunks.length === 0) return NextResponse.json({ done: true, processed: 0, embedded: 0, apiCalls: 0 });

    const prepared = chunks.map(chunk => ({
      ...chunk,
      contentHash: chunk.contentHash || chunkContentHash(chunk.content),
    }));
    const reusable = await reusableEmbeddingMap(prepared.map(chunk => chunk.contentHash));
    const { rows, errors, apiCalls } = await resolveEmbeddings(prepared, reusable);

    await prisma.$transaction(rows.map(row => prisma.committee_chunks.update({
      where: { id: row.id },
      data: {
        contentHash: row.contentHash,
        chunkVersion: CHUNK_VERSION,
        embedding: row.embedding,
        embeddingModel: row.embeddingModel,
        embeddingDimensions: row.embeddingDimensions,
        embeddingStatus: row.embeddingStatus,
        embeddingError: row.embeddingError,
        embeddedAt: row.embeddedAt,
      },
    })));

    const [remaining, failed] = await Promise.all([
      prisma.committee_chunks.count({ where: { embeddingStatus: 'pending' } }),
      prisma.committee_chunks.count({ where: { embeddingStatus: 'failed' } }),
    ]);
    const embedded = rows.filter(row => row.embeddingStatus === 'completed').length;
    return NextResponse.json({
      done: remaining === 0,
      processed: rows.length,
      embedded,
      remaining,
      failed,
      apiCalls,
      reused: rows.filter(row => reusable.has(row.contentHash)).length,
      errors: errors.slice(0, 3),
      nextOffset: 0,
    });
  }

  const where = mode === 'all' ? {} : { chunks: { none: {} } };
  const meetings = await prisma.committee_meetings.findMany({
    where,
    orderBy: { id: 'asc' },
    skip: mode === 'all' ? offset : 0,
    take: batchSize,
    include: {
      agendas: {
        select: { ingredientName: true, result: true, agendaType: true, details: true },
        orderBy: { orderIndex: 'asc' },
      },
    },
  });

  if (meetings.length === 0) return NextResponse.json({ done: true, processed: 0, nextOffset: offset });

  const results = [];
  for (const meeting of meetings) {
    if (!meeting.pdfContent && meeting.pdfFileUrl) {
      try {
        const text = await extractPdfTextFromUrl(meeting.pdfFileUrl, meeting.sourceUrl);
        if (text) {
          meeting.pdfContent = text;
          await prisma.committee_meetings.update({
            where: { id: meeting.id },
            data: { pdfContent: text },
          });
        }
      } catch (pdfErr) {
        console.warn(`[Chunks PDF text fetch error for meeting ${meeting.id}]:`, pdfErr.message);
      }
    }

    const chunks = buildMeetingChunks(meeting);
    const reusable = await reusableEmbeddingMap(chunks.map(chunk => chunk.contentHash));
    const { rows, errors, apiCalls } = await resolveEmbeddings(chunks, reusable);

    await prisma.$transaction(async transaction => {
      if (mode === 'all') await transaction.committee_chunks.deleteMany({ where: { meetingId: meeting.id } });
      if (rows.length > 0) {
        await transaction.committee_chunks.createMany({
          data: rows.map(row => ({
            meetingId: meeting.id,
            chunkType: row.chunkType,
            content: row.content,
            contentHash: row.contentHash,
            chunkVersion: row.chunkVersion,
            embedding: row.embedding,
            embeddingModel: row.embeddingModel,
            embeddingDimensions: row.embeddingDimensions,
            embeddingStatus: row.embeddingStatus,
            embeddingError: row.embeddingError,
            embeddedAt: row.embeddedAt,
            orderIndex: row.orderIndex,
          })),
        });
      }
    });

    const embedded = rows.filter(row => row.embeddingStatus === 'completed').length;
    results.push({
      id: meeting.id,
      title: meeting.title.substring(0, 30),
      chunks: rows.length,
      embedded,
      failed: rows.length - embedded,
      apiCalls,
      reused: rows.filter(row => reusable.has(row.contentHash)).length,
      errors: errors.slice(0, 1),
    });
  }

  return NextResponse.json({
    done: meetings.length < batchSize,
    processed: meetings.length,
    nextOffset: mode === 'all' ? offset + meetings.length : 0,
    results,
  });
}
