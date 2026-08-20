import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyPassword, signToken } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req) {
  try {
    const { username, password } = await req.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '아이디와 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 사용자 조회
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      // 보안을 위해 구체적인 실패 원인을 밝히지 않고 에러 메시지 통일 가능하나,
      // 가입 상태 확인을 위해 비밀번호 틀림과 구분할 수 있도록 처리
      await writeAuditLog(req, {
        action: 'LOGIN_FAILURE',
        page: '/api/auth/login',
        details: '존재하지 않는 아이디 로그인 시도',
        overrideUsername: username,
        overrideRole: 'GUEST'
      });
      return NextResponse.json(
        { success: false, error: '아이디 또는 비밀번호가 잘못되었습니다.' },
        { status: 401 }
      );
    }

    // 비밀번호 검증
    const isValid = verifyPassword(password, user.password);
    if (!isValid) {
      await writeAuditLog(req, {
        action: 'LOGIN_FAILURE',
        page: '/api/auth/login',
        details: '비밀번호 불일치',
        overrideUsername: username,
        overrideRole: 'GUEST'
      });
      return NextResponse.json(
        { success: false, error: '아이디 또는 비밀번호가 잘못되었습니다.' },
        { status: 401 }
      );
    }

    // 승인 상태 검증
    if (!user.isApproved) {
      await writeAuditLog(req, {
        action: 'LOGIN_PENDING_APPROVAL',
        page: '/api/auth/login',
        details: '승인 대기 계정 로그인 시도',
        overrideUsername: username,
        overrideRole: user.role
      });
      return NextResponse.json(
        { success: false, error: '관리자의 가입 승인이 대기 중입니다. 승인 후 로그인해주세요.' },
        { status: 403 }
      );
    }

    // 토큰 발행
    const tokenPayload = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      companyNm: user.companyNm,
      deptNm: user.deptNm,
      positionNm: user.positionNm,
      titleNm: user.titleNm
    };
    
    const token = signToken(tokenPayload);

    // 로그인 성공 감사 로그 기록
    await writeAuditLog(req, {
      action: 'LOGIN_SUCCESS',
      page: '/api/auth/login',
      details: '로그인 성공',
      overrideUsername: user.username,
      overrideRole: user.role
    });

    const response = NextResponse.json({
      success: true,
      user: {
        username: user.username,
        name: user.name,
        role: user.role,
        companyNm: user.companyNm
      }
    });

    // 쿠키 설정 (HttpOnly, Secure - dev에서는 상관없지만 배포 고려)
    response.cookies.set('auth_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24시간
    });

    return response;

  } catch (error) {
    console.error('Login API Error:', error);
    return NextResponse.json(
      { success: false, error: '로그인 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
