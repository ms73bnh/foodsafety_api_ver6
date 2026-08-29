-- 건강기능식품 위원회 AI 답변 Y/N 품질 피드백 저장소
-- 파인튜닝은 수행하지 않으며 질문·검색 근거·답변·평가를 분석용으로 축적합니다.

CREATE TABLE IF NOT EXISTS "committee_chat_feedback" (
  "id" UUID PRIMARY KEY,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "answerStatus" VARCHAR(20) NOT NULL DEFAULT 'STREAMING',
  "rating" BOOLEAN,
  "searchQuery" TEXT,
  "keywords" JSONB,
  "matchedChunkIds" JSONB,
  "references" JSONB,
  "retrievalScore" DOUBLE PRECISION,
  "validationUsed" BOOLEAN NOT NULL DEFAULT FALSE,
  "validationSupported" BOOLEAN,
  "validationConfidence" DOUBLE PRECISION,
  "userId" INTEGER,
  "username" VARCHAR(100),
  "ratedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "committee_chat_feedback_rating_idx"
  ON "committee_chat_feedback" ("rating");
CREATE INDEX IF NOT EXISTS "committee_chat_feedback_answerStatus_idx"
  ON "committee_chat_feedback" ("answerStatus");
CREATE INDEX IF NOT EXISTS "committee_chat_feedback_createdAt_idx"
  ON "committee_chat_feedback" ("createdAt");
CREATE INDEX IF NOT EXISTS "committee_chat_feedback_userId_idx"
  ON "committee_chat_feedback" ("userId");
