import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env';
import { runOneJob } from '../lib/committeeRag/pipeline.mjs';
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient();
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
try {
  do {
    const result = await runOneJob(db);
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    if (process.argv.includes('--once')) break;
    if (result.idle) await new Promise(resolve => setTimeout(resolve, 5000));
  } while (!stopping);
} finally { await db.$disconnect(); }
