import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin } from '@/lib/auth';

export async function GET(req) {
  try {
    // 관리자 여부 검증
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 접근할 수 있습니다.' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        companyNm: true,
        deptNm: true,
        positionNm: true,
        titleNm: true,
        role: true,
        isApproved: true,
        dailyChatLimit: true,
        dailyChatCount: true,
        createdAt: true
      }
    });

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error('Users GET API Error:', error);
    return NextResponse.json(
      { success: false, error: '사용자 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
