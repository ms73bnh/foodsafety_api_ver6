import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { feedbackId, rating } = await request.json();
    if (typeof feedbackId !== 'string' || !/^[0-9a-f-]{36}$/i.test(feedbackId)) {
      return Response.json({ error: '올바른 답변 ID가 필요합니다.' }, { status: 400 });
    }
    if (typeof rating !== 'boolean') {
      return Response.json({ error: '평가는 Y 또는 N이어야 합니다.' }, { status: 400 });
    }

    const row = await prisma.committee_chat_feedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, userId: true, answerStatus: true },
    });
    if (!row) return Response.json({ error: '평가할 답변을 찾지 못했습니다.' }, { status: 404 });
    if (row.answerStatus !== 'COMPLETED') {
      return Response.json({ error: '답변 생성이 완료된 후 평가할 수 있습니다.' }, { status: 409 });
    }

    const currentUser = getCurrentUser(request);
    if (row.userId && currentUser?.role !== 'ADMIN' && Number(currentUser?.id) !== row.userId) {
      return Response.json({ error: '이 답변을 평가할 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.committee_chat_feedback.update({
      where: { id: feedbackId },
      data: { rating, ratedAt: new Date() },
    });
    return Response.json({ success: true, feedbackId, rating });
  } catch (error) {
    console.error('Committee feedback save failed:', error);
    return Response.json({ error: '평가 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
