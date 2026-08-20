import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isSalesOrAbove } from '@/lib/auth';

export async function GET(req, { params }) {
  try {
    if (!isSalesOrAbove(req)) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const item = await prisma.general_declarations.findUnique({
      where: { prdlstReportNo: id }
    });

    if (!item) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
