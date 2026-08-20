import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export async function PUT(req, { params }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 배너를 수정할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const { isActive } = await req.json();

    const bannerId = parseInt(id, 10);
    const existingBanner = await prisma.banners.findUnique({
      where: { id: bannerId }
    });

    if (!existingBanner) {
      return NextResponse.json({ success: false, error: '배너를 찾을 수 없습니다.' }, { status: 404 });
    }

    const updated = await prisma.banners.update({
      where: { id: bannerId },
      data: { isActive }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'BANNER_TOGGLE',
      page: `/api/banners/${id}`,
      details: `배너 [${existingBanner.title}] 활성화 상태 변경: ${existingBanner.isActive} -> ${isActive}`
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 배너를 삭제할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const bannerId = parseInt(id, 10);
    
    const existingBanner = await prisma.banners.findUnique({
      where: { id: bannerId }
    });

    if (!existingBanner) {
      return NextResponse.json({ success: false, error: '배너를 찾을 수 없습니다.' }, { status: 404 });
    }

    await prisma.banners.delete({
      where: { id: bannerId }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'BANNER_DELETE',
      page: `/api/banners/${id}`,
      details: `배너 삭제: [${existingBanner.title}]`
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
