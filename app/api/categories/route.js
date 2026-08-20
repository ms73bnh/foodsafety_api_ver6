import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';
import { classifyDeclaration } from '@/lib/classify_declaration';

export async function GET(req) {
  try {
    // 1. declarations 테이블 전체 → 연도별 카테고리 집계
    const rows = await prisma.declarations.findMany({
      select: {
        prmsDt: true,
        primaryFnclty: true,
        normalizedFunctionality: true,
        rawmtrlNm: true,
      }
    });

    // { "2025": { "항산화": 500, ... }, ... }
    const yearCatMap = {};
    let totalUniqueProducts = 0;

    for (const row of rows) {
      const year = row.prmsDt?.substring(0, 4);
      if (!year || parseInt(year) < 2000) continue;
      totalUniqueProducts++;

      const cats = classifyDeclaration(row.primaryFnclty, row.normalizedFunctionality, row.rawmtrlNm);
      if (cats.length === 0) continue;

      if (!yearCatMap[year]) yearCatMap[year] = {};
      for (const cat of cats) {
        yearCatMap[year][cat] = (yearCatMap[year][cat] || 0) + 1;
      }
    }

    // 2. 개별인정형 원료 집계 (ingredientCount + pipeline signal용)
    const rawMaterials = await prisma.individual_raw_materials.findMany({
      select: { categories: true, registeredDate: true }
    });

    const realTimeCountMap = {};
    const realTimeRecentCountMap = {};
    const recentYears = ['2024', '2025', '2026'];

    rawMaterials.forEach(rm => {
      if (!rm.categories) return;
      const cats = rm.categories.split(',').map(c => c.trim()).filter(Boolean);
      const year = rm.registeredDate?.substring(0, 4);
      cats.forEach(cat => {
        realTimeCountMap[cat] = (realTimeCountMap[cat] || 0) + 1;
        if (year && recentYears.includes(year)) {
          realTimeRecentCountMap[cat] = (realTimeRecentCountMap[cat] || 0) + 1;
        }
      });
    });

    // 3. Pipeline Insights (개별인정형 원료 기반 시그널)
    const pipelineInsights = CATEGORIES_MASTER.map(cat => {
      const name = cat.name;
      const total = realTimeCountMap[name] || 0;
      const recent = realTimeRecentCountMap[name] || 0;
      const ratio = total > 0 ? parseFloat((recent / total).toFixed(2)) : 0;

      let signal = 'NORMAL';
      if (total >= 4) {
        if (ratio >= 0.5) signal = 'STRONG';
        else if (ratio >= 0.3) signal = 'MODERATE';
      }

      return { name, total, recent, ratio, signal };
    });

    // 4. 카테고리 카드 데이터
    const recent5Years = ['2022', '2023', '2024', '2025', '2026'];

    const categories = CATEGORIES_MASTER.map(cat => {
      const name = cat.name;
      const ingredientCount = realTimeCountMap[name] || 0;

      // 누적 제품 수 (전체 연도 합산)
      let productCount = 0;
      for (const data of Object.values(yearCatMap)) {
        productCount += (data[name] || 0);
      }

      // 스파크라인 (최근 5년)
      const sparkline = recent5Years.map(year => ({
        year,
        count: yearCatMap[year]?.[name] || 0,
      }));

      // YoY 성장률 (2024 → 2025)
      const count2024 = yearCatMap['2024']?.[name] || 0;
      const count2025 = yearCatMap['2025']?.[name] || 0;
      let growthRate = 0;
      if (count2024 > 0) {
        growthRate = parseFloat((((count2025 - count2024) / count2024) * 100).toFixed(1));
      }

      const pipe = pipelineInsights.find(p => p.name === name);

      return {
        ...cat,
        displayName: cat.displayName || name,
        productCount,
        ingredientCount,
        growthRate,
        sparkline,
        isRapidGrowth: pipe?.signal === 'STRONG',
      };
    });

    // 5. Top 15 연도별 랭킹 (동적)
    const rankingYears = ['2015', '2020', '2025'];
    const rankTrend = rankingYears.map(year => {
      const yearData = yearCatMap[year] || {};
      const sorted = Object.entries(yearData)
        .map(([name, count]) => {
          const catMeta = CATEGORIES_MASTER.find(c => c.name === name);
          return { name, displayName: catMeta?.displayName || name, count };
        })
        .sort((a, b) => b.count - a.count);

      return {
        year,
        rankings: sorted.slice(0, 15).map((item, idx) => ({
          rank: idx + 1,
          name: item.name,
          displayName: item.displayName,
          count: item.count,
        })),
      };
    });

    // 6. CAGR 통계 (동적, 2020→2025 기준)
    const cagrStats = CATEGORIES_MASTER
      .map(cat => {
        const name = cat.name;
        const y2020 = yearCatMap['2020']?.[name] || 0;
        const y2025 = yearCatMap['2025']?.[name] || 0;
        const diff = y2025 - y2020;
        let cagr = 0;
        if (y2020 > 0 && y2025 > 0) {
          cagr = parseFloat((Math.pow(y2025 / y2020, 1 / 5) - 1).toFixed(3));
        }
        return { name, displayName: cat.displayName || name, y2020, y2025, cagr, diff };
      })
      .filter(s => s.y2020 > 0 || s.y2025 > 0)
      .sort((a, b) => b.cagr - a.cagr);

    return NextResponse.json({
      success: true,
      categories,
      rankTrend,
      cagrStats,
      pipelineInsights,
      totalUniqueProducts,
    });

  } catch (error) {
    console.error('Categories API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
