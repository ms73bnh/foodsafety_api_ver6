import { randomUUID } from 'node:crypto';
import { fetchSource, parseDetail, parseListing } from './source.mjs';
import { openPdf, extractPage } from './pdf.mjs';
import { hash, PIPELINE_VERSION, classifyDocument, pageChunks } from './format.mjs';

const MODEL = 'Xenova/multilingual-e5-small-int8';
const DIMENSIONS = 384;
const LEASE_MS = 10 * 60 * 1000;

export async function enqueueCatalog(db) {
  const existing = await db.committee_ingestion_jobs.findUnique({ where: { jobKey: 'catalog' } });
  if (existing && ['pending', 'running', 'retry'].includes(existing.status)) return existing;
  return db.committee_ingestion_jobs.upsert({ where: { jobKey: 'catalog' },
    create: { jobKey: 'catalog', stage: 'catalog', cursor: 1, payload: { pages: [], scanned: 0 } },
    update: { stage: 'catalog', status: 'pending', cursor: 1, attempts: 0, error: null, nextRetryAt: new Date(), payload: { pages: [], scanned: 0 } },
  });
}

async function catalogStep(db, job) {
  const url = `https://www.mfds.go.kr/brd/m_532/list.do?page=${job.cursor || 1}`;
  const listing = parseListing((await fetchSource(url, { maxBytes: 8 * 1024 * 1024 })).toString('utf8'), url);
  if (listing.empty && !listing.rows.length) return { status: 'completed' };
  const signature = hash(listing.rows.map(row => row.seq).sort().join(','));
  if (job.payload?.pages?.includes(signature)) throw new Error('목록 페이지가 반복되었습니다. 전수 수집 완료로 처리하지 않습니다.');
  for (const row of listing.rows) {
    const meeting = await db.committee_meetings.upsert({ where: { seq: row.seq }, create: { ...row, meetingNo: row.title.match(/제?\s*\d+\s*차/)?.[0] || null },
      update: { title: row.title, sourceUrl: row.sourceUrl, ...(row.postDate ? { postDate: row.postDate } : {}) } });
    await enqueueMeeting(db, meeting.id);
  }
  return { status: 'pending', cursor: (job.cursor || 1) + 1, payload: { pages: [...(job.payload?.pages || []), signature], scanned: (job.payload?.scanned || 0) + listing.rows.length } };
}

export async function enqueueMeeting(db, meetingId) {
  const jobKey = `discover:${meetingId}`;
  const existing = await db.committee_ingestion_jobs.findUnique({ where: { jobKey } });
  if (existing && ['pending', 'running', 'retry'].includes(existing.status)) return existing;
  return db.committee_ingestion_jobs.upsert({ where: { jobKey },
    create: { jobKey, meetingId, stage: 'discover' },
    update: { status: 'pending', stage: 'discover', cursor: 0, attempts: 0, error: null, payload: { initialized: false }, nextRetryAt: new Date() },
  });
}

async function queueDocument(db, doc) {
  if (doc.active || doc.status === 'unsupported') return;
  const reusable = ['completed', 'superseded'].includes(doc.status);
  const stage = reusable ? 'activate' : doc.fileType === 'pdf' ? 'extract' : 'chunk';
  await db.committee_ingestion_jobs.upsert({ where: { jobKey: `document:${doc.id}` },
    create: { jobKey: `document:${doc.id}`, meetingId: doc.meetingId, documentId: doc.id, stage },
    update: reusable ? { stage, status: 'pending', nextRetryAt: new Date() } : {},
  });
}

