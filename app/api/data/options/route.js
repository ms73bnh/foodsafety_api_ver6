import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSubcategory } from '@/lib/functionality_constants';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * lib/normalizer.js 의 PKG_MAP에 정의된 정규화된 포장재질 라벨 화이트리스트
 * 여기에 없는 항목은 포장재질 핀업 목록에 표시되지 않습니다.
 * 표시 주기/제외 수동 관리가 필요한 경우 여기에서 항목을 추가/제거하세요.
 */
const PACKAGING_WHITELIST = new Set([
  'HDPE(고밀도폴리에틸렌)',
  'LDPE(저밀도폴리에틸렌)',
  'PE(폴리에틸렌)',
  'PP(폴리프로필렌)',
  'PET(폴리에틸렌테레프탈레이트)',
  'PVC(폴리염화비닐)',
  'PS(폴리스티렌)',
  'AL(알루미늄)',
  '유리(Glass)',
  '종이(Paper)',
  'PTP/블리스터',
]);

export async function GET() {
  try {
    // 1. ingredients_data.json 로드
    const jsonPath = path.join(process.cwd(), 'ingredients_data.json');
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

    // 2. DB에서 실제 사용 중인 기능성 목록 추출
    const functionalitiesRaw = await prisma.declarations.findMany({
      where: { 
        normalizedFunctionality: { not: null, not: '' } 
      },
      select: { normalizedFunctionality: true },
      distinct: ['normalizedFunctionality']
    });

    const dbFunctionalities = new Set();
    functionalitiesRaw.forEach(item => {
      item.normalizedFunctionality.split(',').forEach(f => {
        const trimmed = f.trim();
        if (trimmed) dbFunctionalities.add(trimmed);
      });
    });

    // 3. JSON 데이터를 기반으로 정규화된 목록 생성
    const normalizedItems = [];
    const normalizedSet = new Set();

    jsonData.categories.forEach(cat => {
      cat.items.forEach(item => {
        normalizedItems.push({
          ...item,
          subcategory: getSubcategory(item.name, item.category)
        });
        normalizedSet.add(item.name);
      });
    });

    // 4. DB에는 있으나 JSON 정규화 리스트에는 없는 항목들을 '기타(Others)'로 분류
    const otherItems = Array.from(dbFunctionalities)
      .filter(name => !normalizedSet.has(name))
      .map(name => ({
        id: `other_${name}`,
        name,
        count: 0, // 빈도수 정보 없음
        category: '기타',
        subcategory: ''
      }));

    // 5. 인기 항목 (Top 20) 추출 (모든 카테고리 합쳐서 빈도수 높은 순)
    const top20 = [...normalizedItems]
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const packagingsRaw = await prisma.declarations.findMany({
      where: { 
        normalizedPackaging: { not: null, not: '' } 
      },
      select: { normalizedPackaging: true },
      distinct: ['normalizedPackaging']
    });

    const packagings = new Set();
    packagingsRaw.forEach(item => {
      item.normalizedPackaging.split(',').forEach(p => {
        const trimmed = p.trim();
        // 정규화된 호이트리스트에 있는 항목만 표시
        if (trimmed && PACKAGING_WHITELIST.has(trimmed)) packagings.add(trimmed);
      });
    });

    const formulationsRaw = await prisma.declarations.findMany({
      where: { 
        prdtShapCdNm: { not: null, not: '' } 
      },
      select: { prdtShapCdNm: true },
      distinct: ['prdtShapCdNm']
    });

    const formulations = formulationsRaw
      .map(item => item.prdtShapCdNm.trim())
      .filter(f => f)
      .sort();

    return NextResponse.json({
      success: true,
      functionalities: {
        all: [...normalizedItems, ...otherItems],
        top20,
        categories: [
          ...jsonData.categories,
          { category: "기타", description: "미분류 성분", items: otherItems }
        ]
      },
      packagings: Array.from(packagings).sort(),
      formulations
    });
  } catch (error) {
    console.error('Options API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
