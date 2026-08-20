import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isNutrient } from '@/lib/nutrients';

export async function GET(req, { params }) {
  try {
    const { bsshNm } = await params;
    const decodedName = decodeURIComponent(bsshNm);

    const totalCount = await prisma.declarations.count({
      where: { bsshNm: decodedName }
    });

    if (totalCount === 0) {
      return NextResponse.json({ success: false, error: 'Company not found' }, { status: 404 });
    }

    // 기능성 성분 분포 분석 (최근 2000건 대상)
    const recentForStats = await prisma.declarations.findMany({
      where: { bsshNm: decodedName, normalizedFunctionality: { not: null } },
      orderBy: { prmsDt: 'desc' },
      take: 2000,
      select: { normalizedFunctionality: true }
    });

    const functsCountMap = {};
    recentForStats.forEach(item => {
      const rawVal = item.normalizedFunctionality || '';
      rawVal.split(',').forEach(v => {
        const clean = v.trim();
        if (clean && !isNutrient(clean)) {
          functsCountMap[clean] = (functsCountMap[clean] || 0) + 1;
        }
      });
    });

    const functStats = Object.keys(functsCountMap)
      .map(k => ({ label: k, count: functsCountMap[k] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const allDates = await prisma.declarations.findMany({
       select: { prmsDt: true },
       where: { bsshNm: decodedName, prmsDt: { not: null, not: "" } }
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

    const sortedMonths = Object.keys(monthlyCounts).sort();
    const monthlyStats = sortedMonths.map(m => ({ label: m, count: monthlyCounts[m] }));

    const sortedDays = Object.keys(dailyCounts).sort();
    const dailyStats = sortedDays.map(d => ({ label: d, count: dailyCounts[d] }));

    const recentItems = await prisma.declarations.findMany({
      where: { bsshNm: decodedName },
      orderBy: { prmsDt: 'desc' },
      take: 20,
      select: { prdlstNm: true, prmsDt: true, prdlstReportNo: true, dispos: true, normalizedFunctionality: true }
    });

    return NextResponse.json({ success: true, companyName: decodedName, totalCount, functStats, monthlyStats, dailyStats, recentItems });
  } catch (error) {
    console.error('Company Detail API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