async function registerDocument(db, meeting, source, original, bodyText = '') {
  const sourceHash = hash(source.sourceType === 'body' ? bodyText : original);
  const where = { meetingId_sourceKey_sourceHash_pipelineVersion: { meetingId: meeting.id, sourceKey: source.sourceKey, sourceHash, pipelineVersion: PIPELINE_VERSION } };
  const supported = source.sourceType === 'body' || source.fileType === 'pdf';
  const doc = await db.committee_documents.upsert({ where, update: { observedAt: new Date() }, create: {
    meetingId: meeting.id, ...source, sourceHash, original, category: classifyDocument(source.fileName, source.sourceType),
    markdown: bodyText || null, status: supported ? 'pending' : 'unsupported',
    error: supported ? null : '첨부 목록에는 등록되었으나 이 파일 형식의 텍스트 변환은 지원하지 않습니다.',
  } });
  if (source.sourceType === 'body') {
    await db.committee_document_pages.upsert({ where: { documentId_pageNumber: { documentId: doc.id, pageNumber: 1 } }, update: {}, create: {
      documentId: doc.id, pageNumber: 1, markdown: bodyText, nativeText: bodyText,
      blocks: bodyText ? [{ kind: 'paragraph', text: bodyText }] : [], extractionMethod: 'html', warnings: [],
    } });
    await db.committee_documents.update({ where: { id: doc.id }, data: { pageCount: 1 } });
  }
  await queueDocument(db, doc);
  return doc;
}

// Independent download jobs keep an unavailable attachment from blocking the others.
async function discover(db, job, meeting) {
  let detail = job.payload;
  if (!detail?.initialized) {
    const html = (await fetchSource(meeting.sourceUrl, { maxBytes: 8 * 1024 * 1024 })).toString('utf8');
    detail = { ...parseDetail(html, meeting.sourceUrl), initialized: true };
    await registerDocument(db, meeting, { sourceKey: 'body', sourceType: 'body', fileType: 'html', fileName: `${meeting.title} · 본문`, sourceUrl: meeting.sourceUrl }, Buffer.from(html), detail.text);
    await db.committee_meetings.update({ where: { id: meeting.id }, data: { rawContent: detail.text } });
  }
  const attachment = detail.attachments[job.cursor];
  if (!attachment) return { status: 'completed', payload: { initialized: true, attachments: detail.attachments } };
  if (!['pdf', 'unknown'].includes(attachment.fileType)) {
    await registerDocument(db, meeting, attachment, Buffer.from(attachment.sourceUrl));
  } else {
    const placeholder = await db.committee_documents.upsert({
      where: { meetingId_sourceKey_sourceHash_pipelineVersion: { meetingId: meeting.id, sourceKey: attachment.sourceKey, sourceHash: 'unfetched', pipelineVersion: PIPELINE_VERSION } },
      create: { meetingId: meeting.id, ...attachment, sourceHash: 'unfetched', category: classifyDocument(attachment.fileName, attachment.sourceType) },
      update: {},
    });
    const jobKey = `download:${placeholder.id}`;
    const existing = await db.committee_ingestion_jobs.findUnique({ where: { jobKey } });
    if (!existing || !['pending', 'running', 'retry'].includes(existing.status)) {
      await db.committee_documents.update({ where: { id: placeholder.id }, data: { status: 'pending', error: null } });
      await db.committee_ingestion_jobs.upsert({ where: { jobKey },
        create: { jobKey, meetingId: meeting.id, documentId: placeholder.id, stage: 'download' },
        update: { status: 'pending', stage: 'download', attempts: 0, error: null, nextRetryAt: new Date() },
      });
    }
  }
  return { cursor: job.cursor + 1, status: 'pending', payload: { initialized: true, attachments: detail.attachments } };
}

