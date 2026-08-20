import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export async function POST(req) {
  try {
    const body = await req.json();
    const { username, password, name, companyNm, deptNm, positionNm, titleNm } = body;

    // 필수 필드 검증
    if (!username || !password || !name || !companyNm || !deptNm || !positionNm || !titleNm) {
      return NextResponse.json(
        { success: false, error: '모든 가입 정보를 올바르게 입력해주세요.' },
        { status: 400 }
      );
    }

    // 아이디 중복 체크
    const existingUser = await prisma.user.findUnique({
      where: { username }
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: '이미 존재하는 아이디입니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 해싱 및 사용자 생성
    const hashedPassword = hashPassword(password);
    const newUser = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name,
        companyNm,
        deptNm,
        positionNm,
        titleNm,
        role: 'USER',
        isApproved: false // 기본적으로 승인 대기 상태
      }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'REGISTER_REQUEST',
      page: '/api/auth/register',
      details: `${name}(${username}) 회원가입 신청 완료 (승인 대기)`,
      overrideUsername: username,
      overrideRole: 'USER'
    });

    return NextResponse.json({
      success: true,
      message: '회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.'
    });

  } catch (error) {
    console.error('Registration API Error:', error);
    return NextResponse.json(
      { success: false, error: '회원가입 중 오류가 발생했습니다: ' + String(error) },
      { status: 500 }
    );
  }
}
