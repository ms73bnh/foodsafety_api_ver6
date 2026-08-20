import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';


// GET: 현재 표시할 활성 공지 목록 (로그인 사용자 전용)
export async function GET(req) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const now = new Date();

    const notices = await prisma.notice.findMany({
      where: {
        isActive: true,
        OR: [
          { startAt: null },
          { startAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, content: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: notices });
  } catch (error) {
    console.error('[NOTICE ACTIVE GET ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
