import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';
import { classifyDeclaration } from '@/lib/classify_declaration';

// prmsDt(YYYYMMDD) → ISO 주차 키 "YYYY-Www"
function getISOWeekKey(prmsDt) {
  if (!prmsDt || prmsDt.length < 8) return null;
  const y = parseInt(prmsDt.substring(0, 4));
  const m = parseInt(prmsDt.substring(4, 6)) - 1;
  const d = parseInt(prmsDt.substring(6, 8));
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  const date = new Date(Date.UTC(y, m, d));
  const dow = date.getUTCDay() || 7; // 1(월)~7(일)
  date.setUTCDate(date.getUTCDate() + 4 - dow); // 해당 주 목요일
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// 주차 시작(월)~종료(일) 날짜 범위 레이블
function getWeekDateRange(weekKey) {
  const [yearStr, wPart] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wPart);

  // ISO 1주차 월요일 계산
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - dow + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const fmt = d => `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return `${fmt(monday)}~${fmt(sunday)}`;
}


export async function GET() {
  try {
    // 현재 기준 15주 전 날짜 (YYYYMMDD)
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(now.getDate() - 15 * 7);
    const startDate = cutoff.toISOString().slice(0, 10).replace(/-/g, '');

    const rows = await prisma.declarations.findMany({
      where: {
        prmsDt: { gte: startDate, not: null },
      },
      select: {
        prmsDt: true,
        primaryFnclty: true,
        normalizedFunctionality: true,
        rawmtrlNm: true,
      },
    });

    // 주차별 카테고리 카운트 집계
    const weekMap = {}; // { "2026-W25": { "항산화": 87, ... } }

    for (const row of rows) {
      const weekKey = getISOWeekKey(row.prmsDt);
      if (!weekKey) continue;

      const cats = classifyDeclaration(row.primaryFnclty, row.normalizedFunctionality, row.rawmtrlNm);
      if (cats.length === 0) continue;

      if (!weekMap[weekKey]) weekMap[weekKey] = {};
      for (const cat of cats) {
        weekMap[weekKey][cat] = (weekMap[weekKey][cat] || 0) + 1;
      }
    }

    // 최신 주차 순 정렬
    const sortedWeeks = Object.keys(weekMap).sort((a, b) => b.localeCompare(a));

    const weeklyRankings = sortedWeeks.map(weekKey => {
      const catData = weekMap[weekKey];
      const rankings = Object.entries(catData)
        .map(([name, count]) => {
          const meta = CATEGORIES_MASTER.find(c => c.name === name);
          return { name, displayName: meta?.displayName || name, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 15)
        .map((item, idx) => ({ rank: idx + 1, ...item }));

      return {
        week: weekKey,
        label: `${weekKey.replace('-W', '년 ')}주차`,
        dateRange: getWeekDateRange(weekKey),
        rankings,
      };
    });

    return NextResponse.json({ success: true, weeks: sortedWeeks, weeklyRankings });
  } catch (error) {
    console.error('Weekly Trend API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
