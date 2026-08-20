import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/ingredients/[id]/products — 해당 원료가 포함된 제품(declarations) 목록 조회
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const materialId = parseInt(id, 10);
    if (isNaN(materialId)) {
      return NextResponse.json({ success: false, error: '올바르지 않은 ID' }, { status: 400 });
    }

    // 원료 정보 조회
    const material = await prisma.individual_raw_materials.findUnique({
      where: { id: materialId },
      select: { name: true, recognitionNumber: true }
    });
    if (!material) {
      return NextResponse.json({ success: false, error: '원료를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url, 'http://localhost');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '15', 10), 50);
    const skip = (page - 1) * limit;

    // --- 완제품 매핑을 위한 키워드 및 인정번호 추출 ---
    const rawRecNum = material.recognitionNumber || '';

    // 인정번호 핵심 추출: "제2024-16호" → "2024-16"
    const recNumberMatch = rawRecNum.match(/\d{4}-\d+/);
    const recNumberCore = recNumberMatch ? recNumberMatch[0] : '';

    // 원료명 정제
    let fullName = material.name || '';
    let clean = fullName
      .replace(/\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/[®·™]/g, ' ')
      .trim();

    const tokens = clean.split(/[\s,./_]+/).filter(Boolean);
    const stopWords = ['추출물', '복합물', '농축액', '분말', '가루', '제품', '추출', '복합', '농축', '혼합물', '혼합', '오일', '유지', '발효', '여과물', '의', '과', '와', '및', '등'];

    const processedTokens = tokens.map(token => {
      let t = token;
      stopWords.forEach(sw => {
        if (t.endsWith(sw) && t.length > sw.length) t = t.substring(0, t.length - sw.length);
      });
      return t;
    }).filter(t => t.length >= 2);

    // 검색어: 가장 긴 의미 있는 토큰을 최소 6자 이상 사용
    // (4자 截頭은 "Lati" 같은 무의미한 단편으로 과매칭을 일으킴)
    const sortedByLength = [...processedTokens].sort((a, b) => b.length - a.length);
    const bestToken = sortedByLength[0] || clean;
    const MIN_SEARCH_LEN = 6;
    const searchTerm = bestToken.length >= MIN_SEARCH_LEN
      ? bestToken
      : (bestToken.length >= 2 ? bestToken : '');

    // OR 조건: 인정번호 기반만 사용 (원료명 기반은 JS 단계에서 사후 검증)
    // → 제품명(prdlstNm)은 원료 포함 여부와 무관하므로 검색 대상에서 제외
    // → recNumberCore 단독 substring 매칭 제거 (날짜/다른 번호와 혼동 방지)
    const orConditions = [];

    // 1. 전체 인정번호 완전 포함 매칭 (가장 신뢰도 높음)
    if (rawRecNum) {
      orConditions.push(
        { rawmtrlNm: { contains: rawRecNum, mode: 'insensitive' } },
        { indvRawmtrlNm: { contains: rawRecNum, mode: 'insensitive' } }
      );
    }

    // 2. 원료명 기반 매칭 (rawmtrlNm / indvRawmtrlNm 한정, 6자 이상 보장)
    if (searchTerm) {
      orConditions.push(
        { rawmtrlNm: { contains: searchTerm, mode: 'insensitive' } },
        { indvRawmtrlNm: { contains: searchTerm, mode: 'insensitive' } }
      );
    }

    if (orConditions.length === 0) {
      return NextResponse.json({ success: true, materialName: material.name, recognitionNumber: material.recognitionNumber, searchTerm, recNumberCore, total: 0, page, limit, pages: 0, products: [] });
    }

    const where = { OR: orConditions };

    const candidates = await prisma.declarations.findMany({
      where,
      orderBy: { prmsDt: 'desc' },
      take: 400,
      select: {
        prdlstReportNo: true,
        prdlstNm: true,
        bsshNm: true,
        prmsDt: true,
        rawmtrlNm: true,
        indvRawmtrlNm: true,
        normalizedFunctionality: true,
        dispos: true,
      }
    });

    // --- JS 정밀 필터링 ---
    const recNumPattern = /제\s*\d{4}-\d+\s*호/g;

    const filtered = candidates.filter(prod => {
      const text = `${prod.rawmtrlNm || ''} ${prod.indvRawmtrlNm || ''}`;

      // 완제품 텍스트에서 인정번호 패턴 추출 ("제XXXX-N호" 형식만 인식)
      const matches = [...text.matchAll(recNumPattern)].map(m => {
        const core = m[0].match(/\d{4}-\d+/);
        return core ? core[0] : '';
      }).filter(Boolean);

      if (matches.length > 0) {
        // 완제품에 인정번호가 명시되어 있을 때: 현재 원료의 인정번호와 일치해야 함
        if (recNumberCore && !matches.includes(recNumberCore)) return false;
      } else {
        // 완제품에 인정번호가 없을 때: 원료명이 의미 있게 포함되어 있는지 검증
        // searchTerm이 6자 미만이거나 제품 텍스트에 포함 안 되면 오매칭으로 제거
        if (!searchTerm || searchTerm.length < MIN_SEARCH_LEN) return false;
        if (!text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      }

      return true;
    });

    const total = filtered.length;
    // 페이징 처리
    const products = filtered.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      materialName: material.name,
      recognitionNumber: material.recognitionNumber,
      searchTerm,
      recNumberCore,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      products
    });
  } catch (error) {
    console.error('GET ingredient products error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
