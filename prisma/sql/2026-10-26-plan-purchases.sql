-- Thabaal plan purchases (My account -> plan payments, lib/subscription.ts).
-- Additive and safe to run again: one new table with its indexes and foreign key; nothing existing changes.
--   PlanPurchase: one paid plan period per row. PENDING until Thabaal verifies the UPI reference; VERIFIED rows
--   carry the server-computed startsAt/endsAt. paymentRef is unique so one payment can't be applied twice.
CREATE TABLE IF NOT EXISTS "PlanPurchase" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "cycle" TEXT NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "method" TEXT NOT NULL DEFAULT 'UPI',
  "utr" TEXT,
  "paymentRef" TEXT,
  "payApp" TEXT,
  "paidOn" TEXT,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "billNo" TEXT,
  "submittedBy" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanPurchase_paymentRef_key" ON "PlanPurchase"("paymentRef");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanPurchase_billNo_key" ON "PlanPurchase"("billNo");
CREATE INDEX IF NOT EXISTS "PlanPurchase_clientId_status_idx" ON "PlanPurchase"("clientId", "status");
CREATE INDEX IF NOT EXISTS "PlanPurchase_clientId_endsAt_idx" ON "PlanPurchase"("clientId", "endsAt");
DO $$
BEGIN
  ALTER TABLE "PlanPurchase" ADD CONSTRAINT "PlanPurchase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
