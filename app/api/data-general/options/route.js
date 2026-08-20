import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSalesOrAbove } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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

export async function GET(req) {
  try {
    if (!isSalesOrAbove(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 1. 포장재질 목록 추출
    const packagingsRaw = await prisma.general_declarations.findMany({
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
        if (trimmed && PACKAGING_WHITELIST.has(trimmed)) packagings.add(trimmed);
      });
    });

    // 2. 제형(제품형태) 목록 추출
    const formulationsRaw = await prisma.general_declarations.findMany({
      where: { 
        dispos: { not: null, not: '' } 
      },
      select: { dispos: true },
      distinct: ['dispos']
    });

    const formulationsSet = new Set();
    formulationsRaw.forEach(item => {
      const val = item.dispos.trim();
      if (val && val.length < 30) {
        formulationsSet.add(val);
      }
    });

    // 3. 품목유형명 목록 추출
    const categoriesRaw = await prisma.general_declarations.findMany({
      where: { 
        prdlstDcnm: { not: null, not: '' } 
      },
      select: { prdlstDcnm: true },
      distinct: ['prdlstDcnm']
    });

    const categories = categoriesRaw
      .map(item => item.prdlstDcnm.trim())
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      success: true,
      packagings: Array.from(packagings).sort(),
      formulations: Array.from(formulationsSet).sort().slice(0, 50),
      categories
    });
  } catch (error) {
    console.error('General Options API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
