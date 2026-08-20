import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';

    if (!query || query.length < 2) {
      return NextResponse.json({ success: true, suggestions: [] });
    }

    // 업체명 제안
    const bsshSuggestions = await prisma.production_stats.findMany({
      where: { bsshNm: { contains: query, mode: 'insensitive' } },
      select: { bsshNm: true },
      distinct: ['bsshNm'],
      take: 5
    });

    // 품목명 제안
    const prdlstSuggestions = await prisma.production_stats.findMany({
      where: { prdlstNm: { contains: query, mode: 'insensitive' } },
      select: { prdlstNm: true },
      distinct: ['prdlstNm'],
      take: 5
    });

    const suggestions = [
      ...bsshSuggestions.map(s => ({ type: '회사', value: s.bsshNm })),
      ...prdlstSuggestions.map(s => ({ type: '품목', value: s.prdlstNm }))
    ];

    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
