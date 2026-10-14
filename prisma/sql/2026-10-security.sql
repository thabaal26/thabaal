-- Additive only: per-client live sheet link + secret, and failed-login tracking.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sheetHookUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "sheetHookSecret" TEXT;

CREATE TABLE IF NOT EXISTS "LoginAttempt" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");