async function embeddingRequest(texts) {
  if (!process.env.E5_EMBEDDING_URL || !process.env.E5_API_KEY) throw new Error('E5_EMBEDDING_URL 및 E5_API_KEY가 필요합니다.');
  const response = await fetch(process.env.E5_EMBEDDING_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.E5_API_KEY}` },
    body: JSON.stringify({ texts, inputType: 'document', strictTokens: true }), signal: AbortSignal.timeout(280000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.detail || data.error || `임베딩 HTTP ${response.status}`), { tokenCounts: data.tokenCounts });
  if (data.model !== 'Xenova/multilingual-e5-small' || data.dimensions !== DIMENSIONS || data.dtype !== 'int8' || !data.tokenCounts) throw new Error('E5 서버를 V3 토큰 검증 지원 버전으로 배포해야 합니다.');
  if (data.embeddings?.length !== texts.length || data.tokenCounts.length !== texts.length) throw new Error('임베딩 응답 수 불일치');
  for (const [i, vector] of data.embeddings.entries()) {
    if (vector.length !== DIMENSIONS || vector.some(v => !Number.isFinite(v)) || data.tokenCounts[i] > 512) throw new Error('유효하지 않은 벡터/토큰 수');
  }
  return data;
}

async function processDocument(db, job, meeting, { extract = extractPage, embed = embeddingRequest } = {}) {
  const doc = await db.committee_documents.findUniqueOrThrow({ where: { id: job.documentId } });
  if (job.stage === 'download') {
    const bytes = await fetchSource(doc.sourceUrl);
    const fileType = bytes.subarray(0, 4).toString() === '%PDF' ? 'pdf' : doc.fileType;
    if (fileType === 'pdf' && bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('다운로드 응답이 PDF가 아닙니다.');
    await registerDocument(db, meeting, { sourceKey: doc.sourceKey, sourceType: fileType === 'pdf' ? 'pdf' : 'attachment', fileType, fileName: doc.fileName, sourceUrl: doc.sourceUrl }, bytes);
    await db.committee_documents.update({ where: { id: doc.id }, data: { status: 'superseded', error: null } });
    return { status: 'completed' };
  }
  if (job.stage === 'extract') {
    const pdf = await openPdf(doc.original);
    await db.committee_documents.update({ where: { id: doc.id }, data: { pageCount: pdf.getPageCount(), status: 'extracting' } });
    if (job.cursor < pdf.getPageCount()) {
      const number = job.cursor + 1;
      const existing = await db.committee_document_pages.findUnique({ where: { documentId_pageNumber: { documentId: doc.id, pageNumber: number } } });
      if (!existing) {
        const page = await extract(pdf, number);
        await db.committee_document_pages.create({ data: { documentId: doc.id, ...page } });
      }
      return { cursor: number, status: 'pending' };
    }
    const review = await db.committee_document_pages.count({ where: { documentId: doc.id, status: 'review' } });
    if (review) {
      await db.committee_documents.update({ where: { id: doc.id }, data: { status: 'review', error: `${review}개 페이지의 OCR 검토가 필요합니다.` } });
      return { status: 'review' };
    }
    return { stage: 'chunk', cursor: 0, status: 'pending' };
  }
  if (job.stage === 'chunk') {
    const pages = await db.committee_document_pages.findMany({ where: { documentId: doc.id }, orderBy: { pageNumber: 'asc' } });
    if (pages.length !== doc.pageCount || pages.some(p => p.status !== 'completed')) throw new Error('전체 페이지 추출/검토가 완료되지 않았습니다.');
    const label = `${meeting.meetingNo || ''} ${doc.fileName}`.slice(0, 90);
    const rows = pages.flatMap(page => pageChunks(page, label)).map((chunk, orderIndex) => ({
      ...chunk, orderIndex, documentId: doc.id, meetingId: meeting.id, chunkType: doc.sourceType === 'body' ? 'body' : 'pdf',
      chunkVersion: PIPELINE_VERSION, contentHash: hash(chunk.content), active: false, embeddingStatus: 'pending',
    }));
    await db.$transaction(async tx => {
      // Only staging chunks are replaced. Active revisions are immutable.
      if (doc.active) throw new Error('활성 문서는 새 버전으로 재처리해야 합니다.');
      await tx.committee_chunks.deleteMany({ where: { documentId: doc.id, active: false } });
      if (rows.length) await tx.committee_chunks.createMany({ data: rows });
      await tx.committee_documents.update({ where: { id: doc.id }, data: { markdown: pages.map(p => `## ${p.pageNumber}쪽\n\n${p.markdown}`).join('\n\n'), status: 'embedding', error: null } });
    });
    return { stage: 'embed', cursor: 0, status: 'pending' };
  }
  if (job.stage === 'embed') {
    const chunks = await db.committee_chunks.findMany({ where: { documentId: doc.id, embeddingStatus: { not: 'completed' } }, orderBy: { orderIndex: 'asc' }, take: 16 });
    if (!chunks.length) return { stage: 'activate', status: 'pending' };
    const cached = await db.committee_chunks.findMany({ where: { contentHash: { in: chunks.map(c => c.contentHash) }, embeddingModel: MODEL, embeddingDimensions: DIMENSIONS, chunkVersion: PIPELINE_VERSION, embeddingStatus: 'completed', tokenCount: { lte: 512 } }, select: { contentHash: true, embedding: true, tokenCount: true } });
    const reuse = new Map(cached.map(c => [c.contentHash, c]));
    const missing = chunks.filter(c => !reuse.has(c.contentHash));
    if (missing.length) {
      let result;
      try { result = await embed(missing.map(c => c.content)); }
      catch (error) {
        if (error.message.includes('E5_TOKEN_LIMIT') && error.tokenCounts?.length === missing.length) {
          const targets = missing.filter((_, i) => error.tokenCounts[i] > 512);
          await db.$transaction(async tx => {
            for (const target of targets.reverse()) {
              const headerEnd = target.content.indexOf('\n', target.content.indexOf('\n') + 1) + 1;
              const header = target.content.slice(0, headerEnd);
              const body = target.content.slice(headerEnd);
              if (body.length < 4) throw new Error('청크 머리말이 토큰 한도를 초과했습니다. 파일명을 확인하세요.');
              const cut = Math.floor(body.length / 2);
              const first = header + body.slice(0, cut), second = header + body.slice(cut);
              await tx.committee_chunks.updateMany({ where: { documentId: doc.id, orderIndex: { gt: target.orderIndex } }, data: { orderIndex: { increment: 1 } } });
              // Page/block coordinates stay exact. Character offsets are cleared because overlap is split as well.
              await tx.committee_chunks.update({ where: { id: target.id }, data: { content: first, contentHash: hash(first), sourceStart: null, sourceEnd: null } });
              await tx.committee_chunks.create({ data: { documentId: doc.id, meetingId: target.meetingId, chunkType: target.chunkType, chunkVersion: PIPELINE_VERSION, active: false,
                category: target.category, categories: target.categories, pageStart: target.pageStart, pageEnd: target.pageEnd, blockIndex: target.blockIndex,
                content: second, contentHash: hash(second), orderIndex: target.orderIndex + 1 } });
            }
          });
          return { status: 'pending' };
        }
        await db.committee_chunks.updateMany({ where: { id: { in: missing.map(c => c.id) } }, data: { embeddingStatus: 'failed', embeddingError: error.message.slice(0, 500) } });
        throw error;
      }
      missing.forEach((c, i) => reuse.set(c.contentHash, { embedding: JSON.stringify(result.embeddings[i]), tokenCount: result.tokenCounts[i] }));
    }
    await db.$transaction(chunks.map(c => db.committee_chunks.update({ where: { id: c.id }, data: {
      embedding: reuse.get(c.contentHash).embedding, tokenCount: reuse.get(c.contentHash).tokenCount, embeddingStatus: 'completed', embeddingError: null,
      embeddingModel: MODEL, embeddingDimensions: DIMENSIONS, embeddedAt: new Date(),
    } })));
    return { cursor: job.cursor + chunks.length, status: 'pending' };
  }
  if (job.stage === 'activate') {
    await activateDocument(db, doc);
    return { status: 'completed' };
  }
  throw new Error(`알 수 없는 단계: ${job.stage}`);
}

