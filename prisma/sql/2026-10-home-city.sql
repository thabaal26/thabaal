-- Each client's home city for delivery regions (lib/regions.ts). Additive: existing clients stay
-- null, which the portal reads as Madurai, so their saved regions don't change.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "homeCity" TEXT;
