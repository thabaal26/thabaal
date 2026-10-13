-- Wallet, business type and custom fields (additive, safe to run more than once).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "walletUpiId" TEXT;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "walletPayee" TEXT;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "gstEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "gstin" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "businessType" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "billingMode" TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "walletRates" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "walletLowAlert" DOUBLE PRECISION NOT NULL DEFAULT 200;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "extra" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "extra" JSONB;
ALTER TYPE "RunStatus" ADD VALUE IF NOT EXISTS 'WAITING_FUNDS';
CREATE TABLE IF NOT EXISTS "WalletEntry" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DONE',
  "messageId" TEXT,
  "category" TEXT,
  "utr" TEXT,
  "note" TEXT,
  "createdBy" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalletEntry_messageId_key" ON "WalletEntry"("messageId");
CREATE INDEX IF NOT EXISTS "WalletEntry_clientId_status_createdAt_idx" ON "WalletEntry"("clientId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletEntry_utr_idx" ON "WalletEntry"("utr");
