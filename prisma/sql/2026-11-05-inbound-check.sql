-- Admin › Inbound (lib/engine/inbound.ts): what kind of message each claim was and why handling failed. Additive only,
-- safe to run more than once.
ALTER TABLE "InboundEvent" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "InboundEvent" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "InboundEvent" ADD COLUMN IF NOT EXISTS "lastError" TEXT;
CREATE INDEX IF NOT EXISTS "InboundEvent_createdAt_idx" ON "InboundEvent"("createdAt");
