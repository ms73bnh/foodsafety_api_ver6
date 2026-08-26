-- Committee sync history tables.
-- Apply once to the PostgreSQL database, or run `npx prisma db push`.

CREATE TABLE IF NOT EXISTS "committee_sync_runs" (
  "id" SERIAL PRIMARY KEY,
  "mode" TEXT NOT NULL DEFAULT 'full',
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "pagesRequested" INTEGER NOT NULL DEFAULT 0,
  "pagesFetched" INTEGER NOT NULL DEFAULT 0,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "agendaCreatedCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "committee_sync_changes" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL,
  "meetingId" INTEGER,
  "seq" TEXT NOT NULL,
  "changeType" TEXT NOT NULL,
  "title" TEXT,
  "changedFields" TEXT,
  "beforeData" JSONB,
  "afterData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "committee_sync_changes_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "committee_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "committee_sync_changes_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "committee_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "committee_sync_runs_startedAt_idx" ON "committee_sync_runs"("startedAt");
CREATE INDEX IF NOT EXISTS "committee_sync_runs_status_idx" ON "committee_sync_runs"("status");
CREATE INDEX IF NOT EXISTS "committee_sync_changes_runId_idx" ON "committee_sync_changes"("runId");
CREATE INDEX IF NOT EXISTS "committee_sync_changes_meetingId_idx" ON "committee_sync_changes"("meetingId");
CREATE INDEX IF NOT EXISTS "committee_sync_changes_seq_idx" ON "committee_sync_changes"("seq");
CREATE INDEX IF NOT EXISTS "committee_sync_changes_changeType_idx" ON "committee_sync_changes"("changeType");
CREATE INDEX IF NOT EXISTS "committee_sync_changes_createdAt_idx" ON "committee_sync_changes"("createdAt");