export async function activateDocument(db, doc) {
  await db.$transaction(async tx => {
    // Serialize revision swaps for this meeting; a late old revision cannot replace a newer one.
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock($1::integer)', doc.meetingId);
    const invalid = await tx.$queryRawUnsafe('SELECT count(*)::int AS count FROM committee_chunks WHERE "documentId"=$1::uuid AND ("embeddingStatus" IS DISTINCT FROM \'completed\' OR "embeddingVector" IS NULL OR "embeddingDimensions" IS DISTINCT FROM 384 OR "embeddingModel" IS DISTINCT FROM $2)', doc.id, MODEL);
    if (invalid[0].count) throw new Error('검색 벡터 검증 실패. E5 마이그레이션 및 DB 트리거를 확인하세요.');
    const current = await tx.committee_documents.findUniqueOrThrow({ where: { id: doc.id } });
    const newer = await tx.committee_documents.findFirst({ where: { meetingId: doc.meetingId, sourceKey: doc.sourceKey, active: true, observedAt: { gt: current.observedAt } } });
    if (newer) { await tx.committee_documents.update({ where: { id: doc.id }, data: { status: 'superseded' } }); return; }
    const previous = await tx.committee_documents.findMany({ where: { meetingId: doc.meetingId, sourceKey: doc.sourceKey, active: true }, select: { id: true } });
    await tx.committee_chunks.updateMany({ where: { documentId: { in: previous.map(d => d.id) } }, data: { active: false } });
    await tx.committee_documents.updateMany({ where: { id: { in: previous.map(d => d.id) } }, data: { active: false, status: 'superseded' } });
    await tx.committee_chunks.updateMany({ where: { documentId: doc.id }, data: { active: true } });
    await tx.committee_documents.update({ where: { id: doc.id }, data: { active: true, status: 'completed', error: null } });
    if (doc.sourceType === 'body') await tx.committee_chunks.updateMany({ where: { meetingId: doc.meetingId, documentId: null, chunkType: 'body' }, data: { active: false } });
    // Retire legacy PDF chunks only after all discovered PDF files are complete.
    const unfinished = await tx.committee_documents.count({ where: { meetingId: doc.meetingId, fileType: 'pdf', status: { notIn: ['completed', 'superseded'] } } });
    const discovery = await tx.committee_ingestion_jobs.findUnique({ where: { jobKey: `discover:${doc.meetingId}` } });
    if (!unfinished && discovery?.status === 'completed' && doc.sourceType === 'pdf') await tx.committee_chunks.updateMany({ where: { meetingId: doc.meetingId, documentId: null, chunkType: 'pdf' }, data: { active: false } });
  });
}

