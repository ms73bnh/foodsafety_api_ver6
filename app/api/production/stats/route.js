import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const year = searchParams.get('year');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const hItemNm = searchParams.get('hItemNm') || '';
    const excludeHy = searchParams.get('excludeHy') === 'true';

    let whereClause = {};
    
    // 에치와이 제외 필터
    if (excludeHy) {
      whereClause.NOT = { bsshNm: { contains: '에치와이', mode: 'insensitive' } };
    }

    if (query) {
      const queryObj = {
        OR: [
          { bsshNm: { contains: query, mode: 'insensitive' } },
          { prdlstNm: { contains: query, mode: 'insensitive' } },
          { prdlstReportNo: { contains: query, mode: 'insensitive' } }
        ]
      };
      
      if (whereClause.NOT) {
        whereClause = { AND: [ { NOT: whereClause.NOT }, queryObj ] };
      } else {
        whereClause = queryObj;
      }
    }
    
    if (hItemNm) {
      if (whereClause.AND) {
        whereClause.AND.push({ hItemNm: { contains: hItemNm, mode: 'insensitive' } });
      } else if (whereClause.OR || whereClause.NOT) {
        whereClause = { AND: [whereClause, { hItemNm: { contains: hItemNm, mode: 'insensitive' } }] };
      } else {
        whereClause.hItemNm = { contains: hItemNm, mode: 'insensitive' };
      }
    }

    // 1. 연도별 생산량 합계 (트렌드 차트용)
    // 검색어가 있으면 해당 검색 결과에 대한 추이, 없으면 전체 추이
    const yearlyTrend = await prisma.production_stats.groupBy({
      by: ['evlYr'],
      where: whereClause,
      _sum: { prdctnQy: true },
      orderBy: { evlYr: 'asc' }
    });

    // 2. 가장 생산량이 높은 상위 10개 품목 (도넛 차트용)
    const targetYear = year || (yearlyTrend.length > 0 ? yearlyTrend[yearlyTrend.length-1].evlYr : '2024');
    const topProducts = await prisma.production_stats.findMany({
      where: { ...whereClause, evlYr: targetYear },
      orderBy: { prdctnQy: 'desc' },
      take: 10,
      select: {
        prdlstNm: true,
        prdctnQy: true,
        bsshNm: true
      }
    });

    // 4. 제조업체별 랭킹
    const companyRanking = await prisma.production_stats.groupBy({
      by: ['bsshNm'],
      where: { ...whereClause, evlYr: targetYear },
      _sum: { prdctnQy: true },
      orderBy: { _sum: { prdctnQy: 'desc' } },
      take: 10
    });

    // 5. 기능성 성분(hItemNm)별 랭킹
    const ingredientRanking = await prisma.production_stats.groupBy({
      by: ['hItemNm'],
      where: { ...whereClause, evlYr: targetYear },
      _sum: { prdctnQy: true },
      orderBy: { _sum: { prdctnQy: 'desc' } },
      take: 10
    });

    // 6. 기능성 카테고리별 성장/쇠퇴 분석 (2025 vs 2024 기준)
    const prevYear = (parseInt(targetYear) - 1).toString();
    
    // 영양성분 제외 키워드 (비타민, 미네랄 등)
    const nutritionKeywords = ['비타민', '미네랄', '나이아신', '판토텐산', '비오틴', '엽산', '철', '아연', '구리', '셀레늄', '망간', '요오드', '몰리브덴', '크롬', '칼슘', '마그네슘', '칼륨'];
    const nutritionFilter = {
      NOT: nutritionKeywords.map(kw => ({ hItemNm: { contains: kw } }))
    };

    const currentYearCategory = await prisma.production_stats.groupBy({
      by: ['hItemNm'],
      where: { ...whereClause, ...nutritionFilter, evlYr: targetYear },
      _sum: { prdctnQy: true }
    });

    const prevYearCategory = await prisma.production_stats.groupBy({
      by: ['hItemNm'],
      where: { ...whereClause, ...nutritionFilter, evlYr: prevYear },
      _sum: { prdctnQy: true }
    });

    const categoryGrowth = currentYearCategory.map(curr => {
      const prev = prevYearCategory.find(p => p.hItemNm === curr.hItemNm);
      const prevQy = prev ? prev._sum.prdctnQy : 0;
      const currQy = curr._sum.prdctnQy;
      const diff = currQy - prevQy;
      const growthRate = prevQy > 0 ? (diff / prevQy) * 100 : 100;
      return { 
        name: curr.hItemNm, 
        currQy, 
        prevQy, 
        diff, 
        growthRate 
      };
    })
    .filter(c => c.prevQy > 0) // 인사이트를 위해 기존 시장이 존재했던 카테고리만 선정
    .sort((a, b) => b.diff - a.diff); // 절대량 증가 순으로 정렬

    // 상위 5개 성장, 하위 5개 쇠퇴 추출
    const topGrowingCategories = categoryGrowth.slice(0, 5);
    const topShrinkingCategories = [...categoryGrowth].sort((a, b) => a.diff - b.diff).slice(0, 5);

    // 3. 매트릭스 목록 데이터 (페이징 지원 - 대시보드 리스트용)
    const distinctProducts = await prisma.production_stats.findMany({
      where: whereClause,
      distinct: ['prdlstReportNo'],
      select: {
        prdlstReportNo: true,
        prdlstNm: true,
        bsshNm: true,
        hItemNm: true
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { prdlstNm: 'asc' }
    });

    const totalCountResult = await prisma.production_stats.findMany({
      where: whereClause,
      distinct: ['prdlstReportNo'],
      select: { prdlstReportNo: true }
    });
    const totalCount = totalCountResult.length;

    // 선택된 품목들에 대한 모든 연도 실적 가져오기
    const matrixReportNos = distinctProducts.map(p => p.prdlstReportNo);
    const yearlyRawData = await prisma.production_stats.findMany({
      where: {
        prdlstReportNo: { in: matrixReportNos }
      },
      select: {
        prdlstReportNo: true,
        evlYr: true,
        prdctnQy: true
      }
    });

    // 데이터 가공 (Pivot)
    const matrixData = distinctProducts.map(p => {
      const yearly = {};
      yearlyRawData.filter(d => d.prdlstReportNo === p.prdlstReportNo).forEach(d => {
        yearly[d.evlYr] = d.prdctnQy;
      });
      return { ...p, yearly };
    });

    return NextResponse.json({
      success: true,
      yearlyTrend: yearlyTrend.map(t => ({ year: t.evlYr, value: t._sum.prdctnQy })),
      topProducts,
      companyRanking: companyRanking.map(c => ({ name: c.bsshNm, value: c._sum.prdctnQy })),
      ingredientRanking: ingredientRanking.map(i => ({ name: i.hItemNm, value: i._sum.prdctnQy })),
      topGrowingCategories,
      topShrinkingCategories,
      matrixData,
      totalCount,
      page,
      limit,
      targetYear
    });

  } catch (error) {
    console.error('Production Stats Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
