import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { enqueueMeeting, enqueueCatalog } from '@/lib/committeeRag/pipeline.mjs';
import { CATEGORIES, DOCUMENT_CATEGORIES } from '@/lib/committeeRag/format.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const meetingId = Number(params.get('meetingId'));
    const category = params.get('category');
    const search = (params.get('search') || '').slice(0, 200);
    const page = Math.max(1, Number(params.get('page')) || 1);
    const documentId = params.get('documentId');
    if (documentId && !UUID.test(documentId)) return Response.json({ error: '문서 ID가 올바르지 않습니다.' }, { status: 400 });
    const where = {
      status: { not: 'superseded' },
      ...(meetingId > 0 ? { meetingId } : {}), ...(documentId ? { id: documentId } : {}),
      ...(category && DOCUMENT_CATEGORIES[category] ? { category } : {}),
      ...(search ? { OR: [{ fileName: { contains: search, mode: 'insensitive' } }, { meeting: { title: { contains: search, mode: 'insensitive' } } }] } : {}),
    };
    const [total, documents, statuses, chunks, jobs] = await Promise.all([
      prisma.committee_documents.count({ where }),
      prisma.committee_documents.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20,
        select: { id: true, meetingId: true, fileName: true, sourceUrl: true, fileType: true, category: true, pageCount: true, status: true, active: true, error: true,
          meeting: { select: { title: true, meetingNo: true, postDate: true } }, _count: { select: { chunks: true } },
          ...(documentId ? { pages: { orderBy: { pageNumber: 'asc' }, select: { pageNumber: true, markdown: true, nativeText: true, warnings: true, status: true, extractionMethod: true } } } : {}),
        },
      }),
      prisma.committee_documents.groupBy({ by: ['status'], _count: true, where: { status: { not: 'superseded' } } }),
      prisma.committee_chunks.count({ where: { active: true, embeddingStatus: 'completed' } }),
      getCurrentUser(request)?.role === 'ADMIN' ? prisma.committee_ingestion_jobs.groupBy({ by: ['status'], _count: true }) : [],
    ]);
    return Response.json({ total, page, pages: Math.ceil(total / 20), documents, statuses, chunks, jobs, categories: CATEGORIES });
  } catch (error) {
    console.error('Committee documents:', error.code || error.message);
    return Response.json({ error: error.code === 'P2021' || error.code === 'P2022' ? 'V3 DB 마이그레이션이 필요합니다. prisma/committee_rag_v3.sql을 먼저 적용하세요.' : '자료 목록을 불러오지 못했습니다.' }, { status: 503 });
  }
}

export async function POST(request) {
  if (getCurrentUser(request)?.role !== 'ADMIN') return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === 'enqueue') {
      if (!body.meetingId) {
        await enqueueCatalog(prisma);
        return Response.json({ queued: 1, message: '원본 게시판 전수 수집을 등록했습니다. 마지막 페이지까지 확인하고 게시물·첨부파일을 처리합니다.' });
      }
      const meetingId = Number(body.meetingId);
      if (body.meetingId && (!Number.isInteger(meetingId) || meetingId < 1)) return Response.json({ error: '게시물 ID가 올바르지 않습니다.' }, { status: 400 });
      const meetings = await prisma.committee_meetings.findMany({ where: meetingId ? { id: meetingId } : {}, select: { id: true }, orderBy: { id: 'asc' } });
      for (const meeting of meetings) await enqueueMeeting(prisma, meeting.id);
      return Response.json({ queued: meetings.length, message: '작업을 등록했습니다. 서버 worker가 처리합니다.' });
    }
    if (body.action === 'retry') {
      const result = await prisma.committee_ingestion_jobs.updateMany({ where: { status: 'failed' }, data: { status: 'pending', attempts: 0, nextRetryAt: new Date(), error: null } });
      return Response.json({ queued: result.count });
    }
    if (body.action === 'review-page' && UUID.test(body.documentId || '') && Number.isInteger(body.pageNumber) && body.pageNumber > 0) {
      const document = await prisma.committee_documents.findUnique({ where: { id: body.documentId } });
      if (!document || document.active || document.status !== 'review') return Response.json({ error: '검토 가능한 준비 문서가 아닙니다.' }, { status: 409 });
      const page = await prisma.committee_document_pages.findUnique({ where: { documentId_pageNumber: { documentId: body.documentId, pageNumber: body.pageNumber } } });
      if (!page || page.status !== 'review') return Response.json({ error: '검토 대기 중인 페이지가 아닙니다.' }, { status: 409 });
      if (body.retryOcr) {
        await prisma.$transaction(async tx => {
          await tx.committee_document_pages.delete({ where: { id: page.id } });
          await tx.committee_ingestion_jobs.updateMany({ where: { documentId: body.documentId, status: 'review' }, data: { stage: 'extract', cursor: body.pageNumber - 1, status: 'pending', nextRetryAt: new Date(), attempts: 0 } });
        });
      } else {
        await prisma.committee_document_pages.update({ where: { id: page.id }, data: { status: 'completed', reviewedAt: new Date() } });
        const remaining = await prisma.committee_document_pages.count({ where: { documentId: body.documentId, status: 'review' } });
        if (!remaining) await prisma.committee_ingestion_jobs.updateMany({ where: { documentId: body.documentId, status: 'review' }, data: { status: 'pending', nextRetryAt: new Date(), attempts: 0 } });
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: '지원하지 않는 작업입니다.' }, { status: 400 });
  } catch (error) {
    console.error('Committee ingestion:', error.code || error.message);
    return Response.json({ error: '작업을 등록하지 못했습니다. DB 마이그레이션과 서버 로그를 확인하세요.' }, { status: 503 });
  }
}
