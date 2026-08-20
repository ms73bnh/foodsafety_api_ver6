import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser, hashPassword, verifyPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// GET /api/auth/profile — 로그인된 본인 정보 조회
export async function GET(req) {
  try {
    const session = getCurrentUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true, username: true, name: true, companyNm: true,
        deptNm: true, positionNm: true, titleNm: true,
        role: true, isApproved: true, createdAt: true
      }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/auth/profile — 본인 기본정보 또는 비밀번호 변경
export async function PATCH(req) {
  try {
    const session = getCurrentUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { mode, name, companyNm, deptNm, positionNm, titleNm, currentPassword, newPassword, confirmPassword } = body;

    // 현재 사용자 DB에서 조회 (password 포함)
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user) {
      return NextResponse.json({ success: false, error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const dataToUpdate = {};

    if (mode === 'password') {
      // 비밀번호 변경 모드
      if (!currentPassword || !newPassword || !confirmPassword) {
        return NextResponse.json({ success: false, error: '모든 비밀번호 항목을 입력해주세요.' }, { status: 400 });
      }
      if (!verifyPassword(currentPassword, user.password)) {
        return NextResponse.json({ success: false, error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ success: false, error: '새 비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
      }
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ success: false, error: '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.' }, { status: 400 });
      }
      dataToUpdate.password = hashPassword(newPassword);

      await writeAuditLog(req, {
        action: 'SELF_PASSWORD_CHANGE',
        page: '/api/auth/profile',
        details: `${user.name}(${user.username}) 본인이 비밀번호를 변경했습니다.`
      });

    } else if (mode === 'info') {
      // 기본 정보 변경 모드
      if (name !== undefined) dataToUpdate.name = name;
      if (companyNm !== undefined) dataToUpdate.companyNm = companyNm;
      if (deptNm !== undefined) dataToUpdate.deptNm = deptNm;
      if (positionNm !== undefined) dataToUpdate.positionNm = positionNm;
      if (titleNm !== undefined) dataToUpdate.titleNm = titleNm;
      // role, isApproved는 본인이 변경 불가 — 어드민 전용

      await writeAuditLog(req, {
        action: 'SELF_PROFILE_UPDATE',
        page: '/api/auth/profile',
        details: `${user.name}(${user.username}) 기본정보 수정: ${Object.keys(dataToUpdate).join(', ')}`
      });

    } else {
      return NextResponse.json({ success: false, error: '올바르지 않은 요청입니다.' }, { status: 400 });
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ success: false, error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: session.id },
      data: dataToUpdate,
      select: {
        id: true, username: true, name: true, companyNm: true,
        deptNm: true, positionNm: true, titleNm: true, role: true
      }
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error('Profile PATCH error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
