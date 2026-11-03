-- One person, several WhatsApp numbers (lib/linked-numbers.ts): each number stays its own Customer row (its own chats,
-- opt-out and delivery state), and rows with the same personId are the same person, so campaigns reach every number.
-- Additive only, safe to run more than once: one new nullable column and its index, nothing existing changes.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "personId" TEXT;
CREATE INDEX IF NOT EXISTS "Customer_clientId_personId_idx" ON "Customer"("clientId", "personId");
