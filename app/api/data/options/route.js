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

// 개별인정형 라벨 끝의 승인번호: 대표명(제2009-80호)
const APPROVAL_LABEL = /\(제\d{4}-\d+호\)$/;

export async function GET() {
  try {
    // 1. ingredients_data.json 로드 (분류·소분류 사전으로만 사용, 건수는 DB 기준)
    const jsonPath = path.join(process.cwd(), 'ingredients_data.json');
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));

    // 2. DB에서 실제 사용 중인 기능성 라벨과 제품 수 집계
    //    normalizedFunctionality 는 lib/ingredientNormalizer.mjs 규칙으로 만든 대표명 목록이라
    //    표기가 달라도 같은 원료는 한 항목으로 모이고, 개별인정형은 "대표명(제YYYY-N호)" 단위다.
    const grouped = await prisma.declarations.groupBy({
      by: ['normalizedFunctionality'],
      where: { normalizedFunctionality: { not: '' } },
      _count: { _all: true },
    });
    const counts = new Map();
    grouped.forEach(row => {
      row.normalizedFunctionality.split(',').forEach(f => {
        const label = f.trim();
        if (label) counts.set(label, (counts.get(label) || 0) + row._count._all);
      });
    });

    // 3. 분류: JSON 사전(영양성분/기능성원료 등)에 있으면 그 분류, 승인번호가 붙은 라벨은 개별인정형, 나머지는 기타
    const toKey = (name) => name.replace(/\s+/g, '').toLowerCase();
    const knownCategory = new Map();
    jsonData.categories.forEach(cat => cat.items.forEach(item => knownCategory.set(toKey(item.name), cat.category)));

    const normalizedItems = [...counts.entries()]
      .map(([name, count]) => {
        const category = knownCategory.get(toKey(name)) || (APPROVAL_LABEL.test(name) ? '개별인정형' : '기타');
        return { name, count, category, subcategory: getSubcategory(name, category) };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
      .map((item, index) => ({ id: `fn_${index + 1}`, ...item }));

    const descriptions = new Map(jsonData.categories.map(cat => [cat.category, cat.description]));
    const categories = ['영양성분', '기능성원료', '개별인정형', '기타']
      .map(category => ({
        category,
        description: descriptions.get(category) || (category === '기타' ? '미분류 성분' : ''),
        items: normalizedItems.filter(item => item.category === category),
      }))
      .filter(cat => cat.items.length > 0);

    // 4. 인기 항목 (Top 20)
    const top20 = normalizedItems.slice(0, 20);

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
        all: normalizedItems,
        top20,
        categories
      },
      packagings: Array.from(packagings).sort(),
      formulations
    });
  } catch (error) {
    console.error('Options API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
