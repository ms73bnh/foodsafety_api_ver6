import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSalesOrAbove } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Pro: 최대 60초

// ── 서버 메모리 캐시 (30초 TTL) ──────────────────────────────
const cache = new Map(); // key → { data, total, ts }
const CACHE_TTL = 30_000;

function getCacheKey(params) {
  return JSON.stringify(params);
}

// ── WHERE 조건 빌더 ──────────────────────────────────────────
function buildWhere({ integrated, prdlstReportNo, bsshNm, prdlstNm, prdlstDcnm, normalizedPackaging, dispos }) {
  const conditions = [];

  if (integrated) {
    const keywords = integrated.split(',').map(kw => kw.trim()).filter(Boolean);
    keywords.forEach(kw => {
      // 통합검색: GIN trgm 인덱스가 있는 컬럼만 사용
      // prdlstReportNo는 숫자 코드라 한국어 검색 불필요 + GIN 인덱스 없어 풀스캔
      conditions.push({
        OR: [
          { prdlstNm:   { contains: kw, mode: 'insensitive' } },
          { bsshNm:     { contains: kw, mode: 'insensitive' } },
          { prdlstDcnm: { contains: kw, mode: 'insensitive' } },
        ],
      });
    });
  }

  if (prdlstReportNo) conditions.push({ prdlstReportNo: { contains: prdlstReportNo, mode: 'insensitive' } });
  if (bsshNm)         conditions.push({ bsshNm:         { contains: bsshNm,         mode: 'insensitive' } });
  if (prdlstNm)       conditions.push({ prdlstNm:       { contains: prdlstNm,       mode: 'insensitive' } });
  if (prdlstDcnm)     conditions.push({ prdlstDcnm:     { contains: prdlstDcnm,     mode: 'insensitive' } });
  if (dispos)         conditions.push({ dispos:          { contains: dispos,          mode: 'insensitive' } });

  if (normalizedPackaging) {
    conditions.push({
      OR: [
        { normalizedPackaging: { contains: normalizedPackaging, mode: 'insensitive' } },
        { frmlcMtrqlt:         { contains: normalizedPackaging, mode: 'insensitive' } },
      ],
    });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function GET(req) {
  try {
    if (!isSalesOrAbove(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다. ADMIN 또는 SALES 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const params = {
      integrated:         (searchParams.get('integrated')         || '').trim(),
      prdlstReportNo:     (searchParams.get('prdlstReportNo')     || '').trim(),
      bsshNm:             (searchParams.get('bsshNm')             || '').trim(),
      prdlstNm:           (searchParams.get('prdlstNm')           || '').trim(),
      prdlstDcnm:         (searchParams.get('prdlstDcnm')         || '').trim(),
      normalizedPackaging:(searchParams.get('normalizedPackaging') || '').trim(),
      dispos:             (searchParams.get('dispos')             || '').trim(),
      page:   parseInt(searchParams.get('page')  || '1',  10),
      limit:  parseInt(searchParams.get('limit') || '15', 10),
      sort:   searchParams.get('sort') || 'prmsDt_desc',
    };

    // ── 캐시 확인 ──
    const cacheKey = getCacheKey(params);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, ...cached.payload, cached: true });
    }

    const where = buildWhere(params);

    let orderBy;
    if (params.sort === 'prmsDt_asc') {
      orderBy = [{ prmsDt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    } else if (params.sort === 'recent') {
      orderBy = [{ createdAt: 'desc' }, { id: 'desc' }];
    } else {
      orderBy = [{ prmsDt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    }

    // ── 데이터 조회 (take+1로 다음 페이지 존재 여부 확인) ──────
    const hasFilter = Object.values({
      integrated: params.integrated, prdlstReportNo: params.prdlstReportNo,
      bsshNm: params.bsshNm, prdlstNm: params.prdlstNm,
      prdlstDcnm: params.prdlstDcnm, normalizedPackaging: params.normalizedPackaging,
      dispos: params.dispos,
    }).some(v => v);

    // COUNT + 데이터 병렬 조회 (GIN 인덱스로 COUNT도 빠름)
    const [countResult, rawData] = await Promise.all([
      prisma.general_declarations.count({ where }),
      prisma.general_declarations.findMany({
        where,
        skip:    (params.page - 1) * params.limit,
        take:    params.limit + 1,
        orderBy,
        select: {
          id:                  true,
          prdlstReportNo:      true,
          prdlstNm:            true,
          bsshNm:              true,
          prdlstDcnm:          true,
          prmsDt:              true,
          lastUpdtDtm:         true,
          normalizedPackaging: true,
          frmlcMtrqlt:         true,
          dispos:              true,
          pogDaycnt:           true,
          indutyCdNm:          true,
          childCrtfcYn:        true,
          production:          true,
        },
      }),
    ]);

    const hasMore = rawData.length > params.limit;
    const data = hasMore ? rawData.slice(0, params.limit) : rawData;
    const total = countResult;

    const payload = { data, total, hasMore, page: params.page, limit: params.limit };
    cache.set(cacheKey, { payload, ts: Date.now() });

    // 캐시 크기 제한 (최대 200건)
    if (cache.size > 200) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }

    return NextResponse.json({ success: true, ...payload, cached: false });
  } catch (error) {
    console.error('Data General API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
