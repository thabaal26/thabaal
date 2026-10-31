-- "Connect Google Sheets": each business's own Google Sheet, kept live (lib/gsheet).
-- Additive and safe to run again: two new tables with their indexes and links; nothing existing changes.
--   SheetLink: the business's connected sheet (Google account, encrypted refresh token, sync progress).
--   SheetLog: activity lines waiting to be written to the sheet's Activity tab.
CREATE TABLE IF NOT EXISTS "SheetLink" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "googleEmail" TEXT,
  "refreshToken" TEXT,
  "spreadsheetId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "lastError" TEXT,
  "cursors" JSONB,
  "tabs" JSONB,
  "syncedAt" TIMESTAMP(3),
  "summaryAt" TIMESTAMP(3),
  "lockUntil" TIMESTAMP(3),
  "dirty" BOOLEAN NOT NULL DEFAULT false,
  "connectedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SheetLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SheetLink_clientId_key" ON "SheetLink"("clientId");

CREATE TABLE IF NOT EXISTS "SheetLog" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "phone" TEXT,
  "customer" TEXT,
  "event" TEXT NOT NULL,
  "details" TEXT,
  "orderRef" TEXT,
  "by" TEXT,
  CONSTRAINT "SheetLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SheetLog_clientId_at_idx" ON "SheetLog"("clientId", "at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SheetLink_clientId_fkey') THEN
    ALTER TABLE "SheetLink" ADD CONSTRAINT "SheetLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SheetLog_clientId_fkey') THEN
    ALTER TABLE "SheetLog" ADD CONSTRAINT "SheetLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
