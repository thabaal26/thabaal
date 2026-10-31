-- Messages from Thabaal to business owners (admin panel › Messages; lib/owner-messages.ts): what was sent or is
-- scheduled, to which business, and how it went; plus the automatic-reminder and quiet-hour settings.
-- Additive and safe to run again: two new tables and one new nullable column; nothing existing changes.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "ownerMessages" JSONB;

CREATE TABLE IF NOT EXISTS "OwnerMessage" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "sendAt" TIMESTAMP(3) NOT NULL,
  "auto" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "doneAt" TIMESTAMP(3),
  CONSTRAINT "OwnerMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OwnerMessage_status_sendAt_idx" ON "OwnerMessage"("status", "sendAt");

CREATE TABLE IF NOT EXISTS "OwnerMessageTo" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "phone" TEXT,
  "owner" TEXT,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "reason" TEXT,
  "waId" TEXT,
  "simulated" BOOLEAN NOT NULL DEFAULT false,
  "autoKey" TEXT,
  "sentAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerMessageTo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerMessageTo_waId_key" ON "OwnerMessageTo"("waId");
CREATE UNIQUE INDEX IF NOT EXISTS "OwnerMessageTo_autoKey_key" ON "OwnerMessageTo"("autoKey");
CREATE INDEX IF NOT EXISTS "OwnerMessageTo_messageId_idx" ON "OwnerMessageTo"("messageId");
CREATE INDEX IF NOT EXISTS "OwnerMessageTo_clientId_idx" ON "OwnerMessageTo"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OwnerMessageTo_messageId_fkey') THEN
    ALTER TABLE "OwnerMessageTo" ADD CONSTRAINT "OwnerMessageTo_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OwnerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OwnerMessageTo_clientId_fkey') THEN
    ALTER TABLE "OwnerMessageTo" ADD CONSTRAINT "OwnerMessageTo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
