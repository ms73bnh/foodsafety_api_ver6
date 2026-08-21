import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const search = searchParams.get('search')?.trim() || '';
    const department = searchParams.get('department')?.trim() || '';

    const where = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { meetingNo: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
        { postNo: { contains: search, mode: 'insensitive' } },
        {
          agendas: {
            some: {
              OR: [
                { ingredientName: { contains: search, mode: 'insensitive' } },
                { rawName: { contains: search, mode: 'insensitive' } },
              ]
            }
          }
        }
      ];
    }

    if (department) {
      where.department = department;
    }

    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    let orderBy = [];
    if (sortBy === 'postNo' || sortBy === 'date') {
      // id: asc는 최신 공시(postNo: 362, 2026년)부터 순서대로 정렬됨
      orderBy = [{ id: sortOrder === 'desc' ? 'asc' : 'desc' }];
    } else if (sortBy === 'views') {
      orderBy = [{ viewCount: sortOrder }, { id: 'asc' }];
    } else if (sortBy === 'title') {
      orderBy = [{ title: sortOrder }, { id: 'asc' }];
    } else {
      orderBy = [{ id: sortOrder === 'desc' ? 'asc' : 'desc' }];
    }

    const [total, meetings, deptStats] = await Promise.all([
      prisma.committee_meetings.count({ where }),
      prisma.committee_meetings.findMany({
        where,
        include: {
          agendas: {
            select: {
              id: true,
              orderIndex: true,
              ingredientName: true,
              result: true,
              agendaType: true,
              rawName: true,
            },
            orderBy: { orderIndex: 'asc' }
          },
          _count: {
            select: { agendas: true }
          }
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.committee_meetings.groupBy({
        by: ['department'],
        _count: { id: true },
        where: { department: { not: null } }
      })
    ]);

    return NextResponse.json({
      success: true,
      data: meetings,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
      departments: deptStats.map(d => ({ name: d.department, count: d._count.id }))
    });
  } catch (error) {
    console.error('Committee Meetings API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
