import { timingSafeEqual } from 'node:crypto';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { runOneJob } from '@/lib/committeeRag/pipeline.mjs';
import { ensureCommitteeRagV3Tables } from '@/lib/committeeRagV3Migration';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function validCron(request) {
  const expected = process.env.CRON_SECRET;
  const actual = request.headers.get('authorization');
  if (!expected || !actual) return false;
  const a = Buffer.from(actual), b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function tick(request, adminAllowed) {
  if (!validCron(request) && !(adminAllowed && getCurrentUser(request)?.role === 'ADMIN')) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });
  try {
    await ensureCommitteeRagV3Tables(prisma);
    return Response.json(await runOneJob(prisma));
  } catch (error) {
    console.error('Committee worker:', error.code || error.message);
    return Response.json({ error: '처리 환경을 확인하세요. DB 마이그레이션과 연결 설정이 필요합니다.' }, { status: 503 });
  }
}
export const GET = request => tick(request, false);
export const POST = request => tick(request, true);
