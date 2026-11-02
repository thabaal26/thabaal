-- Campaigns: people added or left out by hand, and leaving out people who don't open offers (2 Nov 2026).
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "includeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "excludeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "skipUnread" BOOLEAN NOT NULL DEFAULT false;
