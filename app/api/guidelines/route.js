import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const sortBy = searchParams.get('sortBy') || 'no';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const where = {};
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { attachmentName: { contains: search, mode: 'insensitive' } },
        { dept: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, list] = await Promise.all([
      prisma.functional_guidelines.count({ where }),
      prisma.functional_guidelines.findMany({
        where,
        orderBy: [
          { id: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    return NextResponse.json({
      success: true,
      data: list,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Guidelines GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
