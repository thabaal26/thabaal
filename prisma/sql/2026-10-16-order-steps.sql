-- Order steps (Settings → Order steps): each client's chosen flow, and when an order was packed.
-- Additive and safe to run again.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "orderFlow" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "packedAt" TIMESTAMP(3);
