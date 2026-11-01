-- Payments › Settings › Loyalty points at checkout: whether customers can use their points at all. Additive only,
-- safe to run more than once: one new column, on for every shop (as today).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyRedeemOn" BOOLEAN NOT NULL DEFAULT true;
