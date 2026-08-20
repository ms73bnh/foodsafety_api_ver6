import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const query = searchParams.get('query') || '';

    let where = {};
    if (query) {
      where = {
        OR: [
          { bsshNm: { contains: query, mode: 'insensitive' } },
          { prdlstNm: { contains: query, mode: 'insensitive' } },
          { prdlstReportNo: { contains: query, mode: 'insensitive' } }
        ]
      };
    }

    const total = await prisma.production_stats.count({ where });
    const data = await prisma.production_stats.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [
        { evlYr: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json({ success: true, data, total, page, limit });
  } catch (error) {
    console.error('Production Raw API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
