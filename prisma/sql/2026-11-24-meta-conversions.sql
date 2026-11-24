-- Additive Migration for Meta Conversions API & CTWA Attribution (Turn 74)

-- 1. Add referral fields to Reply table if not exists
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "referralSourceType" TEXT;
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "referralSourceId" TEXT;
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "referralHeadline" TEXT;
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "ctwaClid" TEXT;

-- 2. Add ctwaClid to Order table if not exists
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ctwaClid" TEXT;

-- 3. Add wabaDatasetId to Client table if not exists
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "wabaDatasetId" TEXT;

-- 4. Create MetaConversionStatus enum type if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MetaConversionStatus') THEN
    CREATE TYPE "MetaConversionStatus" AS ENUM (
      'PENDING',
      'SUBMITTING',
      'SENT',
      'FAILED_RETRYABLE',
      'UNKNOWN_EXTERNAL_OUTCOME',
      'PERMANENT_FAILURE'
    );
  END IF;
END $$;

-- 5. Create MetaConversionOutbox table if not exists
CREATE TABLE IF NOT EXISTS "MetaConversionOutbox" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "wabaId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "conversationId" TEXT,
  "orderId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventTime" TIMESTAMP(3) NOT NULL,
  "currency" TEXT,
  "value" DECIMAL(10,2),
  "status" "MetaConversionStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "metaTraceId" TEXT,
  "metaResponse" JSONB,
  "lastError" TEXT,
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MetaConversionOutbox_pkey" PRIMARY KEY ("id")
);

-- 6. Indexes & Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "MetaConversionOutbox_clientId_orderId_eventName_key"
  ON "MetaConversionOutbox"("clientId", "orderId", "eventName");

CREATE INDEX IF NOT EXISTS "MetaConversionOutbox_clientId_status_idx"
  ON "MetaConversionOutbox"("clientId", "status");

CREATE INDEX IF NOT EXISTS "MetaConversionOutbox_wabaId_datasetId_idx"
  ON "MetaConversionOutbox"("wabaId", "datasetId");

CREATE INDEX IF NOT EXISTS "Reply_ctwaClid_idx"
  ON "Reply"("ctwaClid");
