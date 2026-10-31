-- WhatsApp order assistant: nudges for unfinished orders and the add-to-order question. Additive, safe to re-run.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "nudgeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "nudgedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mergeWith" TEXT;
