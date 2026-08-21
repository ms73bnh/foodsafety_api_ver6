import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const type = searchParams.get('type') || ''; // 'INGREDIENT' | 'RAW_MATERIAL' | ''

    const where = {};
    if (type === 'INGREDIENT') {
      where.type = { startsWith: 'INGREDIENT' };
    } else if (type === 'RAW_MATERIAL') {
      where.type = { startsWith: 'RAW_MATERIAL' };
    } else {
      where.OR = [
        { type: { startsWith: 'INGREDIENT' } },
        { type: { startsWith: 'RAW_MATERIAL' } },
      ];
    }

    const logs = await prisma.change_log.findMany({
      where,
      orderBy: { loggedAt: 'desc' },
      take: limit,
    });

    const parsedLogs = logs.map(log => {
      let parsed = {};
      try {
        parsed = log.changes ? JSON.parse(log.changes) : {};
      } catch (e) {
        parsed = { raw: log.changes };
      }
      return {
        id: log.id,
        prdlstReportNo: log.prdlstReportNo,
        type: log.type,
        loggedAt: log.loggedAt,
        details: parsed,
      };
    });

    return NextResponse.json({
      success: true,
      data: parsedLogs,
      total: parsedLogs.length,
    });
  } catch (error) {
    console.error('Ingredient History API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
