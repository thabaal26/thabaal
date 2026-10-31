-- Each shop's own loyalty rules: additive only, safe to run more than once. Defaults are the old fixed rules.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyEarnOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyRupeesPerPoint" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyRepeatOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "loyaltyRepeatBonus" INTEGER NOT NULL DEFAULT 50;
