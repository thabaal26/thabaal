-- Compound and foreign-key indexes for high-throughput chats, messages, and campaigns:
-- additive only, safe to run more than once.
CREATE INDEX IF NOT EXISTS "Message_customerId_createdAt_idx" ON "Message"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "Message"("senderId");
CREATE INDEX IF NOT EXISTS "Customer_clientId_optedOut_unreachable_idx" ON "Customer"("clientId", "optedOut", "unreachable");
CREATE INDEX IF NOT EXISTS "Reply_senderId_idx" ON "Reply"("senderId");
