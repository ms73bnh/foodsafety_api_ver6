-- 위원회 AI 진단/LLM 호출 로그. Neon SQL Editor에서 1회 실행할 수 있습니다.
-- 애플리케이션도 관리자 진단 기능 최초 사용 시 같은 테이블을 자동 생성합니다.
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
);

CREATE INDEX IF NOT EXISTS "committee_ai_logs_requestId_idx" ON "committee_ai_logs" ("requestId");
CREATE INDEX IF NOT EXISTS "committee_ai_logs_stage_idx" ON "committee_ai_logs" ("stage");
CREATE INDEX IF NOT EXISTS "committee_ai_logs_status_idx" ON "committee_ai_logs" ("status");
CREATE INDEX IF NOT EXISTS "committee_ai_logs_createdAt_idx" ON "committee_ai_logs" ("createdAt");
