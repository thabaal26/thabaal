-- Usage tracking for the admin panel (Usage page; lib/usage-record.ts): what each business's logins open and do.
-- Additive and safe to run again: one new table, counted per business, login, day, kind and key; nothing existing changes.
--   kind: 'open' (a section opened), 'press' (an action done), 'login' (a sign-in). Only business logins are counted.
CREATE TABLE IF NOT EXISTS "UsageDay" (
  "clientId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "kind" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageDay_pkey" PRIMARY KEY ("clientId", "userId", "day", "kind", "key")
);
CREATE INDEX IF NOT EXISTS "UsageDay_day_idx" ON "UsageDay"("day");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageDay_clientId_fkey') THEN
    ALTER TABLE "UsageDay" ADD CONSTRAINT "UsageDay_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UsageDay_userId_fkey') THEN
    ALTER TABLE "UsageDay" ADD CONSTRAINT "UsageDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
