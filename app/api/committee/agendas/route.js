import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const result = searchParams.get('result') || ''; // 인정, 보완, 불인정
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const skip = (page - 1) * limit;

    const where = {};
    if (result) {
      where.result = result;
    }
    if (search) {
      where.OR = [
        { ingredientName: { contains: search, mode: 'insensitive' } },
        { rawName: { contains: search, mode: 'insensitive' } },
        { meeting: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    let orderBy = [];
    if (sortBy === 'date') {
      orderBy = [
        { meeting: { postDate: sortOrder } },
        { meeting: { id: sortOrder } },
        { orderIndex: 'asc' },
      ];
    } else if (sortBy === 'ingredient') {
      orderBy = [
        { ingredientName: sortOrder },
        { meeting: { postDate: 'desc' } },
        { meeting: { id: 'desc' } },
      ];
    } else if (sortBy === 'result') {
      orderBy = [
        { result: sortOrder },
        { meeting: { postDate: 'desc' } },
        { meeting: { id: 'desc' } },
      ];
    } else {
      orderBy = [
        { meeting: { postDate: sortOrder } },
        { meeting: { id: sortOrder } },
        { orderIndex: 'asc' },
      ];
    }

    const [total, agendas, stats] = await Promise.all([
      prisma.committee_agendas.count({ where }),
      prisma.committee_agendas.findMany({
        where,
        include: {
          meeting: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      // 통계치 (전체, 인정, 보완, 불인정)
      prisma.committee_agendas.groupBy({
        by: ['result'],
        _count: { _all: true },
      }),
    ]);

    const statsMap = { total: 0, approved: 0, supplement: 0, rejected: 0, other: 0 };
    stats.forEach(s => {
      statsMap.total += s._count._all;
      if (s.result === '인정') statsMap.approved = s._count._all;
      else if (s.result === '보완') statsMap.supplement = s._count._all;
      else if (s.result === '불인정') statsMap.rejected = s._count._all;
      else statsMap.other += s._count._all;
    });

    const meetingsCount = await prisma.committee_meetings.count();

    return NextResponse.json({
      success: true,
      data: agendas,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      stats: statsMap,
      meetingsCount,
    });
  } catch (error) {
    console.error('Agendas fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
