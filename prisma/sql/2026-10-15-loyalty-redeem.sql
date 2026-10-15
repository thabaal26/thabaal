-- Loyalty points at checkout: additive only, safe to run more than once.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pointsRedeemed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyAutoRedeem" BOOLEAN NOT NULL DEFAULT false;
