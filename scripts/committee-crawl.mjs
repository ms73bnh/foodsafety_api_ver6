import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import { enqueueCatalog } from '../lib/committeeRag/pipeline.mjs';
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();
try {
  const job = await enqueueCatalog(db);
  console.log(JSON.stringify({ jobId: job.id, status: job.status, message: '전수 수집을 등록했습니다. worker 또는 Vercel tick에서 이어 처리합니다.' }));
} finally { await db.$disconnect(); }
