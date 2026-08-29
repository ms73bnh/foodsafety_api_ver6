-- 건강기능식품 위원회 RAG V2
-- Supabase SQL Editor 또는 PostgreSQL 관리 콘솔에서 1회 실행합니다.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET search_path TO public, extensions;

ALTER TABLE "committee_chunks"
  ADD COLUMN IF NOT EXISTS "contentHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "chunkVersion" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "embeddingVector" extensions.vector(768),
  ADD COLUMN IF NOT EXISTS "embeddingModel" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "embeddingDimensions" INTEGER,
  ADD COLUMN IF NOT EXISTS "embeddingStatus" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "embeddingError" TEXT,
  ADD COLUMN IF NOT EXISTS "embeddedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "committee_chunks_contentHash_idx"
  ON "committee_chunks" ("contentHash");
CREATE INDEX IF NOT EXISTS "committee_chunks_embeddingStatus_idx"
  ON "committee_chunks" ("embeddingStatus");
CREATE INDEX IF NOT EXISTS "committee_chunks_chunkVersion_idx"
  ON "committee_chunks" ("chunkVersion");

-- JSON 벡터를 저장하는 기존 애플리케이션과 pgvector 컬럼을 동기화합니다.
CREATE OR REPLACE FUNCTION sync_committee_chunk_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."embedding" IS NOT NULL
     AND NEW."embeddingDimensions" = 768
     AND jsonb_array_length(NEW."embedding"::jsonb) = 768 THEN
    NEW."embeddingVector" := NEW."embedding"::extensions.vector(768);
  ELSE
    NEW."embeddingVector" := NULL;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS committee_chunks_sync_vector ON "committee_chunks";
CREATE TRIGGER committee_chunks_sync_vector
BEFORE INSERT OR UPDATE OF "embedding", "embeddingDimensions"
ON "committee_chunks"
FOR EACH ROW EXECUTE FUNCTION sync_committee_chunk_vector();

-- 기존 768차원 JSON 벡터가 있다면 pgvector 컬럼을 채웁니다.
UPDATE "committee_chunks"
SET
  "embeddingVector" = "embedding"::extensions.vector(768),
  "embeddingStatus" = 'completed',
  "embeddingModel" = COALESCE("embeddingModel", 'gemini-embedding-001'),
  "embeddedAt" = COALESCE("embeddedAt", CURRENT_TIMESTAMP)
WHERE "embedding" IS NOT NULL
  AND "embeddingDimensions" = 768
  AND jsonb_array_length("embedding"::jsonb) = 768;

CREATE INDEX IF NOT EXISTS "committee_chunks_embedding_hnsw_idx"
  ON "committee_chunks"
  USING hnsw ("embeddingVector" vector_cosine_ops);
