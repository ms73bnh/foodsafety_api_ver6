import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { auditCommittee } from '@/lib/committeeRag/audit.mjs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export async function GET(request) {
  if (getCurrentUser(request)?.role !== 'ADMIN') return Response.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return auditCommittee(tx);
    }, { timeout: 60000 });
    return Response.json({ ...report, configuration: Object.fromEntries(['POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING', 'GEMINI_API_KEY', 'E5_EMBEDDING_URL', 'E5_API_KEY'].map(key => [key, Boolean(process.env[key])])) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Committee audit:', error.code || 'connection error');
    return Response.json({ error: 'DB 저장 상태를 확인하지 못했습니다. 서버 연결 설정을 확인하세요.' }, { status: 503 });
  }
}
