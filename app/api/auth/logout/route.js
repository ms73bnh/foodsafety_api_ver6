import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req) {
  try {
    const user = getCurrentUser(req);
    
    if (user) {
      // 로그아웃 감사 로그 기록
      await writeAuditLog(req, {
        action: 'LOGOUT',
        page: '/api/auth/logout',
        details: '사용자 로그아웃 완료'
      });
    }

    const response = NextResponse.json({ success: true, message: '로그아웃 성공' });
    
    // 쿠키 만료 처리
    response.cookies.set('auth_session', '', {
      httpOnly: true,
      path: '/',
      expires: new Date(0) // 과거 날짜로 설정하여 즉시 만료
    });

    return response;
  } catch (error) {
    console.error('Logout API Error:', error);
    return NextResponse.json(
      { success: false, error: '로그아웃 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
