import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { CATEGORIES_MASTER } from '@/lib/category_data';

// 자동 카테고리 매핑 유틸
function autoClassify(functionalityText = '', name = '') {
  const matched = [];
  const text = (functionalityText || '') + ' ' + (name || '');

  CATEGORIES_MASTER.forEach(cat => {
    if (cat.name === '멀티비타민') return;
    
    const hasKeyword = cat.keywords.some(keyword => text.includes(keyword));
    if (hasKeyword) {
      matched.push(cat.name);
    }
  });

  if (!matched.includes('홍삼인삼')) {
    if (text.includes('홍삼') || text.includes('인삼')) {
      matched.push('홍삼인삼');
    }
  }

  return matched.join(', ');
}

// PUT: 개별인정형 원료 수정
export async function PUT(req, { params }) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '인증 세션이 만료되었습니다. 로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;
    const materialId = parseInt(id, 10);
    if (isNaN(materialId)) {
      return NextResponse.json({ success: false, error: '올바르지 않은 원료 ID입니다.' }, { status: 400 });
    }

    const body = await req.json();
    const { recognitionNumber, name, company, functionalityText, dailyIntake, precautions, registeredDate, detailContent } = body;

    if (!recognitionNumber || !name) {
      return NextResponse.json({ success: false, error: '인정번호와 원료명은 필수 항목입니다.' }, { status: 400 });
    }

    // 존재하는지 확인
    const target = await prisma.individual_raw_materials.findUnique({
      where: { id: materialId }
    });

    if (!target) {
      return NextResponse.json({ success: false, error: '존재하지 않는 원료입니다.' }, { status: 444 });
    }

    // 인정번호 중복 확인 (본인 외 다른 원료에 해당 인정번호가 있는지)
    const duplicate = await prisma.individual_raw_materials.findFirst({
      where: {
        recognitionNumber,
        id: { not: materialId }
      }
    });

    if (duplicate) {
      return NextResponse.json({ success: false, error: '이미 다른 원료에 등록된 인정번호입니다.' }, { status: 409 });
    }

    // 자동 카테고리 매핑 재계산
    const categories = autoClassify(functionalityText, name);

    const updatedMaterial = await prisma.individual_raw_materials.update({
      where: { id: materialId },
      data: {
        recognitionNumber,
        name,
        company: company || '',
        functionalityText: functionalityText || '',
        dailyIntake: dailyIntake || '',
        precautions: precautions || '',
        registeredDate: registeredDate || '',
        detailContent: detailContent || '',
        categories
      }
    });

    // Audit 로그 기록
    await writeAuditLog(req, {
      action: 'INGREDIENT_UPDATE',
      page: `/ingredients/${id}`,
      details: { id: materialId, name, recognitionNumber, old: target, new: updatedMaterial }
    });

    return NextResponse.json({
      success: true,
      data: updatedMaterial
    });

  } catch (error) {
    console.error('PUT ingredient error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: 개별인정형 원료 삭제
export async function DELETE(req, { params }) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '인증 세션이 만료되었습니다. 로그인이 필요합니다.' }, { status: 401 });
    }

    const { id } = await params;
    const materialId = parseInt(id, 10);
    if (isNaN(materialId)) {
      return NextResponse.json({ success: false, error: '올바르지 않은 원료 ID입니다.' }, { status: 400 });
    }

    const target = await prisma.individual_raw_materials.findUnique({
      where: { id: materialId }
    });

    if (!target) {
      return NextResponse.json({ success: false, error: '존재하지 않는 원료입니다.' }, { status: 444 });
    }

    await prisma.individual_raw_materials.delete({
      where: { id: materialId }
    });

    // Audit 로그 기록
    await writeAuditLog(req, {
      action: 'INGREDIENT_DELETE',
      page: `/ingredients/${id}`,
      details: { id: materialId, name: target.name, recognitionNumber: target.recognitionNumber }
    });

    return NextResponse.json({
      success: true,
      message: '원료가 성공적으로 삭제되었습니다.'
    });

  } catch (error) {
    console.error('DELETE ingredient error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
