import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'ingredient'; // 'ingredient' | 'category' | 'formulation' | 'companies' | 'list'
    const ingredientId = searchParams.get('ingredientId');
    const categoryName = searchParams.get('category');
    const search = (searchParams.get('search') || '').trim();

    // 0. 개별인정원료 선택 목록 (드롭다운용)
    if (type === 'list') {
      const ingredients = await prisma.individual_raw_materials.findMany({
        select: {
          id: true,
          name: true,
          recognitionNumber: true,
          company: true,
          categories: true,
          functionalityText: true,
          dailyIntake: true,
          registeredDate: true
        },
        orderBy: { id: 'desc' }
      });
      return NextResponse.json({ success: true, ingredients });
    }

    // 1. [Report 1: 개별인정원료별 시장 규모 & 생산 점유율]
    if (type === 'ingredient') {
      let targetIngredient = null;
      if (ingredientId) {
        targetIngredient = await prisma.individual_raw_materials.findUnique({
          where: { id: parseInt(ingredientId, 10) }
        });
      } else if (search) {
        targetIngredient = await prisma.individual_raw_materials.findFirst({
          where: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { recognitionNumber: { contains: search, mode: 'insensitive' } }
            ]
          }
        });
      } else {
        // 기본 1위 샘플 (루테인, 쏘팔메토, 홍경천 등 또는 첫번째)
        targetIngredient = await prisma.individual_raw_materials.findFirst({
          where: { name: { not: null } },
          orderBy: { id: 'desc' }
        });
      }

      if (!targetIngredient) {
        return NextResponse.json({ success: false, error: '원료를 찾을 수 없습니다.' }, { status: 404 });
      }

      // 원료명 클리닝 및 매칭 키워드 구성
      const cleanName = (targetIngredient.name || '').replace(/\([^)]*\)/g, '').trim();
      const rawKeywords = [cleanName, targetIngredient.name].filter(k => k && k.length >= 2);

      // 해당 원료가 함유된 완제품 품목 검색 (declarations)
      const matchedDeclarations = await prisma.declarations.findMany({
        where: {
          OR: rawKeywords.flatMap(kw => [
            { indvRawmtrlNm: { contains: kw, mode: 'insensitive' } },
            { rawmtrlNm: { contains: kw, mode: 'insensitive' } },
            { prdlstNm: { contains: kw, mode: 'insensitive' } },
            { primaryFnclty: { contains: kw, mode: 'insensitive' } }
          ])
        },
        select: {
          prdlstReportNo: true,
          prdlstNm: true,
          bsshNm: true,
          dispos: true,
          prmsDt: true,
          primaryFnclty: true
        }
      });

      const reportNos = Array.from(new Set(matchedDeclarations.map(d => d.prdlstReportNo))).filter(Boolean);

      // 생산실적 데이터 조회
      const productionRecords = reportNos.length > 0 ? await prisma.production_stats.findMany({
        where: {
          prdlstReportNo: { in: reportNos }
        },
        select: {
          prdlstReportNo: true,
          prdlstNm: true,
          bsshNm: true,
          evlYr: true,
          prdctnQy: true
        }
      }) : [];

      // 1-1. 연도별 생산량 합계 추이 (2016 ~ 2025)
      const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
      const yearlyProduction = YEARS.map(yr => {
        const total = productionRecords
          .filter(r => r.evlYr === yr)
          .reduce((acc, cur) => acc + (cur.prdctnQy || 0), 0);
        return { year: yr, amount: Math.round(total * 100) / 100 };
      });

      const totalAllYears = yearlyProduction.reduce((acc, cur) => acc + cur.amount, 0);

      // CAGR 계산 (2020 vs 2025 등 데이터 있는 구간)
      const firstValid = yearlyProduction.find(y => y.amount > 0);
      const lastValid = [...yearlyProduction].reverse().find(y => y.amount > 0);
      let cagr = 0;
      if (firstValid && lastValid && firstValid.year !== lastValid.year && firstValid.amount > 0) {
        const yearsDiff = parseInt(lastValid.year) - parseInt(firstValid.year);
        cagr = Math.round((Math.pow(lastValid.amount / firstValid.amount, 1 / yearsDiff) - 1) * 1000) / 10;
      }

      // 1-2. 제조사별 생산 점유율 Top 5
      const companyMap = {};
      productionRecords.forEach(r => {
        const comp = r.bsshNm || '기타';
        companyMap[comp] = (companyMap[comp] || 0) + (r.prdctnQy || 0);
      });
      const topCompanies = Object.entries(companyMap)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount * 100) / 100,
          share: totalAllYears > 0 ? Math.round((amount / totalAllYears) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // 1-3. 완제품 품목별 생산실적 매트릭스 (상위 15개)
      const productMap = {};
      matchedDeclarations.forEach(d => {
        productMap[d.prdlstReportNo] = {
          prdlstReportNo: d.prdlstReportNo,
          prdlstNm: d.prdlstNm,
          bsshNm: d.bsshNm,
          dispos: d.dispos,
          prmsDt: d.prmsDt,
          total: 0,
          yearly: {}
        };
      });

      productionRecords.forEach(r => {
        if (productMap[r.prdlstReportNo]) {
          productMap[r.prdlstReportNo].yearly[r.evlYr] = (productMap[r.prdlstReportNo].yearly[r.evlYr] || 0) + (r.prdctnQy || 0);
          productMap[r.prdlstReportNo].total += (r.prdctnQy || 0);
        }
      });

      const topProducts = Object.values(productMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 20)
        .map(p => ({
          ...p,
          total: Math.round(p.total * 100) / 100
        }));

      return NextResponse.json({
        success: true,
        type: 'ingredient',
        ingredient: targetIngredient,
        stats: {
          totalProductsCount: matchedDeclarations.length,
          activeProductionProducts: reportNos.filter(no => productionRecords.some(r => r.prdlstReportNo === no)).length,
          totalAllYears: Math.round(totalAllYears * 100) / 100,
          cagr
        },
        yearlyProduction,
        topCompanies,
        topProducts
      });
    }

    // 2. [Report 2: 기능성 카테고리별 생산실적 트렌드 & 성장률 매트릭스]
    if (type === 'category') {
      const selectedCat = categoryName || '체지방감소';
      const catInfo = CATEGORIES_MASTER.find(c => c.name === selectedCat) || CATEGORIES_MASTER[0];

      // 카테고리 키워드로 완제품 품목 및 개별원료 매칭
      const matchedIngredients = await prisma.individual_raw_materials.findMany({
        where: {
          OR: [
            { categories: { contains: catInfo.name, mode: 'insensitive' } },
            ...catInfo.keywords.map(kw => ({ functionalityText: { contains: kw, mode: 'insensitive' } }))
          ]
        },
        select: { id: true, name: true, recognitionNumber: true, company: true, functionalityText: true }
      });

      // 해당 기능성 완제품 조회 (declarations)
      const matchedProducts = await prisma.declarations.findMany({
        where: {
          OR: [
            ...catInfo.keywords.map(kw => ({ primaryFnclty: { contains: kw, mode: 'insensitive' } })),
            ...catInfo.keywords.map(kw => ({ normalizedFunctionality: { contains: kw, mode: 'insensitive' } }))
          ]
        },
        select: { prdlstReportNo: true, prdlstNm: true, bsshNm: true, dispos: true, prmsDt: true },
        take: 300
      });

      const reportNos = matchedProducts.map(p => p.prdlstReportNo).filter(Boolean);

      // 생산실적
      const productions = reportNos.length > 0 ? await prisma.production_stats.findMany({
        where: { prdlstReportNo: { in: reportNos } },
        select: { prdlstReportNo: true, evlYr: true, prdctnQy: true, bsshNm: true }
      }) : [];

      const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
      const yearlyTrend = YEARS.map(yr => {
        const amount = productions.filter(p => p.evlYr === yr).reduce((acc, c) => acc + (c.prdctnQy || 0), 0);
        return { year: yr, amount: Math.round(amount * 100) / 100 };
      });

      // 제조사 랭킹
      const compMap = {};
      productions.forEach(p => {
        const c = p.bsshNm || '기타';
        compMap[c] = (compMap[c] || 0) + (p.prdctnQy || 0);
      });
      const topCompanies = Object.entries(compMap)
        .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

      return NextResponse.json({
        success: true,
        type: 'category',
        category: catInfo,
        allCategories: CATEGORIES_MASTER.map(c => ({ name: c.name, description: c.description })),
        stats: {
          ingredientCount: matchedIngredients.length,
          productCount: matchedProducts.length,
          totalAmount: Math.round(yearlyTrend.reduce((acc, c) => acc + c.amount, 0) * 100) / 100
        },
        yearlyTrend,
        matchedIngredients: matchedIngredients.slice(0, 15),
        topCompanies
      });
    }

    // 3. [Report 3: 제형 & 복합 배합 인텔리전스]
    if (type === 'formulation') {
      const topShapes = await prisma.declarations.groupBy({
        by: ['prdtShapCdNm'],
        where: { prdtShapCdNm: { not: null } },
        _count: { prdlstReportNo: true },
        orderBy: { _count: { prdlstReportNo: 'desc' } },
        take: 8
      });

      return NextResponse.json({
        success: true,
        type: 'formulation',
        shapesDistribution: topShapes.map(s => ({ shape: s.prdtShapCdNm || '기타', count: s._count.prdlstReportNo }))
      });
    }

    // 4. [Report 4: 주요 제조사별 포트폴리오 분석]
    if (type === 'companies') {
      const targetYear = '2025';
      const companyRanking = await prisma.production_stats.groupBy({
        by: ['bsshNm'],
        where: { evlYr: targetYear },
        _sum: { prdctnQy: true },
        orderBy: { _sum: { prdctnQy: 'desc' } },
        take: 10
      });

      return NextResponse.json({
        success: true,
        type: 'companies',
        year: targetYear,
        ranking: companyRanking.map(c => ({ company: c.bsshNm, amount: Math.round((c._sum.prdctnQy || 0) * 100) / 100 }))
      });
    }

    return NextResponse.json({ success: false, error: '유효하지 않은 리포트 타입입니다.' }, { status: 400 });

  } catch (error) {
    console.error('Analytics Report API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}