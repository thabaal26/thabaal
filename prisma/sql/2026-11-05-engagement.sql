-- Smart campaign engine (lib/engagement-segments.ts). Additive only, safe to run more than once: new nullable or
-- defaulted columns and one index; nothing existing changes.
-- Which of our messages a customer's button tap or reply belongs to (Meta's context.id).
ALTER TABLE "Reply" ADD COLUMN IF NOT EXISTS "contextId" TEXT;
CREATE INDEX IF NOT EXISTS "Reply_contextId_idx" ON "Reply"("contextId");
-- Per-business engagement thresholds.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "engagementDays" INTEGER NOT NULL DEFAULT 90;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "inactiveAfterOffers" INTEGER NOT NULL DEFAULT 3;
-- Segments a campaign sends to, on top of its "Send to".
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "segments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
-- Throttled batches in a row, for exponential backoff (lib/meta-errors.ts throttleDelayMinutes).
ALTER TABLE "CampaignRun" ADD COLUMN IF NOT EXISTS "throttles" INTEGER NOT NULL DEFAULT 0;
