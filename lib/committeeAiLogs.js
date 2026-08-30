import crypto from 'node:crypto';
import prisma from '@/lib/prisma';

const MAX_PROMPT_LENGTH = 24000;
const MAX_RESPONSE_LENGTH = 16000;
const MAX_ERROR_LENGTH = 4000;

function clip(value, maxLength) {
  if (value === null || typeof value === 'undefined') return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[길이 제한으로 생략]` : text;
}

export async function ensureCommitteeAiLogsTable() {
  if (!globalThis.__committeeAiLogsTablePromise) {
    globalThis.__committeeAiLogsTablePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "committee_ai_logs" (
          "id" UUID PRIMARY KEY,
          "requestId" UUID NOT NULL,
          "stage" VARCHAR(40) NOT NULL,
          "provider" VARCHAR(30) NOT NULL,
          "model" VARCHAR(100),
          "prompt" TEXT,
          "response" TEXT,
          "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
          "durationMs" INTEGER,
          "error" TEXT,
          "metadata" JSONB,
          "userId" INTEGER,
          "username" VARCHAR(100),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" TIMESTAMP(3)
        )
      `);
      for (const sql of [
        'CREATE INDEX IF NOT EXISTS "committee_ai_logs_requestId_idx" ON "committee_ai_logs" ("requestId")',
        'CREATE INDEX IF NOT EXISTS "committee_ai_logs_stage_idx" ON "committee_ai_logs" ("stage")',
        'CREATE INDEX IF NOT EXISTS "committee_ai_logs_status_idx" ON "committee_ai_logs" ("status")',
        'CREATE INDEX IF NOT EXISTS "committee_ai_logs_createdAt_idx" ON "committee_ai_logs" ("createdAt")',
      ]) await prisma.$executeRawUnsafe(sql);
    })().catch(error => {
      globalThis.__committeeAiLogsTablePromise = null;
      throw error;
    });
  }
  return globalThis.__committeeAiLogsTablePromise;
}

export async function createAiLog({ requestId, stage, provider, model, prompt, metadata, userId, username }) {
  await ensureCommitteeAiLogsTable();
  const id = crypto.randomUUID();
  const resolvedRequestId = requestId || crypto.randomUUID();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  await prisma.$executeRaw`
    INSERT INTO "committee_ai_logs"
      ("id", "requestId", "stage", "provider", "model", "prompt", "status", "metadata", "userId", "username")
    VALUES
      (${id}::uuid, ${resolvedRequestId}::uuid, ${stage}, ${provider}, ${model || null}, ${clip(prompt, MAX_PROMPT_LENGTH)},
       'PENDING', CAST(${metadataJson} AS jsonb), ${userId || null}, ${username || null})
  `;
  return id;
}

export async function completeAiLog(id, { model, response, status = 'COMPLETED', durationMs, error, metadata }) {
  if (!id) return;
  await ensureCommitteeAiLogsTable();
  const metadataJson = metadata ? JSON.stringify(metadata) : null;
  await prisma.$executeRaw`
    UPDATE "committee_ai_logs"
    SET "model" = COALESCE(${model || null}, "model"),
        "response" = ${clip(response, MAX_RESPONSE_LENGTH)},
        "status" = ${status},
        "durationMs" = ${Number.isFinite(durationMs) ? Math.round(durationMs) : null},
        "error" = ${clip(error, MAX_ERROR_LENGTH)},
        "metadata" = COALESCE(CAST(${metadataJson} AS jsonb), "metadata"),
        "completedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}::uuid
  `;
}

export async function listAiLogs(limit = 40) {
  await ensureCommitteeAiLogsTable();
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 40));
  return prisma.$queryRawUnsafe(`
    SELECT "id", "requestId", "stage", "provider", "model", "prompt", "response", "status",
           "durationMs", "error", "metadata", "userId", "username", "createdAt", "completedAt"
    FROM "committee_ai_logs"
    ORDER BY "createdAt" DESC
    LIMIT ${safeLimit}
  `);
}
