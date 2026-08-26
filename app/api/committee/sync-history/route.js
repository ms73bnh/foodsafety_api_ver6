import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureCommitteeSyncHistoryTables } from '@/lib/committeeSyncHistory';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    await ensureCommitteeSyncHistoryTables(prisma);

    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    if (runId) {
      const run = await prisma.committee_sync_runs.findUnique({
        where: { id: parseInt(runId, 10) },
        include: {
          changes: {
            orderBy: { id: 'desc' },
            include: {
              meeting: {
                select: {
                  id: true,
                  title: true,
                  meetingNo: true,
                  meetingDate: true,
                  postDate: true,
                  sourceUrl: true,
                },
              },
            },
          },
        },
      });

      return NextResponse.json({ success: true, data: run });
    }

    const runs = await prisma.committee_sync_runs.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      include: {
        changes: {
          orderBy: { id: 'desc' },
          take: 5,
          select: {
            id: true,
            seq: true,
            changeType: true,
            title: true,
            changedFields: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: runs });
  } catch (error) {
    console.error('Committee sync history fetch error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
