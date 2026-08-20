import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';


// GET: 전체 공지 목록 (ADMIN 전용)
export async function GET(req) {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const notices = await prisma.notice.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: notices });
  } catch (error) {
    console.error('[NOTICE GET ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 공지 생성 (ADMIN 전용)
export async function POST(req) {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const { title, content, isActive = true, startAt, endAt } = body;

    if (!title || !content) {
      return NextResponse.json({ success: false, error: '제목과 내용은 필수입니다.' }, { status: 400 });
    }

    const notice = await prisma.notice.create({
      data: {
        title,
        content,
        isActive,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        createdBy: user.id,
      },
    });

    await writeAuditLog(req, { action: 'NOTICE_CREATE', page: '/api/notices', details: `공지 생성: "${title}"` });

    return NextResponse.json({ success: true, data: notice });
  } catch (error) {
    console.error('[NOTICE POST ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