export async function claimJob(db) {
  const token = randomUUID();
  const jobs = await db.$queryRawUnsafe(`UPDATE committee_ingestion_jobs SET status='running', "leaseToken"=$1::uuid, "leaseUntil"=$2, "updatedAt"=NOW()
    WHERE id=(SELECT id FROM committee_ingestion_jobs WHERE
      (status IN ('pending','retry') AND "nextRetryAt" <= NOW()) OR (status='running' AND "leaseUntil" < NOW())
      ORDER BY "createdAt", id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, token, new Date(Date.now() + LEASE_MS));
  return jobs[0] || null;
}

export async function runOneJob(db, dependencies = {}) {
  const job = await claimJob(db); if (!job) return { idle: true };
  const token = job.leaseToken;
  try {
    const meeting = job.stage === 'catalog' ? null : await db.committee_meetings.findUniqueOrThrow({ where: { id: job.meetingId } });
    const result = job.stage === 'catalog' ? await catalogStep(db, job) : job.stage === 'discover' ? await discover(db, job, meeting) : await processDocument(db, job, meeting, dependencies);
    const updated = await db.committee_ingestion_jobs.updateMany({ where: { id: job.id, leaseToken: token }, data: { ...result, attempts: 0, error: null, leaseToken: null, leaseUntil: null, nextRetryAt: new Date() } });
    if (!updated.count) throw new Error('작업 임대가 만료되었습니다.');
    const { payload: _payload, ...summary } = result;
    return { id: job.id, stage: job.stage, ...summary };
  } catch (error) {
    const attempts = job.attempts + 1;
    const status = attempts >= 4 ? 'failed' : 'retry';
    await db.committee_ingestion_jobs.updateMany({ where: { id: job.id, leaseToken: token }, data: { status, attempts, error: error.message.slice(0, 1000), leaseToken: null, leaseUntil: null, nextRetryAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** attempts)) } });
    if (job.documentId) await db.committee_documents.updateMany({ where: { id: job.documentId, active: false }, data: { status, error: error.message.slice(0, 1000) } });
    return { id: job.id, status, error: error.message };
  }
}
