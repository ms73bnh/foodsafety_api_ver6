import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { CATEGORIES_MASTER } from '@/lib/category_data';

// 개별인정원료 매칭 헬퍼: 인정번호가 있으면 인정번호로 우선 매칭하고 없으면 원료명으로 fallback
async function getMatchedDeclarations(targetIngredient) {
  const recogNo = targetIngredient.recognitionNumber?.trim();
  let matchedDeclarations = [];

  if (recogNo) {
    const match = recogNo.match(/(\d{4}[-\s]?\d+)/);
    const coreRecogNo = match ? match[1].replace(/\s+/g, '') : recogNo;
    const recogKeywords = Array.from(new Set([recogNo, coreRecogNo, `제${coreRecogNo}호`])).filter(Boolean);

    matchedDeclarations = await prisma.declarations.findMany({
      where: {
        OR: recogKeywords.flatMap(kw => [
          { indvRawmtrlNm: { contains: kw, mode: 'insensitive' } },
          { rawmtrlNm: { contains: kw, mode: 'insensitive' } },
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
  }

  // 인정번호로 매칭된 결과가 없으면 원료명으로 fallback 검색
  if (matchedDeclarations.length === 0) {
    const cleanName = (targetIngredient.name || '').replace(/\([^)]*\)/g, '').trim();
    const rawKeywords = [cleanName, targetIngredient.name].filter(k => k && k.length >= 2);

    if (rawKeywords.length > 0) {
      matchedDeclarations = await prisma.declarations.findMany({
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
    }
  }

  return matchedDeclarations;
}

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
              { recognitionNumber: { contains: search, mode: 'insensitive' } },
              { company: { contains: search, mode: 'insensitive' } }
            ]
          }
        });
      } else {
        targetIngredient = await prisma.individual_raw_materials.findFirst({
          where: { name: { not: null } },
          orderBy: { id: 'desc' }
        });
      }

      if (!targetIngredient) {
        return NextResponse.json({ success: false, error: '원료를 찾을 수 없습니다.' }, { status: 404 });
      }

      // 해당 원료가 함유된 완제품 품목 검색 (인정번호 우선 매칭)
      const matchedDeclarations = await getMatchedDeclarations(targetIngredient);

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

      // 1-1. 10개년 연도별 생산량 합계 추이 (2016 ~ 2025)
      const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
      const yearlyProduction = YEARS.map(yr => {
        const total = productionRecords
          .filter(r => r.evlYr === yr)
          .reduce((acc, cur) => acc + (cur.prdctnQy || 0), 0);
        return { year: yr, amount: Math.round(total * 100) / 100 };
      });

      const totalAllYears = yearlyProduction.reduce((acc, cur) => acc + cur.amount, 0);

      // CAGR 계산
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

      // 1-3. 완제품 품목별 생산실적 매트릭스 (10개년 전체 포함)
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
        .slice(0, 50)
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

    // 2. [Report 2: 소재 & 품목 인텔리전스 (심층 분석)]
    if (type === 'insight' || type === 'category') {
      const keyword = search || categoryName || '루바브';
      
      // 관련 개별인정원료 조회
      const matchedIngredients = await prisma.individual_raw_materials.findMany({
        where: {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { recognitionNumber: { contains: keyword, mode: 'insensitive' } },
            { company: { contains: keyword, mode: 'insensitive' } },
            { functionalityText: { contains: keyword, mode: 'insensitive' } },
            { categories: { contains: keyword, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, recognitionNumber: true, company: true, registeredDate: true, functionalityText: true, dailyIntake: true },
        take: 15
      });

      // 관련 완제품 조회 (declarations)
      const matchedProducts = await prisma.declarations.findMany({
        where: {
          OR: [
            { indvRawmtrlNm: { contains: keyword, mode: 'insensitive' } },
            { rawmtrlNm: { contains: keyword, mode: 'insensitive' } },
            { prdlstNm: { contains: keyword, mode: 'insensitive' } },
            { primaryFnclty: { contains: keyword, mode: 'insensitive' } }
          ]
        },
        select: {
          prdlstReportNo: true,
          prdlstNm: true,
          bsshNm: true,
          dispos: true,
          prmsDt: true,
          primaryFnclty: true
        },
        take: 200
      });

      const reportNos = matchedProducts.map(p => p.prdlstReportNo).filter(Boolean);

      // 생산실적 데이터 조회
      const productions = reportNos.length > 0 ? await prisma.production_stats.findMany({
        where: { prdlstReportNo: { in: reportNos } },
        select: { prdlstReportNo: true, evlYr: true, prdctnQy: true, bsshNm: true }
      }) : [];

      const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
      const yearlyTrend = YEARS.map(yr => {
        const amount = productions.filter(p => p.evlYr === yr).reduce((acc, c) => acc + (c.prdctnQy || 0), 0);
        return { year: yr, amount: Math.round(amount * 100) / 100 };
      });

      // 제조사 랭킹 & 점유율
      const compMap = {};
      productions.forEach(p => {
        const c = p.bsshNm || '기타';
        compMap[c] = (compMap[c] || 0) + (p.prdctnQy || 0);
      });
      const totalAmount = yearlyTrend.reduce((acc, c) => acc + c.amount, 0);
      const topCompanies = Object.entries(compMap)
        .map(([name, amount]) => ({
          name,
          amount: Math.round(amount * 100) / 100,
          share: totalAmount > 0 ? Math.round((amount / totalAmount) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

      // 완제품 매트릭스 (10개년 생산량 결합)
      const productMap = {};
      matchedProducts.forEach(d => {
        productMap[d.prdlstReportNo] = {
          prdlstReportNo: d.prdlstReportNo,
          prdlstNm: d.prdlstNm,
          bsshNm: d.bsshNm,
          dispos: d.dispos,
          prmsDt: d.prmsDt,
          primaryFnclty: d.primaryFnclty,
          total: 0,
          yearly: {}
        };
      });

      productions.forEach(r => {
        if (productMap[r.prdlstReportNo]) {
          productMap[r.prdlstReportNo].yearly[r.evlYr] = (productMap[r.prdlstReportNo].yearly[r.evlYr] || 0) + (r.prdctnQy || 0);
          productMap[r.prdlstReportNo].total += (r.prdctnQy || 0);
        }
      });

      const productList = Object.values(productMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 50)
        .map(p => ({
          ...p,
          total: Math.round(p.total * 100) / 100
        }));

      return NextResponse.json({
        success: true,
        type: 'insight',
        keyword,
        stats: {
          ingredientCount: matchedIngredients.length,
          productCount: matchedProducts.length,
          totalAmount: Math.round(totalAmount * 100) / 100
        },
        yearlyTrend,
        matchedIngredients,
        topCompanies,
        productList
      });
    }

    // 3. [Report 3: 3-Pane 드릴다운 - 소재별 제조사 목록 + 품목별 10개년 데이터]
    if (type === 'drilldown') {
      if (!ingredientId) {
        return NextResponse.json({ success: false, error: 'ingredientId가 필요합니다.' }, { status: 400 });
      }

      const targetIngredient = await prisma.individual_raw_materials.findUnique({
        where: { id: parseInt(ingredientId, 10) }
      });

      if (!targetIngredient) {
        return NextResponse.json({ success: false, error: '원료를 찾을 수 없습니다.' }, { status: 404 });
      }

      // 해당 원료 함유 완제품 전체 조회 (인정번호 우선 매칭)
      const matchedDeclarations = await getMatchedDeclarations(targetIngredient);

      const reportNos = Array.from(new Set(matchedDeclarations.map(d => d.prdlstReportNo))).filter(Boolean);

      const productionRecords = reportNos.length > 0 ? await prisma.production_stats.findMany({
        where: { prdlstReportNo: { in: reportNos } },
        select: {
          prdlstReportNo: true,
          bsshNm: true,
          evlYr: true,
          prdctnQy: true
        }
      }) : [];

      const YEARS = ['2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];

      // 제조사별 통계 집계 (선언 기반 품목 수 + 생산실적 기반 생산량)
      const companyMap = {};
      matchedDeclarations.forEach(d => {
        const comp = d.bsshNm || '기타';
        if (!companyMap[comp]) {
          companyMap[comp] = { name: comp, total: 0, yearly: {}, products: new Set() };
        }
        companyMap[comp].products.add(d.prdlstReportNo);
      });
      productionRecords.forEach(r => {
        const comp = r.bsshNm || '기타';
        if (!companyMap[comp]) {
          companyMap[comp] = { name: comp, total: 0, yearly: {}, products: new Set() };
        }
        companyMap[comp].total += (r.prdctnQy || 0);
        companyMap[comp].yearly[r.evlYr] = (companyMap[comp].yearly[r.evlYr] || 0) + (r.prdctnQy || 0);
      });

      const totalAllYears = productionRecords.reduce((acc, r) => acc + (r.prdctnQy || 0), 0);
      const companies = Object.values(companyMap).map(c => ({
        name: c.name,
        total: Math.round(c.total * 100) / 100,
        yearly: c.yearly,
        productCount: c.products.size,
        share: totalAllYears > 0 ? Math.round((c.total / totalAllYears) * 1000) / 10 : 0
      })).sort((a, b) => b.total - a.total);

      // 10개년 연도별 총 생산량
      const yearlyProduction = YEARS.map(yr => {
        const total = productionRecords.filter(r => r.evlYr === yr).reduce((acc, cur) => acc + (cur.prdctnQy || 0), 0);
        return { year: yr, amount: Math.round(total * 100) / 100 };
      });

      const totalProdAll = yearlyProduction.reduce((acc, cur) => acc + cur.amount, 0);

      // CAGR 계산
      const firstValid = yearlyProduction.find(y => y.amount > 0);
      const lastValid = [...yearlyProduction].reverse().find(y => y.amount > 0);
      let cagr = 0;
      if (firstValid && lastValid && firstValid.year !== lastValid.year && firstValid.amount > 0) {
        const yearsDiff = parseInt(lastValid.year) - parseInt(firstValid.year);
        cagr = Math.round((Math.pow(lastValid.amount / firstValid.amount, 1 / yearsDiff) - 1) * 1000) / 10;
      }

      // 완제품 매트릭스 구성
      const productMap = {};
      matchedDeclarations.forEach(d => {
        productMap[d.prdlstReportNo] = {
          prdlstReportNo: d.prdlstReportNo,
          prdlstNm: d.prdlstNm,
          bsshNm: d.bsshNm,
          dispos: d.dispos,
          prmsDt: d.prmsDt,
          primaryFnclty: d.primaryFnclty,
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

      const allProducts = Object.values(productMap)
        .sort((a, b) => b.total - a.total)
        .map(p => ({ ...p, total: Math.round(p.total * 100) / 100 }));

      return NextResponse.json({
        success: true,
        type: 'drilldown',
        ingredient: targetIngredient,
        stats: {
          totalProductsCount: matchedDeclarations.length,
          activeProductionProducts: reportNos.filter(no => productionRecords.some(r => r.prdlstReportNo === no)).length,
          totalAllYears: Math.round(totalProdAll * 100) / 100,
          cagr
        },
        companies,
        yearlyProduction,
        allProducts
      });
    }

    // 4. [Report 4: 제형 & 복합 배합 인텔리전스]
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