-- ==============================================================================
-- THABAAL PRODUCTION MIGRATION: SAAS ONBOARDING, LIFECYCLE & SAFETY FOUNDATION
-- Target Database: PostgreSQL (Hostinger VPS 189.72.145.225 / thabaal)
-- Date: 2026-11-13
-- Safety: 100% Additive, Zero Data Loss, Bounded Lock Timeout, Idempotent
-- Pre-Migration Snapshot: /srv/thabaal/backup_pre_lifecycle_20261113.dump (4.7 MB)
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- ------------------------------------------------------------------------------
-- 1. BATCH 1 SAFETY FOUNDATION: Soft-Delete & Media Access Control
-- ------------------------------------------------------------------------------
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deletedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_clientId_deletedAt_idx" ON "Customer"("clientId", "deletedAt");

ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PortalUploadedImage" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "PortalUploadedImage_clientId_idx" ON "PortalUploadedImage"("clientId");

CREATE TABLE IF NOT EXISTS "RevokedMediaToken" (
    "tokenHash" TEXT PRIMARY KEY,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    "reason" TEXT
);
CREATE INDEX IF NOT EXISTS "RevokedMediaToken_expiresAt_idx" ON "RevokedMediaToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "RevokedMediaToken_clientId_idx" ON "RevokedMediaToken"("clientId");

-- ------------------------------------------------------------------------------
-- 2. ATOMIC FOREIGN KEY RESTRICTIONS (Prevent Accidental Cascade Deletion)
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_customerId_fkey') THEN
    ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";
  END IF;
  ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_customerId_fkey') THEN
    ALTER TABLE "Message" DROP CONSTRAINT "Message_customerId_fkey";
  END IF;
  ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reply_customerId_fkey') THEN
    ALTER TABLE "Reply" DROP CONSTRAINT "Reply_customerId_fkey";
  END IF;
  ALTER TABLE "Reply" ADD CONSTRAINT "Reply_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LoyaltyEntry_customerId_fkey') THEN
    ALTER TABLE "LoyaltyEntry" DROP CONSTRAINT "LoyaltyEntry_customerId_fkey";
  END IF;
  ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conversation_customerId_fkey') THEN
    ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_customerId_fkey";
  END IF;
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
END $$;

-- ------------------------------------------------------------------------------
-- 3. WORKSPACE & ONBOARDING ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceMode') THEN
    CREATE TYPE "WorkspaceMode" AS ENUM ('DEMO', 'LIVE_PENDING_PAYMENT', 'LIVE_PENDING_CONNECTION', 'LIVE_ACTIVE', 'SUSPENDED');
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'WorkspaceMode' LIMIT 1) AND enumlabel = 'LIVE_PENDING_CONNECTION') THEN
      ALTER TYPE "WorkspaceMode" ADD VALUE 'LIVE_PENDING_CONNECTION';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OnboardingMode') THEN
    CREATE TYPE "OnboardingMode" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConnectionStatus') THEN
    CREATE TYPE "ConnectionStatus" AS ENUM ('DRAFT', 'VALIDATING', 'PENDING_WEBHOOK', 'ACTIVE', 'NEEDS_REAUTH', 'DISCONNECTED', 'ERROR');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4. CLIENT WORKSPACE MODE COLUMN
-- ------------------------------------------------------------------------------
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "workspaceMode" "WorkspaceMode" NOT NULL DEFAULT 'DEMO';

-- ------------------------------------------------------------------------------
-- 5. MULTI-APP & WHATSAPP CONNECTION TABLES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "MetaAppCredential" (
    "id" TEXT PRIMARY KEY,
    "appId" TEXT NOT NULL,
    "appName" TEXT,
    "appSecret" TEXT NOT NULL,
    "verifyToken" TEXT,
    "isPlatformApp" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaAppCredential_appId_key" UNIQUE ("appId"),
    CONSTRAINT "MetaAppCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MetaAppCredential_clientId_idx" ON "MetaAppCredential"("clientId");

CREATE TABLE IF NOT EXISTS "WhatsAppConnection" (
    "id" TEXT PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "appCredentialId" TEXT,
    "onboardingMode" "OnboardingMode" NOT NULL DEFAULT 'MANUAL',
    "wabaId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "graphVersion" TEXT NOT NULL DEFAULT 'v23.0',
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "permissionCheck" JSONB,
    "assetCheck" JSONB,
    "webhookSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "lastValidatedAt" TIMESTAMP(3),
    "lastErrorCode" INTEGER,
    "lastErrorDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppConnection_clientId_wabaId_key" UNIQUE ("clientId", "wabaId"),
    CONSTRAINT "WhatsAppConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WhatsAppConnection_appCredentialId_fkey" FOREIGN KEY ("appCredentialId") REFERENCES "MetaAppCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WhatsAppConnection_clientId_idx" ON "WhatsAppConnection"("clientId");
CREATE INDEX IF NOT EXISTS "WhatsAppConnection_wabaId_idx" ON "WhatsAppConnection"("wabaId");

ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WhatsAppNumber_connectionId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppNumber" ADD CONSTRAINT "WhatsAppNumber_connectionId_fkey"
      FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "WhatsAppNumber_connectionId_idx" ON "WhatsAppNumber"("connectionId");

-- ------------------------------------------------------------------------------
-- 6. PRESERVE & ACTIVATE EXISTING PRODUCTION TENANTS
-- ------------------------------------------------------------------------------
UPDATE "Client"
SET "workspaceMode" = 'LIVE_ACTIVE'
WHERE id IN (
  'cmuwjyb250000e09sx8q748cl', -- Thenan Oils
  'c_finforte_001',            -- Finforte (SheVest)
  'cmvrizp5t0000l5079znuotbe', -- Thabaal Platform
  'cmvphc5670000l307nct13n7f'  -- Habbat
);

COMMIT;
