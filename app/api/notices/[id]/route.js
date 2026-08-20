import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// PUT: 공지 수정 (ADMIN 전용)
export async function PUT(req, { params }) {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const id = parseInt(rawId);
    const body = await req.json();
    const { title, content, isActive, startAt, endAt } = body;

    const notice = await prisma.notice.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(isActive !== undefined && { isActive }),
        startAt: startAt !== undefined ? (startAt ? new Date(startAt) : null) : undefined,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : undefined,
      },
    });

    await writeAuditLog(req, { action: 'NOTICE_UPDATE', page: '/api/notices', details: `공지 수정: ID ${id} "${notice.title}"` });

    return NextResponse.json({ success: true, data: notice });
  } catch (error) {
    console.error('[NOTICE PUT ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 공지 삭제 (ADMIN 전용)
export async function DELETE(req, { params }) {
  try {
    const user = getCurrentUser(req);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: '권한이 없습니다.' }, { status: 403 });
    }

    const { id: rawId } = await params;
    const id = parseInt(rawId);
    const notice = await prisma.notice.findUnique({ where: { id } });
    if (!notice) {
      return NextResponse.json({ success: false, error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    await prisma.notice.delete({ where: { id } });
    await writeAuditLog(req, { action: 'NOTICE_DELETE', page: '/api/notices', details: `공지 삭제: ID ${id} "${notice.title}"` });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[NOTICE DELETE ERROR]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
