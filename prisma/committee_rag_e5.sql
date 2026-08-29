-- 건강기능식품 위원회 RAG: Gemini 768차원 임베딩 -> multilingual-e5-small 384차원 전환
-- 실행 전 scripts/backup-database.ps1로 전체 DB 백업을 권장합니다.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET search_path TO public, extensions;

DROP INDEX IF EXISTS "committee_chunks_embedding_hnsw_idx";
DROP TRIGGER IF EXISTS committee_chunks_sync_vector ON "committee_chunks";

-- 서로 다른 모델의 벡터는 같은 공간에서 비교할 수 없으므로 기존 Gemini 벡터를 비웁니다.
UPDATE "committee_chunks"
SET
  "embedding" = NULL,
  "embeddingVector" = NULL,
  "embeddingModel" = NULL,
  "embeddingDimensions" = NULL,
  "embeddingStatus" = 'pending',
  "embeddingError" = NULL,
  "embeddedAt" = NULL;

ALTER TABLE "committee_chunks"
  ALTER COLUMN "embeddingVector" TYPE extensions.vector(384)
  USING NULL::extensions.vector(384);

CREATE OR REPLACE FUNCTION sync_committee_chunk_vector()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."embedding" IS NOT NULL
     AND NEW."embeddingDimensions" = 384
     AND jsonb_array_length(NEW."embedding"::jsonb) = 384 THEN
    NEW."embeddingVector" := NEW."embedding"::extensions.vector(384);
  ELSE
    NEW."embeddingVector" := NULL;
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER committee_chunks_sync_vector
BEFORE INSERT OR UPDATE OF "embedding", "embeddingDimensions"
ON "committee_chunks"
FOR EACH ROW EXECUTE FUNCTION sync_committee_chunk_vector();

CREATE INDEX "committee_chunks_embedding_hnsw_idx"
  ON "committee_chunks"
  USING hnsw ("embeddingVector" vector_cosine_ops);

COMMIT;
