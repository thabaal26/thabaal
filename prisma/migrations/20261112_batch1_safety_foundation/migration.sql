-- Batch 1 Safety Foundation: Referential Integrity, Soft-Delete & Media Access Control
-- Target: Thabaal Multi-Tenant WhatsApp Business Platform
-- Mode: Atomic DDL Swap with Bounded Lock Timeout

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- 1. Soft-Delete Columns & Composite Index on Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_clientId_deletedAt_idx" ON "Customer"("clientId", "deletedAt");

-- 2. Media Access Control Columns on PortalUploadedImage
ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "PortalUploadedImage_clientId_idx" ON "PortalUploadedImage"("clientId");

-- 3. Persistent Media Revocation Registry (F-01)
CREATE TABLE IF NOT EXISTS "RevokedMediaToken" (
    "tokenHash" TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    "reason" TEXT
);
CREATE INDEX IF NOT EXISTS "RevokedMediaToken_expiresAt_idx" ON "RevokedMediaToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "RevokedMediaToken_clientId_idx" ON "RevokedMediaToken"("clientId");

-- 4. Narrow Backfill: Mark as public ONLY verified, Meta-approved template media headers (OD-02 compliance)
-- Strictly requires matching tenant ownership: p."clientId" = t."clientId" (F-05).
-- Never reassign ownership of ambiguous null-tenant images.
-- Never promote images attached to DRAFT, PENDING, or REJECTED templates.
UPDATE "PortalUploadedImage" p
SET "isPublic" = true
FROM "Template" t
WHERE t."headerType" = 'IMAGE'
  AND t."status" = 'APPROVED'
  AND t."headerMediaUrl" IS NOT NULL
  AND t."headerMediaUrl" LIKE '%/api/upload/%'
  AND p."id" = regexp_replace(t."headerMediaUrl", '^.*\/api\/upload\/([a-zA-Z0-9._-]+).*$', '\1')
  AND p."clientId" = t."clientId";

-- 5. Atomic Foreign Key Swap: Change onDelete from CASCADE to RESTRICT
-- (Protected against cascade deletion of audit/payment/compliance history)

-- Model: Order
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_customerId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Model: Message
ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_customerId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Model: Reply
ALTER TABLE "Reply" DROP CONSTRAINT IF EXISTS "Reply_customerId_fkey";
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Model: LoyaltyEntry
ALTER TABLE "LoyaltyEntry" DROP CONSTRAINT IF EXISTS "LoyaltyEntry_customerId_fkey";
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Model: Conversation
ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_customerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
