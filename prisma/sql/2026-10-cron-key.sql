-- Additive only: when the scheduler last sent its secret in the URL.
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "cronKeyInUrlAt" TIMESTAMP(3);
