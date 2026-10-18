-- Payment references and history (Orders › receipt, Payments › All transactions).
-- Additive and safe to run again: a new nullable column and a new table; nothing existing changes.
--   Order.paymentUtr: the bank's 12-digit UPI reference (UTR), kept apart from paymentTxnId (Meta's or the staff's
--   transaction reference), so one never overwrites the other.
--   PaymentEvent: every payment message received or recorded (WhatsApp payment updates, UPI bubbles, UTRs and
--   screenshots from customers, staff entries) with Meta's full message, as an audit trail.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentUtr" TEXT;
CREATE INDEX IF NOT EXISTS "Order_paymentUtr_idx" ON "Order"("paymentUtr");

CREATE TABLE IF NOT EXISTS "PaymentEvent" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "orderId" TEXT,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "transactionId" TEXT,
  "utr" TEXT,
  "amount" DOUBLE PRECISION,
  "currency" TEXT,
  "note" TEXT,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaymentEvent_orderId_createdAt_idx" ON "PaymentEvent"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentEvent_clientId_createdAt_idx" ON "PaymentEvent"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentEvent_utr_idx" ON "PaymentEvent"("utr");
DO $$
BEGIN
  ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
