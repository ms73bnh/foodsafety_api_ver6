import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const logs = await prisma.sync_history.findMany({
      orderBy: { executedAt: 'desc' },
      take: 20
    });

    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error('Logs API Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
