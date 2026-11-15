-- Batch 1 Safety Foundation: Emergency Rollback Script
-- Target: Thabaal Multi-Tenant WhatsApp Business Platform
-- Mode: Atomic DDL Reversal (Reverts RESTRICT constraints back to CASCADE before legacy binary rollback)

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

-- 1. Revert Foreign Keys to ON DELETE CASCADE for legacy application compatibility
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_customerId_fkey";
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" DROP CONSTRAINT IF EXISTS "Message_customerId_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reply" DROP CONSTRAINT IF EXISTS "Reply_customerId_fkey";
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyEntry" DROP CONSTRAINT IF EXISTS "LoyaltyEntry_customerId_fkey";
ALTER TABLE "LoyaltyEntry" ADD CONSTRAINT "LoyaltyEntry_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" DROP CONSTRAINT IF EXISTS "Conversation_customerId_fkey";
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" 
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
