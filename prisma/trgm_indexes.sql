-- pg_trgm GIN 인덱스 — 일반식품 검색 속도 개선
-- 실행 방법: npx prisma db execute --file=prisma/trgm_indexes.sql --schema=prisma/schema.prisma
-- 로컬 터미널에서 실행 (SQL Editor 타임아웃 없음, 5~15분 소요)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_gen_prdlstnm_trgm
  ON general_declarations USING GIN ("prdlstNm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gen_bsshnm_trgm
  ON general_declarations USING GIN ("bsshNm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gen_prdlstdcnm_trgm
  ON general_declarations USING GIN ("prdlstDcnm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gen_normpkg_trgm
  ON general_declarations USING GIN ("normalizedPackaging" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gen_frmlcmtrqlt_trgm
  ON general_declarations USING GIN ("frmlcMtrqlt" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_gen_dispos_trgm
  ON general_declarations USING GIN ("dispos" gin_trgm_ops);
