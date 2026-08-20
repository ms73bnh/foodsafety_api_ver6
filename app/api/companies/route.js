import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const where = {
      bsshNm: { not: null, not: "" }
    };
    if (search) {
      where.bsshNm = { contains: search };
    }

    // Prisma groupBy doesn't natively return Total Group Count easily, 
    // but since we just want a simple list of top companies, we'll fetch them.
    const grouped = await prisma.declarations.groupBy({
      by: ['bsshNm'],
      _count: { bsshNm: true },
      where,
      orderBy: { _count: { bsshNm: 'desc' } },
      skip: (page - 1) * limit,
      take: limit
    });

    const data = grouped.map(g => ({
      bsshNm: g.bsshNm,
      count: g._count.bsshNm
    }));

    return NextResponse.json({ success: true, data, page, limit });
  } catch (error) {
    console.error('Companies API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
