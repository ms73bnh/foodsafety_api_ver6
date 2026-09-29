import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { CATEGORIES_MASTER } from '@/lib/category_data';
import { parseFskTitle, parseOfficialIngredientPost } from '@/lib/foodSafetyIngredientAnnouncement';

export const dynamic = 'force-dynamic';

const FSK_BASE_URL = 'https://www.foodsafetykorea.go.kr';
const FSK_BOARD_URL = `${FSK_BASE_URL}/portal/board/board.do?menu_grp=MENU_NEW01&menu_no=2660`;
const FSK_LIST_URL = `${FSK_BASE_URL}/portal/board/boardList.do`;
const FSK_DETAIL_URL = `${FSK_BASE_URL}/portal/board/boardDetail.do`;

function getFskHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'ko-KR,ko;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': FSK_BOARD_URL,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

async function fetchFskListPage(page, headers) {
  const body = new URLSearchParams({
    menu_no: '2660',
    menu_grp: 'MENU_NEW01',
    bbs_no: 'bbs987',
    ctgry_no: '1207',
    ctgry_type_cd: 'CTG_TYPE01',
    start_idx: String(page),
    show_cnt: '50',
  });
  const response = await fetch(FSK_LIST_URL, {
    method: 'POST',
    headers,
    body: body.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`식약처 공시 목록 응답 오류: ${response.status}`);

  const json = await response.json();
  if (!Array.isArray(json.list)) throw new Error('식약처 공시 목록 응답 형식이 올바르지 않습니다.');
  return json;
}

async function findAnnouncementNumber(recognitionNumber, headers) {
  const savedPost = await prisma.raw_material_posts.findFirst({
    where: { recogNo: recognitionNumber, ntctxtNo: { not: null } },
    select: { ntctxtNo: true, title: true },
  });
  if (savedPost?.ntctxtNo && parseFskTitle(savedPost.title).recogNo === recognitionNumber) {
    return savedPost.ntctxtNo;
  }

  const firstPage = await fetchFskListPage(1, headers);
  const totalCount = Number.parseInt(firstPage.total_cnt || '0', 10);
  if (!Number.isFinite(totalCount) || totalCount < 0 || totalCount > 5000) {
    throw new Error('식약처 공시 게시물 수가 유효하지 않습니다.');
  }

  const totalPages = Math.ceil(totalCount / 50);
  const otherPages = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchFskListPage(index + 2, headers))
  );
  const items = [...firstPage.list, ...otherPages.flatMap(page => page.list)];
  const matchedPost = items.find(item => parseFskTitle(item.titl).recogNo === recognitionNumber);
  return matchedPost?.ntctxt_no ? String(matchedPost.ntctxt_no) : null;
}

async function fetchOfficialAnnouncement(ntctxtNo, recognitionNumber, headers) {
  const detailUrl = new URL(FSK_DETAIL_URL);
  detailUrl.search = new URLSearchParams({
    ntctxt_no: ntctxtNo,
    menu_no: '2660',
    menu_grp: 'MENU_NEW01',
    bbs_no: 'bbs987',
  }).toString();

  const response = await fetch(detailUrl, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`식약처 공시 원문 응답 오류: ${response.status}`);

  const parsed = parseOfficialIngredientPost(await response.text(), recognitionNumber);
  return { ...parsed, sourceUrl: detailUrl.toString() };
}

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

export async function GET(_req, { params }) {
  let material;
  try {
    const { id } = await params;
    const materialId = Number.parseInt(id, 10);
    if (!Number.isInteger(materialId) || materialId < 1) {
      return NextResponse.json({ success: false, error: '올바르지 않은 원료 ID입니다.' }, { status: 400 });
    }

    material = await prisma.individual_raw_materials.findUnique({
      where: { id: materialId },
      select: { id: true, recognitionNumber: true },
    });
  } catch (error) {
    console.error('GET ingredient announcement lookup error:', error);
    return NextResponse.json({ success: false, error: '원료 정보를 조회하지 못했습니다.' }, { status: 500 });
  }

  if (!material) {
    return NextResponse.json({ success: false, error: '존재하지 않는 원료입니다.' }, { status: 404 });
  }

  try {
    const headers = getFskHeaders();
    const ntctxtNo = await findAnnouncementNumber(material.recognitionNumber, headers);
    if (!ntctxtNo) {
      return NextResponse.json({ success: false, error: '식약처 공시 게시물을 찾을 수 없습니다.' }, { status: 404 });
    }

    const announcement = await fetchOfficialAnnouncement(ntctxtNo, material.recognitionNumber, headers);
    if (announcement.recogNo && announcement.recogNo !== material.recognitionNumber) {
      throw new Error('식약처 원문 인정번호가 조회한 원료와 일치하지 않습니다.');
    }

    return NextResponse.json({ success: true, data: announcement });
  } catch (error) {
    console.error(`GET ingredient announcement error (${material.recognitionNumber}):`, error);
    return NextResponse.json({ success: false, error: '식약처 공시 원문을 불러오지 못했습니다.' }, { status: 502 });
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
