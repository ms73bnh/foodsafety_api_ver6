import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export async function GET() {
  try {
    const data = await prisma.banners.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    // 관리자 권한 검사
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 배너를 등록할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { title, imageUrl, linkUrl } = await req.json();
    if (!title) {
      return NextResponse.json({ success: false, error: '제목은 필수입니다.' }, { status: 400 });
    }

    const newBanner = await prisma.banners.create({
      data: {
        title,
        imageUrl: imageUrl || '',
        linkUrl,
        isActive: true
      }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'BANNER_ADD',
      page: '/api/banners',
      details: `새 배너 등록: [${title}] (링크: ${linkUrl || '없음'})`
    });

    return NextResponse.json({ success: true, data: newBanner });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
