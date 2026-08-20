import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isNutrient } from '@/lib/nutrients';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const recentRange = searchParams.get('recentRange') || '6m';

    const totalCount = await prisma.declarations.count();

    // --- 인사이트 강화: 기간별 증감폭 분석 (최근 90일 vs 이전 90일) ---
    const now = new Date();
    const tCurrent = new Date(); tCurrent.setDate(now.getDate() - 90);
    const tPrevious = new Date(); tPrevious.setDate(now.getDate() - 180);
    
    const fmt = (d) => d.toISOString().split('T')[0].replace(/-/g, '');
    const sCurrent = fmt(tCurrent);
    const sPrevious = fmt(tPrevious);

    const allRecordsTrend = await prisma.declarations.findMany({
      where: { prmsDt: { gte: sPrevious } },
      select: { normalizedFunctionality: true, prmsDt: true }
    });

    const currentMap = {};
    const previousMap = {};
    const countsMap = {};

    allRecordsTrend.forEach(doc => {
      if (doc.normalizedFunctionality) {
        const functs = doc.normalizedFunctionality.split(',').map(v => v.trim()).filter(Boolean);
        functs.forEach(f => {
          // 영양성분 제외
          if (isNutrient(f)) return;
            
          // 누적 카운트
          countsMap[f] = (countsMap[f] || 0) + 1;
          // 기간별 카운트
          if (doc.prmsDt >= sCurrent) {
            currentMap[f] = (currentMap[f] || 0) + 1;
          } else if (doc.prmsDt >= sPrevious) {
            previousMap[f] = (previousMap[f] || 0) + 1;
          }
        });
      }
    });

    const allFuncsRest = await prisma.declarations.findMany({
      where: { prmsDt: { lt: sPrevious } },
      select: { normalizedFunctionality: true }
    });
    allFuncsRest.forEach(doc => {
      if (doc.normalizedFunctionality) {
        doc.normalizedFunctionality.split(',').forEach(term => {
          const clean = term.trim();
          if (clean && !isNutrient(clean)) countsMap[clean] = (countsMap[clean] || 0) + 1;
        });
      }
    });

    const allFunctKeys = Array.from(new Set([...Object.keys(currentMap), ...Object.keys(previousMap)]));
    const trends = allFunctKeys.map(key => {
      const c = currentMap[key] || 0;
      const p = previousMap[key] || 0;
      return { label: key, current: c, previous: p, diff: c - p };
    });

    const risingTrends = trends.filter(t => t.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
    const fallingTrends = trends.filter(t => t.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);

    // 기존 누적 통계
    const functStats = Object.entries(countsMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a,b) => b.count - a.count)
      .slice(0, 10);

    // 최다 신고 업체 목록 (Market Share) - 기간 필터 적용
    let msThresholdDate = new Date();
    let msWhere = { bsshNm: { not: null, not: "" } };
    
    if (recentRange !== 'all') {
       if (recentRange === '1m') msThresholdDate.setMonth(now.getMonth() - 1);
       else if (recentRange === '3m') msThresholdDate.setMonth(now.getMonth() - 3);
       else if (recentRange === '6m') msThresholdDate.setMonth(now.getMonth() - 6);
       else if (recentRange === '1y') msThresholdDate.setFullYear(now.getFullYear() - 1);
       else if (recentRange === '2y') msThresholdDate.setFullYear(now.getFullYear() - 2);
       
       const msThresholdStr = msThresholdDate.toISOString().split('T')[0].replace(/-/g, '');
       msWhere.prmsDt = { gte: msThresholdStr };
    }

    const topCompanies = await prisma.declarations.groupBy({
      by: ['bsshNm'],
      _count: { bsshNm: true },
      orderBy: { _count: { bsshNm: 'desc' } },
      take: 10,
      where: msWhere
    });

    const companyStats = topCompanies.map(g => ({
       label: g.bsshNm || '미상',
       count: g._count.bsshNm
    }));
    
    // 최근 12개월 월별, 최근 7일 일별 허가 추이
    const allDates = await prisma.declarations.findMany({
       select: { prmsDt: true },
       where: { prmsDt: { not: null, not: "" } }
    });

    const monthlyCounts = {};
    const dailyCounts = {};

    allDates.forEach(item => {
       let dtStr = item.prmsDt.replace(/\D/g, ''); 
       if (dtStr.length >= 6) {
          const yyyymm = dtStr.substring(0, 4) + '-' + dtStr.substring(4, 6);
          monthlyCounts[yyyymm] = (monthlyCounts[yyyymm] || 0) + 1;
       }
       if (dtStr.length >= 8) {
          const yyyymmdd = dtStr.substring(0, 4) + '-' + dtStr.substring(4, 6) + '-' + dtStr.substring(6, 8);
          dailyCounts[yyyymmdd] = (dailyCounts[yyyymmdd] || 0) + 1;
       }
    });

    const sortedMonths = Object.keys(monthlyCounts).sort().slice(-12);
    const monthlyStats = sortedMonths.map(m => ({ label: m, count: monthlyCounts[m] }));

    const sortedDays = Object.keys(dailyCounts).sort().slice(-7);
    const dailyStats = sortedDays.map(d => ({ label: d, count: dailyCounts[d] }));

    // 최근 등록된 5건
    const recentAdditions = await prisma.declarations.findMany({
        orderBy: { prmsDt: 'desc' },
        take: 5,
        select: { prdlstNm: true, bsshNm: true, prmsDt: true, prdlstReportNo: true }
    });

    // 최근 액티브 신규 품목신고 Top 10 업체 (기간 필터 적용)
    let thresholdDate = new Date();
    if (recentRange === '1m') thresholdDate.setMonth(now.getMonth() - 1);
    else if (recentRange === '3m') thresholdDate.setMonth(now.getMonth() - 3);
    else if (recentRange === '1y') thresholdDate.setFullYear(now.getFullYear() - 1);
    else if (recentRange === '2y') thresholdDate.setFullYear(now.getFullYear() - 2);
    else thresholdDate.setMonth(now.getMonth() - 6); // default 6m

    // Format to YYYYMMDD
    const thresholdStr = thresholdDate.toISOString().split('T')[0].replace(/-/g, '');

    const recentActive = await prisma.declarations.groupBy({
        by: ['bsshNm'],
        _count: { bsshNm: true },
        where: {
            prmsDt: { gte: thresholdStr },
            bsshNm: { not: null, not: "" }
        },
        orderBy: {
            _count: { bsshNm: 'desc' }
        },
        take: 10
    });

    const recentCompanyStats = recentActive.map(g => ({
        label: g.bsshNm,
        count: g._count.bsshNm
    }));

    return NextResponse.json({ 
       success: true, 
       totalCount, 
       functStats,
       risingTrends,
       fallingTrends,
       companyStats,
       monthlyStats, 
       dailyStats, 
       recentAdditions,
       recentCompanyStats 
    });
  } catch (error) {
    console.error('Stats API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
