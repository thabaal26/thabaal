-- Creates the DemoConversionAttempt table and unique/foreign-key indexes for Google Ads tracking receipts
CREATE TABLE IF NOT EXISTS "DemoConversionAttempt" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "submissionKeyHash" TEXT NOT NULL,
    "receiptTokenHash" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "conversionEventId" TEXT,
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
