-- Button taps → configurable actions (lib/engine). Additive only, safe to run more than once: new tables, two
-- defaulted columns; nothing existing changes.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "automationMode" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "staffPauseMinutes" INTEGER NOT NULL DEFAULT 120;

CREATE TABLE IF NOT EXISTS "InboundEvent" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "InboundEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InboundEvent_receivedAt_idx" ON "InboundEvent"("receivedAt");

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "pausedUntil" TIMESTAMP(3),
  "pausedBy" TEXT,
  "resumedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_customerId_key" ON "Conversation"("customerId");
CREATE INDEX IF NOT EXISTS "Conversation_clientId_idx" ON "Conversation"("clientId");
DO $$ BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ButtonAction" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "buttonKey" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "value" TEXT,
  "replyText" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ButtonAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ButtonAction_templateId_buttonKey_key" ON "ButtonAction"("templateId", "buttonKey");
CREATE INDEX IF NOT EXISTS "ButtonAction_clientId_idx" ON "ButtonAction"("clientId");
DO $$ BEGIN
  ALTER TABLE "ButtonAction" ADD CONSTRAINT "ButtonAction_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ButtonAction" ADD CONSTRAINT "ButtonAction_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "EngineDecision" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "inboundId" TEXT NOT NULL,
  "templateId" TEXT,
  "buttonKey" TEXT,
  "action" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "executed" BOOLEAN NOT NULL DEFAULT false,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EngineDecision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EngineDecision_inboundId_key" ON "EngineDecision"("inboundId");
CREATE INDEX IF NOT EXISTS "EngineDecision_clientId_createdAt_idx" ON "EngineDecision"("clientId", "createdAt");
