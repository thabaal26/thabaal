-- Razorpay payments for Thabaal's own fees (plan auto-renew and wallet recharges). lib/razorpay-billing.ts.
-- Additive and safe to run again: two new tables with their indexes; nothing existing changes.
--   RazorpayRecord: one row per Razorpay object Thabaal creates (a plan definition, a subscription or an order),
--     with what it is for. Payments are matched back to the business through these rows, never through data the
--     browser sends.
--   RazorpayEvent: webhook event ids already handled, so a webhook Razorpay sends twice changes nothing twice.
CREATE TABLE IF NOT EXISTS "RazorpayRecord" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "rzpId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "clientId" TEXT,
  "plan" TEXT,
  "cycle" TEXT,
  "amountPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "lookupKey" TEXT,
  "paymentId" TEXT,
  "refId" TEXT,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RazorpayRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RazorpayRecord_rzpId_key" ON "RazorpayRecord"("rzpId");
CREATE INDEX IF NOT EXISTS "RazorpayRecord_kind_lookupKey_idx" ON "RazorpayRecord"("kind", "lookupKey");
CREATE INDEX IF NOT EXISTS "RazorpayRecord_clientId_kind_status_idx" ON "RazorpayRecord"("clientId", "kind", "status");
CREATE INDEX IF NOT EXISTS "RazorpayRecord_paymentId_idx" ON "RazorpayRecord"("paymentId");

CREATE TABLE IF NOT EXISTS "RazorpayEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RazorpayEvent_pkey" PRIMARY KEY ("id")
);
