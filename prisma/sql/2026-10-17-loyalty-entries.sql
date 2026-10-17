-- Loyalty point history (Customers > Loyalty > Point history): hand changes with the reason and who made them.
-- Additive and safe to run again: a new table only, nothing existing changes.
CREATE TABLE IF NOT EXISTS "LoyaltyEntry" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "byName" TEXT,
  "told" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoyaltyEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoyaltyEntry_clientId_createdAt_idx" ON "LoyaltyEntry"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "LoyaltyEntry_customerId_idx" ON "LoyaltyEntry"("customerId");
DO $$
BEGIN
  ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
