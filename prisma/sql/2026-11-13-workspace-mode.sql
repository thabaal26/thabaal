-- Additive migration: Adds WorkspaceMode enum and workspaceMode column to Client
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceMode') THEN
    CREATE TYPE "WorkspaceMode" AS ENUM ('DEMO', 'LIVE_PENDING_PAYMENT', 'LIVE_PENDING_CONNECTION', 'LIVE_ACTIVE', 'SUSPENDED');
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'WorkspaceMode' LIMIT 1) AND enumlabel = 'LIVE_PENDING_CONNECTION') THEN
      ALTER TYPE "WorkspaceMode" ADD VALUE 'LIVE_PENDING_CONNECTION';
    END IF;
  END IF;
END $$;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "workspaceMode" "WorkspaceMode" NOT NULL DEFAULT 'DEMO';

-- Backfill existing production active stores and provisioned enterprise clients to LIVE_ACTIVE
UPDATE "Client" SET "workspaceMode" = 'LIVE_ACTIVE' WHERE id IN ('cmuwjyb250000e09sx8q748cl', 'cmvrizp5t0000l5079znuotbe', 'cmvphc5670000l307nct13n7f', 'c_finforte_001');
