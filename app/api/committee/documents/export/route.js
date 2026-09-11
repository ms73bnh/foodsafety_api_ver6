import prisma from '@/lib/prisma';
import { exportMarkdown, CATEGORIES, heading } from '@/lib/committeeRag/format.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const meetingId = Number(params.get('meetingId'));
  const documentId = params.get('documentId');
  const category = params.get('category') || '';
  if ((params.has('meetingId') && (!Number.isInteger(meetingId) || meetingId < 1)) || (category && !CATEGORIES[category])) return Response.json({ error: '다운로드 조건이 올바르지 않습니다.' }, { status: 400 });
  if (documentId && !/^[a-f0-9-]{36}$/i.test(documentId)) return Response.json({ error: '문서 ID가 올바르지 않습니다.' }, { status: 400 });
  const where = { ...(meetingId ? { meetingId } : {}), ...(documentId ? { id: documentId } : { active: true }) };
  try {
    // Enumerate IDs once to make this download a consistent revision selection.
    const documents = await prisma.committee_documents.findMany({ where: { ...where, ...(category ? { chunks: { some: { OR: [{ category }, { categories: { has: category } }] } } } : {}) }, select: { id: true, meetingId: true, fileName: true }, orderBy: [{ meetingId: 'asc' }, { fileName: 'asc' }, { id: 'asc' }] });
    const topicWhere = category ? { OR: [{ category }, { categories: { has: category } }] } : {};
    const legacyWhere = { documentId: null, active: true, ...(meetingId ? { meetingId } : {}), ...topicWhere };
    const legacyCount = documentId ? 0 : await prisma.committee_chunks.count({ where: legacyWhere });
    if (!documents.length && !legacyCount) return Response.json({ error: '다운로드할 자료가 없습니다. 문서 처리 상태를 확인하세요.' }, { status: 404 });
    const encoder = new TextEncoder();
    let index = 0, legacyCursor = 0;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(['# 건강기능식품심의위원회 · RAG 자료집', '', `생성일: ${new Date().toISOString().slice(0, 10)}`, '',
          `문서 ${documents.length}건 · 분류: ${CATEGORIES[category] || '전체'}`, '',
          '> 원문에서 추출한 검색 자료입니다. OCR 검토 상태와 원문 출처를 함께 확인하세요. 자동 분류는 확정 심의 결과가 아닙니다.', '', '## 목차', '',
          ...documents.map((doc, i) => `${i + 1}. [${heading(doc.fileName)}](#document-${doc.id})`), '',
        ].join('\n')));
      },
      async pull(controller) {
        try {
          if (index < documents.length) {
            const doc = await prisma.committee_documents.findUniqueOrThrow({ where: { id: documents[index++].id }, include: { pages: { orderBy: { pageNumber: 'asc' } }, meeting: true } });
            const chunks = await prisma.committee_chunks.findMany({ where: { documentId: doc.id, ...topicWhere }, orderBy: { orderIndex: 'asc' } });
            controller.enqueue(encoder.encode(exportMarkdown([doc.meeting], [doc], chunks, { category, sectionOnly: true })));
            return;
          }
          if (!documentId) {
            const chunks = await prisma.committee_chunks.findMany({ where: { ...legacyWhere, id: { gt: legacyCursor } }, take: 100, orderBy: { id: 'asc' }, include: { meeting: true } });
            if (chunks.length) {
              legacyCursor = chunks.at(-1).id;
              controller.enqueue(encoder.encode(exportMarkdown([...new Map(chunks.map(c => [c.meetingId, c.meeting])).values()], [], chunks, { category, sectionOnly: true })));
              return;
            }
          }
          controller.close();
        } catch (error) { controller.error(error); }
      },
    });
    return new Response(stream, { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="committee-rag${meetingId ? `-${meetingId}` : ''}.md"; filename*=UTF-8''${encodeURIComponent(`심의위원회_청킹자료${meetingId ? `_${meetingId}` : ''}.md`)}`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    console.error('Committee export:', error.code || error.message);
    return Response.json({ error: '자료를 내보내지 못했습니다. DB 마이그레이션을 확인하세요.' }, { status: 503 });
  }
}
