-- Delivery address step on WhatsApp: additive only, safe to run more than once.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deliveryAddress" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "addressAskedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "addressConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "mapUrl" TEXT;
