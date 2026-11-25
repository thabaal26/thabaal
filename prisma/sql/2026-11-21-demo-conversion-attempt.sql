-- Creates the DemoConversionAttempt table and unique/foreign-key indexes for Google Ads tracking receipts
CREATE TABLE IF NOT EXISTS "DemoConversionAttempt" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "submissionKeyHash" TEXT NOT NULL,
    "receiptTokenHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "conversionEventId" TEXT,
    "transactionReference" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoConversionAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DemoConversionAttempt_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DemoConversionAttempt_submissionKeyHash_key" ON "DemoConversionAttempt"("submissionKeyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "DemoConversionAttempt_receiptTokenHash_key" ON "DemoConversionAttempt"("receiptTokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "DemoConversionAttempt_conversionEventId_key" ON "DemoConversionAttempt"("conversionEventId");
CREATE INDEX IF NOT EXISTS "DemoConversionAttempt_leadId_idx" ON "DemoConversionAttempt"("leadId");
CREATE INDEX IF NOT EXISTS "DemoConversionAttempt_expiresAt_idx" ON "DemoConversionAttempt"("expiresAt");

-- ---------------------------------------------------------------------------
-- Additive integrity updates for Google Ads transaction identity (Turn 83-88)
-- ---------------------------------------------------------------------------

-- Upgrade existing databases cleanly using TEXT to match Prisma String? schema parity
ALTER TABLE "DemoConversionAttempt"
  ADD COLUMN IF NOT EXISTS "transactionReference" TEXT;

-- Backfill existing CREATED attempts using persisted leadId (matching formatGoogleAdsTransactionReference)
WITH candidates AS (
  SELECT
    "id",
    'THB-LEAD-' ||
    to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY') ||
    '-' ||
    upper(
      left(
        regexp_replace("leadId", '[^a-zA-Z0-9]', '', 'g'),
        48
      )
    ) AS candidate_reference
  FROM "DemoConversionAttempt"
  WHERE "outcome" = 'CREATED'
    AND "transactionReference" IS NULL
)
UPDATE "DemoConversionAttempt" AS a
SET "transactionReference" = c.candidate_reference
FROM candidates AS c
WHERE a."id" = c."id";

-- Preflight protection against historical reference collisions before unique index creation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "DemoConversionAttempt"
    WHERE "transactionReference" IS NOT NULL
    GROUP BY "transactionReference"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate transaction references detected in DemoConversionAttempt';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DemoConversionAttempt_transactionReference_key"
  ON "DemoConversionAttempt"("transactionReference");

-- Enforce database-level invariant: CREATED attempts must always persist a non-null transactionReference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_created_has_trans_ref'
      AND conrelid = '"DemoConversionAttempt"'::regclass
  ) THEN
    ALTER TABLE "DemoConversionAttempt"
      ADD CONSTRAINT "chk_created_has_trans_ref"
      CHECK (
        "outcome" <> 'CREATED' OR "transactionReference" IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE "DemoConversionAttempt"
  VALIDATE CONSTRAINT "chk_created_has_trans_ref";
