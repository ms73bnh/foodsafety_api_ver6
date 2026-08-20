import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { CATEGORIES_MASTER } from '@/lib/category_data';

// 02sort.md에 정의된 키워드 매핑 자동 카테고리화 유틸
function autoClassify(functionalityText = '', name = '') {
  const matched = [];
  const text = (functionalityText || '') + ' ' + (name || '');

  CATEGORIES_MASTER.forEach(cat => {
    if (cat.name === '멀티비타민') return; // 멀티비타민은 완제품용 특수 로직이므로 개별원료 매핑에선 제외
    
    const hasKeyword = cat.keywords.some(keyword => text.includes(keyword));
    if (hasKeyword) {
      matched.push(cat.name);
    }
  });

  // 홍삼/인삼 추가 검사
  if (!matched.includes('홍삼인삼')) {
    if (text.includes('홍삼') || text.includes('인삼')) {
      matched.push('홍삼인삼');
    }
  }

  return matched.join(', ');
}

// GET: 개별인정형 원료 목록 조회
export async function GET(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const searchParams = url.searchParams;
    const search = searchParams.get('search') ? decodeURIComponent(searchParams.get('search')).trim() : '';
    const category = searchParams.get('category') ? decodeURIComponent(searchParams.get('category')).trim() : '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    // WHERE 조건 구성
    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { recognitionNumber: { contains: search, mode: 'insensitive' } },
        { functionalityText: { contains: search, mode: 'insensitive' } },
        { categories: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.categories = {
        contains: category,
        mode: 'insensitive'
      };
    }

    const total = await prisma.individual_raw_materials.count({ where });
    const data = await prisma.individual_raw_materials.findMany({
      where,
      orderBy: [
        { registeredDate: 'desc' },
        { id: 'desc' }
      ],
      skip,
      take: limit
    });

    return NextResponse.json({
      success: true,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    console.error('GET ingredients error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST: 신규 개별인정형 원료 추가
export async function POST(req) {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: '인증 세션이 만료되었습니다. 로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const { recognitionNumber, name, company, functionalityText, dailyIntake, precautions, registeredDate, detailContent } = body;

    if (!recognitionNumber || !name) {
      return NextResponse.json({ success: false, error: '인정번호와 원료명은 필수 항목입니다.' }, { status: 400 });
    }

    // 인정번호 중복 검사
    const existing = await prisma.individual_raw_materials.findUnique({
      where: { recognitionNumber }
    });

    if (existing) {
      return NextResponse.json({ success: false, error: '이미 등록된 인정번호입니다.' }, { status: 409 });
    }

    // 자동 카테고리 매핑 적용
    const categories = autoClassify(functionalityText, name);

    const newMaterial = await prisma.individual_raw_materials.create({
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
      action: 'INGREDIENT_CREATE',
      page: '/ingredients',
      details: { recognitionNumber, name, company, categories }
    });

    return NextResponse.json({
      success: true,
      data: newMaterial
    });

  } catch (error) {
    console.error('POST ingredients error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
