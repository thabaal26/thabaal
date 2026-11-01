-- Every delivery address a customer has used (lib/address-book.ts), newest first, so staff and the customer can pick
-- one again. Additive only, safe to run more than once: one new nullable column, nothing existing changes.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "addresses" JSONB;
