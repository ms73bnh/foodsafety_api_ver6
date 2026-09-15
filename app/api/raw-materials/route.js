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
        { companyNm: { contains: search, mode: 'insensitive' } },
        { recogNo: { contains: search, mode: 'insensitive' } },
        { functionalityText: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy = [];
    if (sortBy === 'regDate') {
      orderBy = [{ regDate: sortOrder }, { no: 'desc' }];
    } else {
      // 기본 no 숫자 기준 정렬
      orderBy = [{ no: sortOrder }];
    }

    const [total, list] = await Promise.all([
      prisma.raw_material_posts.count({ where }),
      prisma.raw_material_posts.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          no: true,
          ntctxtNo: true,
          title: true,
          companyNm: true,
          recogNo: true,
          functionalityText: true,
          dailyIntake: true,
          precautions: true,
          regDate: true,
          viewCnt: true,
          content: true,
          attachmentName: true,
          localPdfPath: true
        }
      })
    ]);

    const enriched = list.map(item => ({
      ...item,
      pdfPreviewUrl: `/api/raw-materials/pdf/${item.id}`,
      pdfDownloadUrl: `/api/raw-materials/pdf/${item.id}?download=true`
    }));

    return NextResponse.json({ success: true, data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Raw Materials GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}