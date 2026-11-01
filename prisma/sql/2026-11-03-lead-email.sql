-- Enquiries from sign-ups carry the owner's email (lib/leads.ts leadFromSignup). Additive only, safe to run more than
-- once: one new nullable column, nothing existing changes.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "email" TEXT;
