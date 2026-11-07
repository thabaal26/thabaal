-- Speed (7 Nov 2026): Meta's limit counts people messaged by a business's numbers in the last 1, 7 and 30 days
-- (lib/limits.ts), read on every Campaigns, Home, Reports and Settings page and before each campaign batch.
-- Additive only, safe to run more than once.
CREATE INDEX IF NOT EXISTS "Message_senderId_sentAt_idx" ON "Message"("senderId", "sentAt");
