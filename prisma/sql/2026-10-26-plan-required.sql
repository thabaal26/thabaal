-- Plan lock (lib/plan-access.ts): whether a business must have a paid plan to use thabaal.
-- Additive and safe to run again. Existing businesses get false, so nothing changes for them until Thabaal
-- records their paid period and switches it on; new businesses are created with true.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "planRequired" BOOLEAN NOT NULL DEFAULT false;
