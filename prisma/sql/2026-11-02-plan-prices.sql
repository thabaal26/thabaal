-- Plan prices edited from the admin panel (Settings › Plans and prices; lib/plan-prices.ts).
-- Additive and safe to run again: three new nullable columns on the single Setting row; nothing existing changes.
-- Empty means the prices in the app's code. A new price applies to new subscriptions only.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "planPrices" JSONB;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "planPricesAt" TIMESTAMP(3);
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "planPricesBy" TEXT;
