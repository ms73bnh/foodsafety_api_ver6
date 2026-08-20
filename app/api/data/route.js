import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const integrated = (searchParams.get('integrated') || '').trim();
    const prdlstReportNo = (searchParams.get('prdlstReportNo') || '').trim();
    const bsshNm = (searchParams.get('bsshNm') || '').trim();
    const prdlstNm = (searchParams.get('prdlstNm') || '').trim();
    const rawmtrlNm = (searchParams.get('rawmtrlNm') || '').trim();
    const normalizedFunctionality = (searchParams.get('normalizedFunctionality') || searchParams.get('search') || '').trim();
    const normalizedPackaging = (searchParams.get('normalizedPackaging') || '').trim();
    const normalizedRawMaterials = (searchParams.get('normalizedRawMaterials') || '').trim();
    const month = (searchParams.get('month') || '').trim();
    const date = (searchParams.get('date') || '').trim();
    const dispos = (searchParams.get('dispos') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const startDate = (searchParams.get('startDate') || '').trim();

    // 성분 완전 일치 모드: 기능성 필드를 엄격하게 일치 (통합검색어 또는 기능성 필터 기준)
    const exactFunctionality = searchParams.get('exactFunctionality') === 'true';

    /**
     * '비타민 C, D' → ['비타민C', '비타민D'] 확장
     * 트론트에서 이미 확장합니다만, API에서도 같은 로직으로 안정적 체크
     */
    const expandFunctionalityShorthand = (raw) => {
      if (!raw) return [];
      const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
      const expanded = [];
      let lastPrefix = '';
      for (const token of tokens) {
        const parts = token.split(/\s+/);
        if (parts.length === 1) {
          if (/^[A-Za-z0-9]+$/.test(parts[0]) && lastPrefix) {
            expanded.push(lastPrefix + parts[0]);
          } else {
            expanded.push(token);
            lastPrefix = token;
          }
        } else {
          const prefix = parts.slice(0, -1).join(' ');
          const suffix = parts[parts.length - 1];
          expanded.push(prefix + suffix);
          lastPrefix = prefix;
        }
      }
      return expanded;
    };

    const conditions = [];

    if (integrated) {
      // 쉼표(,)로 구분된 모든 키워드를 AND 조건으로 처리
      const keywords = integrated.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
      
      keywords.forEach(kw => {
        const kwProcessed = kw.replace(/\s+/g, "").toLowerCase();
        conditions.push({
          OR: [
            { prdlstReportNo: { contains: kw, mode: 'insensitive' } },
            { bsshNm: { contains: kw, mode: 'insensitive' } },
            { prdlstNm: { contains: kw, mode: 'insensitive' } },
            { dispos: { contains: kw, mode: 'insensitive' } },
            { prdtShapCdNm: { contains: kw, mode: 'insensitive' } },
            { searchFunctionality: { contains: kwProcessed } },
            { normalizedPackaging: { contains: kw, mode: 'insensitive' } },
            { frmlcMtrqlt: { contains: kw, mode: 'insensitive' } }
          ]
        });
      });
    }

    if (prdlstReportNo) conditions.push({ prdlstReportNo: { contains: prdlstReportNo, mode: 'insensitive' } });
    if (bsshNm) conditions.push({ bsshNm: { contains: bsshNm, mode: 'insensitive' } });
    if (prdlstNm) conditions.push({ prdlstNm: { contains: prdlstNm, mode: 'insensitive' } });
    
    // 제형(제품형태) 전용 필터: 요청에 따라 포장재질 제외하고 제형 관련 필드만 검색 (정확한 일치 검색)
    if (dispos) {
      conditions.push({
        OR: [
          { dispos: { equals: dispos } },
          { prdtShapCdNm: { equals: dispos } }
        ]
      });
    }
    
    if (normalizedFunctionality) {
      const keywords = normalizedFunctionality.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
      keywords.forEach(kw => {
        const kwProcessed = kw.replace(/\s+/g, "").toLowerCase();
        conditions.push({ 
          OR: [
            { searchFunctionality: { contains: kwProcessed } },
            { normalizedFunctionality: { contains: kw, mode: 'insensitive' } }
          ]
        });
      });
    }
    
    if (normalizedPackaging) {
      conditions.push({
        OR: [
          { normalizedPackaging: { contains: normalizedPackaging, mode: 'insensitive' } },
          { frmlcMtrqlt: { contains: normalizedPackaging, mode: 'insensitive' } }
        ]
      });
    }
    
    if (normalizedRawMaterials) conditions.push({ normalizedRawMaterials: { contains: normalizedRawMaterials, mode: 'insensitive' } });

    if (month) {
       const cleanMonth = month.replace(/-/g, ''); 
       conditions.push({ prmsDt: { startsWith: cleanMonth } });
    }
    if (date) {
       const cleanDate = date.replace(/-/g, ''); 
       conditions.push({ prmsDt: { equals: cleanDate } });
    }
    if (startDate) {
       const cleanStartDate = startDate.replace(/\D/g, '');
       conditions.push({ prmsDt: { gte: cleanStartDate } });
    }

    const where = conditions.length > 0 ? { AND: conditions } : {};

    const sortValue = searchParams.get('sort') || 'prmsDt_desc';
    let orderBy = {};
    if (sortValue === 'prmsDt_desc') orderBy = { prmsDt: 'desc' };
    else if (sortValue === 'prmsDt_asc') orderBy = { prmsDt: 'asc' };
    else orderBy = { createdAt: 'desc' };

    // ──────────────────────────────────────────────────────────────────
    // 기능성 완전 일치 모드 (exactFunctionality=true)
    // DB에서 후보군을 업어온 뒤, JS에서 normalizedFunctionality 집합 정확 일치 필터링
    // ──────────────────────────────────────────────────────────────────
    if (exactFunctionality && (normalizedFunctionality || integrated)) {
      // shorthand 확장 후 정규화 ('비타민C' 등 공백 제거+소문자)
      const rawTermStr = normalizedFunctionality || integrated;
      const expandedTerms = expandFunctionalityShorthand(rawTermStr);
      const targetTerms = expandedTerms
        .map(t => t.replace(/\s+/g, '').toLowerCase())
        .filter(t => t !== '');
      const targetSet = new Set(targetTerms);

      const candidates = await prisma.declarations.findMany({ where, orderBy, take: 10000 });

      const filtered = candidates.filter(item => {
        if (!item.normalizedFunctionality) return false;
        const itemTerms = item.normalizedFunctionality
          .split(',')
          .map(t => t.trim().replace(/\s+/g, '').toLowerCase())
          .filter(t => t !== '');
        const itemSet = new Set(itemTerms);
        if (itemSet.size !== targetSet.size) return false;
        for (const term of targetSet) { if (!itemSet.has(term)) return false; }
        return true;
      });

      const total = filtered.length;
      return NextResponse.json({ success: true, data: filtered.slice((page - 1) * limit, page * limit), total, page, limit, exactMode: 'functionality' });
    }

    // ──────────────────────────────────────────────────────────────────
    // 일반 검색 모드 (포함 검색)
    // ──────────────────────────────────────────────────────────────────
    const total = await prisma.declarations.count({ where });
    const data = await prisma.declarations.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: orderBy
    });

    return NextResponse.json({ success: true, data, total, page, limit });
  } catch (error) {
    console.error('Data API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
