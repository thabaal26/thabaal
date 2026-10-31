-- Enquiries (leads) for the admin panel's Enquiries page (lib/leads.ts): shops that asked about thabaal, their stage,
-- follow-up date, who follows up, calls logged, and the business they became.
-- Additive and safe to run again: two new tables with indexes and links; nothing existing changes.
CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "shop" TEXT NOT NULL,
  "person" TEXT,
  "phone" TEXT NOT NULL,
  "town" TEXT,
  "sells" TEXT,
  "source" TEXT NOT NULL,
  "plan" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'new',
  "reached" TEXT NOT NULL DEFAULT 'new',
  "note" TEXT,
  "nextOn" DATE,
  "ownerId" TEXT,
  "clientId" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_clientId_key" ON "Lead"("clientId");
CREATE INDEX IF NOT EXISTS "Lead_stage_idx" ON "Lead"("stage");
CREATE INDEX IF NOT EXISTS "Lead_nextOn_idx" ON "Lead"("nextOn");
CREATE INDEX IF NOT EXISTS "Lead_phone_idx" ON "Lead"("phone");

CREATE TABLE IF NOT EXISTS "LeadActivity" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "by" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_ownerId_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lead_clientId_fkey') THEN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadActivity_leadId_fkey') THEN
    ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
