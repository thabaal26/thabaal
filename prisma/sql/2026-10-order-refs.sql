-- Additive only: per-client order numbers (FM-1001). Existing orders keep their RG-<1000+number> form (ref NULL).
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "orderPrefix" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "orderSeq" INTEGER NOT NULL DEFAULT 1000;
CREATE UNIQUE INDEX IF NOT EXISTS "Client_orderPrefix_key" ON "Client"("orderPrefix");
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ref" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Order_ref_key" ON "Order"("ref");
-- Thenan Oils (the first client) keeps "RG", continuing after the highest number already shown,
-- so a new RG number can never repeat an old one.
UPDATE "Client" SET "orderPrefix" = 'RG',
  "orderSeq" = GREATEST("orderSeq", 1000 + COALESCE((SELECT MAX("number") FROM "Order"), 0))
WHERE "id" = (SELECT "id" FROM "Client" ORDER BY "createdAt" ASC LIMIT 1) AND "orderPrefix" IS NULL;
