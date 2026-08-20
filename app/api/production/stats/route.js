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
    const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
    
    // 연도별 병렬 조회로 메모리 폭주 방지
    const yearlyTrendPromises = YEARS.map(async (yr) => {
      try {
        const sumRes = await prisma.production_stats.aggregate({
          where: { ...whereClause, evlYr: yr },
          _sum: { prdctnQy: true }
        });
        return { year: yr, value: sumRes._sum.prdctnQy || 0 };
      } catch (e) {
        return { year: yr, value: 0 };
      }
    });
    const yearlyTrend = await Promise.all(yearlyTrendPromises);

    // 2. 가장 생산량이 높은 상위 10개 품목 (도넛 차트용)
    const targetYear = year || '2025';
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
    const nutritionKeywords = ['비타민', '미네랄', '나이아신', '판토텐산', '비오틴', '엽산', '철', '아연', '구리', '셀레늄', '망간', '요오드', '몰리브덴', '크롬', '칼슘', '마그네슘', '칼륨'];

    const currentYearCategory = await prisma.production_stats.groupBy({
      by: ['hItemNm'],
      where: { ...whereClause, evlYr: targetYear },
      _sum: { prdctnQy: true }
    });

    const prevYearCategory = await prisma.production_stats.groupBy({
      by: ['hItemNm'],
      where: { ...whereClause, evlYr: prevYear },
      _sum: { prdctnQy: true }
    });

    const categoryGrowth = currentYearCategory
      .filter(curr => curr.hItemNm && !nutritionKeywords.some(kw => curr.hItemNm.includes(kw)))
      .map(curr => {
        const prev = prevYearCategory.find(p => p.hItemNm === curr.hItemNm);
        const prevQy = prev ? prev._sum.prdctnQy : 0;
        const currQy = curr._sum.prdctnQy || 0;
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
      .filter(c => c.prevQy > 0)
      .sort((a, b) => b.diff - a.diff);

    // 상위 5개 성장, 하위 5개 쇠퇴 추출
    const topGrowingCategories = categoryGrowth.slice(0, 5);
    const topShrinkingCategories = [...categoryGrowth].sort((a, b) => a.diff - b.diff).slice(0, 5);

    const sortKey = searchParams.get('sortKey') || 'total';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // 3. 매트릭스 목록 데이터 (페이징 & 정렬 지원)
    let orderedProducts = [];
    let reportNos = [];
    let totalCount = 0;

    const isYearSort = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'].includes(String(sortKey));

    if (sortKey === 'total') {
      // 1) 총 합계 기준 정렬
      const totalCountGroups = await prisma.production_stats.groupBy({
        by: ['prdlstReportNo'],
        where: whereClause
      });
      totalCount = totalCountGroups.length;

      const groupedProducts = await prisma.production_stats.groupBy({
        by: ['prdlstReportNo'],
        where: whereClause,
        _sum: { prdctnQy: true },
        orderBy: {
          _sum: {
            prdctnQy: sortOrder === 'asc' ? 'asc' : 'desc'
          }
        },
        skip: (page - 1) * limit,
        take: limit,
      });

      reportNos = groupedProducts.map(g => g.prdlstReportNo);

      if (reportNos.length > 0) {
        const productDetails = await prisma.production_stats.findMany({
          where: { prdlstReportNo: { in: reportNos } },
          distinct: ['prdlstReportNo'],
          select: {
            prdlstReportNo: true,
            prdlstNm: true,
            bsshNm: true,
            hItemNm: true
          }
        });
        const detailsMap = new Map(productDetails.map(p => [p.prdlstReportNo, p]));
        orderedProducts = reportNos.map(no => detailsMap.get(no) || { prdlstReportNo: no, prdlstNm: '', bsshNm: '', hItemNm: '' });
      }
    } else if (isYearSort) {
      // 2) 특정 연도 생산량 기준 정렬
      totalCount = await prisma.production_stats.count({
        where: { ...whereClause, evlYr: String(sortKey) }
      });

      const yearlyProducts = await prisma.production_stats.findMany({
        where: { ...whereClause, evlYr: String(sortKey) },
        orderBy: { prdctnQy: sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          prdlstReportNo: true,
          prdlstNm: true,
          bsshNm: true,
          hItemNm: true
        }
      });

      reportNos = yearlyProducts.map(p => p.prdlstReportNo);
      orderedProducts = yearlyProducts;
    } else if (sortKey === 'prdlstNm' || sortKey === 'bsshNm') {
      // 3) 품목명 또는 업체명 기준 정렬
      const totalCountGroups = await prisma.production_stats.groupBy({
        by: ['prdlstReportNo'],
        where: whereClause
      });
      totalCount = totalCountGroups.length;

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
        orderBy: { [sortKey]: sortOrder === 'asc' ? 'asc' : 'desc' }
      });

      reportNos = distinctProducts.map(p => p.prdlstReportNo);
      orderedProducts = distinctProducts;
    } else {
      // 기본 정렬
      const totalCountGroups = await prisma.production_stats.groupBy({
        by: ['prdlstReportNo'],
        where: whereClause
      });
      totalCount = totalCountGroups.length;

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

      reportNos = distinctProducts.map(p => p.prdlstReportNo);
      orderedProducts = distinctProducts;
    }

    // 선택된 품목들에 대한 모든 연도 실적 가져오기
    let matrixData = [];
    if (reportNos.length > 0) {
      const yearlyRawData = await prisma.production_stats.findMany({
        where: {
          prdlstReportNo: { in: reportNos }
        },
        select: {
          prdlstReportNo: true,
          evlYr: true,
          prdctnQy: true
        }
      });

      // 데이터 가공 (Pivot)
      matrixData = orderedProducts.map(p => {
        const yearly = {};
        yearlyRawData.filter(d => d.prdlstReportNo === p.prdlstReportNo).forEach(d => {
          yearly[d.evlYr] = d.prdctnQy;
        });
        return { ...p, yearly };
      });
    }

    return NextResponse.json({
      success: true,
      yearlyTrend,
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
