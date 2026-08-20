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

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const query = searchParams.get('query') || ''; // 사용자명 검색
    const action = searchParams.get('action') || ''; // 액션 필터
    
    const skip = (page - 1) * limit;

    // 조건 빌드
    const where = {};
    
    if (query) {
      where.username = {
        contains: query,
        mode: 'insensitive'
      };
    }
    
    if (action) {
      where.action = action;
    }

    // 총 개수 및 데이터 조회
    const [total, logs] = await prisma.$transaction([
      prisma.audit_log.count({ where }),
      prisma.audit_log.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return NextResponse.json({
      success: true,
      data: logs,
      total,
      page,
      limit
    });

  } catch (error) {
    console.error('Audit Logs API Error:', error);
    return NextResponse.json(
      { success: false, error: '작업 이력 로그 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
