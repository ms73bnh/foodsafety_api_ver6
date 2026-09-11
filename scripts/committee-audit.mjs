import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import { auditCommittee } from '../lib/committeeRag/audit.mjs';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.POSTGRES_PRISMA_URL) {
  console.error('POSTGRES_PRISMA_URL이 없습니다. .env.local에 운영 DB 연결값을 설정하세요.');
  process.exitCode = 1;
} else {
  const db = new PrismaClient({ log: [] });
  try {
    const report = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return auditCommittee(tx);
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('DB 점검 실패:', error.code || '연결 설정 또는 네트워크 확인 필요');
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
