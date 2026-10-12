-- Appearance settings (additive, safe to run more than once).
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "appearance" JSONB;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "appearance" JSONB;
