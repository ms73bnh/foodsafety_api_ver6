import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { enqueueMeeting } from '@/lib/committeeRag/pipeline.mjs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET() {
  const [totalMeetings, chunkedMeetings, totalChunks, embeddedChunks, pendingChunks, failedChunks, pdfChunks, bodyChunks, agendaChunks] = await Promise.all([
    prisma.committee_meetings.count(), prisma.committee_meetings.count({ where: { chunks: { some: { active: true } } } }),
    prisma.committee_chunks.count({ where: { active: true } }),
    prisma.committee_chunks.count({ where: { active: true, embeddingStatus: 'completed' } }),
    prisma.committee_chunks.count({ where: { embeddingStatus: 'pending' } }), prisma.committee_chunks.count({ where: { embeddingStatus: 'failed' } }),
    prisma.committee_chunks.count({ where: { active: true, chunkType: 'pdf' } }), prisma.committee_chunks.count({ where: { active: true, chunkType: 'body' } }),
    prisma.committee_chunks.count({ where: { active: true, chunkType: 'agenda' } }),
  ]);
  return Response.json({ totalMeetings, chunkedMeetings, totalChunks, embeddedChunks, pendingChunks, failedChunks, pdfChunks, bodyChunks, agendaChunks, pendingMeetings: totalMeetings - chunkedMeetings, chunkVersion: 3 });
}
export async function POST(request) {
  if (getCurrentUser(request)?.role !== 'ADMIN') return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body.mode === 're-embed') {
    const result = await prisma.committee_ingestion_jobs.updateMany({ where: { status: 'failed' }, data: { status: 'pending', attempts: 0, nextRetryAt: new Date(), error: null } });
    return Response.json({ done: true, processed: result.count, queued: result.count, embedded: 0, message: '실패 작업을 재등록했습니다. 자료실에서 진행 상황을 확인하세요.' });
  }
  const offset = Math.max(0, Number.parseInt(body.offset, 10) || 0);
  const batch = Math.min(100, Math.max(1, Number.parseInt(body.batch, 10) || 20));
  const meetings = await prisma.committee_meetings.findMany({ orderBy: { id: 'asc' }, skip: offset, take: batch, select: { id: true } });
  for (const meeting of meetings) await enqueueMeeting(prisma, meeting.id);
  return Response.json({ done: meetings.length < batch, processed: meetings.length, queued: meetings.length, nextOffset: offset + meetings.length, results: [], message: '파일·페이지 단위 재수집 작업을 등록했습니다.' });
}
