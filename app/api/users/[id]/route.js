import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAdmin, getCurrentUser, hashPassword } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// 사용자 정보 업데이트 (승인 및 권한 변경, 정보 수동 수정 및 비밀번호 초기화)
export async function PUT(req, { params }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 접근할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ success: false, error: '잘못된 사용자 ID입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const { isApproved, role, password, name, companyNm, deptNm, positionNm, titleNm } = body;

    // 변경 전 사용자 정보 조회
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: '해당 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const dataToUpdate = {};
    const logDetails = [];

    if (isApproved !== undefined) {
      dataToUpdate.isApproved = isApproved;
      logDetails.push(isApproved ? `가입 승인` : `가입 승인 취소`);
    }

    if (role !== undefined) {
      dataToUpdate.role = role;
      logDetails.push(`권한 변경: ${targetUser.role} -> ${role}`);
    }

    if (password !== undefined && password !== '') {
      if (password.length < 4) {
        return NextResponse.json({ success: false, error: '비밀번호는 최소 4자 이상이어야 합니다.' }, { status: 400 });
      }
      dataToUpdate.password = hashPassword(password);
      logDetails.push('비밀번호 강제 변경/초기화');
    }

    if (name !== undefined) {
      dataToUpdate.name = name;
      if (targetUser.name !== name) logDetails.push(`성명 변경: ${targetUser.name} -> ${name}`);
    }

    if (companyNm !== undefined) {
      dataToUpdate.companyNm = companyNm;
      if (targetUser.companyNm !== companyNm) logDetails.push(`회사명 변경: ${targetUser.companyNm} -> ${companyNm}`);
    }

    if (deptNm !== undefined) {
      dataToUpdate.deptNm = deptNm;
      if (targetUser.deptNm !== deptNm) logDetails.push(`부서명 변경: ${targetUser.deptNm} -> ${deptNm}`);
    }

    if (positionNm !== undefined) {
      dataToUpdate.positionNm = positionNm;
      if (targetUser.positionNm !== positionNm) logDetails.push(`직급 변경: ${targetUser.positionNm} -> ${positionNm}`);
    }

    if (titleNm !== undefined) {
      dataToUpdate.titleNm = titleNm;
      if (targetUser.titleNm !== titleNm) logDetails.push(`직책 변경: ${targetUser.titleNm} -> ${titleNm}`);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'USER_UPDATE',
      page: `/api/users/${id}`,
      details: `대상: ${targetUser.name}(${targetUser.username}) | 변경사항: ${logDetails.join(', ')}`
    });

    return NextResponse.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error('User Update PUT API Error:', error);
    return NextResponse.json(
      { success: false, error: '사용자 정보 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 사용자 삭제 (강퇴/탈퇴 처리)
export async function DELETE(req, { params }) {
  try {
    if (!isAdmin(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. 관리자만 접근할 수 있습니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ success: false, error: '잘못된 사용자 ID입니다.' }, { status: 400 });
    }

    // 로그인된 본인 계정은 삭제 불가 처리
    const currentUser = getCurrentUser(req);
    if (currentUser && currentUser.id === userId) {
      return NextResponse.json({ success: false, error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    // 대상 사용자 조회
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      return NextResponse.json({ success: false, error: '해당 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    await prisma.user.delete({
      where: { id: userId }
    });

    // 작업 이력 기록
    await writeAuditLog(req, {
      action: 'USER_DELETE',
      page: `/api/users/${id}`,
      details: `삭제된 사용자: ${targetUser.name}(${targetUser.username}), 회사: ${targetUser.companyNm}, 부서: ${targetUser.deptNm}`
    });

    return NextResponse.json({ success: true, message: '사용자가 정상적으로 삭제되었습니다.' });

  } catch (error) {
    console.error('User Delete API Error:', error);
    return NextResponse.json(
      { success: false, error: '사용자 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
