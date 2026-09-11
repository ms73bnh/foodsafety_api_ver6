-- Additive migration. Apply after the E5 384-dimensional migration.
BEGIN;
CREATE TABLE IF NOT EXISTS committee_documents (
  id UUID PRIMARY KEY, "meetingId" INTEGER NOT NULL REFERENCES committee_meetings(id) ON DELETE CASCADE,
  "sourceKey" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "fileType" TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other', "fileName" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL, "observedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "pipelineVersion" INTEGER NOT NULL DEFAULT 3,
  original BYTEA, markdown TEXT, "pageCount" INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', active BOOLEAN NOT NULL DEFAULT false, error TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("meetingId", "sourceKey", "sourceHash", "pipelineVersion")
);
CREATE TABLE IF NOT EXISTS committee_document_pages (
  id SERIAL PRIMARY KEY, "documentId" UUID NOT NULL REFERENCES committee_documents(id) ON DELETE CASCADE,
  "pageNumber" INTEGER NOT NULL, markdown TEXT NOT NULL, "nativeText" TEXT NOT NULL,
  blocks JSONB NOT NULL, "extractionMethod" TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'completed',
  warnings JSONB NOT NULL, "reviewedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("documentId", "pageNumber")
);
CREATE TABLE IF NOT EXISTS committee_ingestion_jobs (
  id UUID PRIMARY KEY, "jobKey" TEXT UNIQUE NOT NULL,
  "meetingId" INTEGER REFERENCES committee_meetings(id) ON DELETE CASCADE,
  "documentId" UUID REFERENCES committee_documents(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'discover', status TEXT NOT NULL DEFAULT 'pending',
  cursor INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
  "leaseToken" UUID, "leaseUntil" TIMESTAMPTZ(3), "nextRetryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  error TEXT, payload JSONB, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE committee_chunks
  ADD COLUMN IF NOT EXISTS "documentId" UUID REFERENCES committee_documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "pageStart" INTEGER,
  ADD COLUMN IF NOT EXISTS "pageEnd" INTEGER,
  ADD COLUMN IF NOT EXISTS "blockIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceStart" INTEGER,
  ADD COLUMN IF NOT EXISTS "sourceEnd" INTEGER,
  ADD COLUMN IF NOT EXISTS "tokenCount" INTEGER;
CREATE INDEX IF NOT EXISTS committee_documents_meeting_active_idx ON committee_documents("meetingId", active);
CREATE INDEX IF NOT EXISTS committee_documents_status_idx ON committee_documents(status);
CREATE INDEX IF NOT EXISTS committee_jobs_claim_idx ON committee_ingestion_jobs(status, "nextRetryAt");
CREATE INDEX IF NOT EXISTS committee_chunks_document_order_idx ON committee_chunks("documentId", "orderIndex");
CREATE INDEX IF NOT EXISTS committee_chunks_active_category_idx ON committee_chunks(active, category);
COMMIT;
