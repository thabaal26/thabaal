-- Orders show how they were paid and when/why they were cancelled (Orders card and Timeline).
-- Additive and safe to run again: three nullable columns; the step-time trigger also stamps the cancel time (and
-- forgets it when an order is reopened); orders cancelled before this get their last change as the time and, where
-- their notes say so, who cancelled them.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentApp" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;

CREATE OR REPLACE FUNCTION thabaal_order_step_times() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."status" IN ('CONFIRMED', 'PAID', 'DISPATCHED', 'DELIVERED') AND NEW."confirmedAt" IS NULL THEN
      NEW."confirmedAt" := CURRENT_TIMESTAMP;
    END IF;
    IF NEW."status" IN ('DISPATCHED', 'DELIVERED') AND NEW."dispatchedAt" IS NULL THEN
      NEW."dispatchedAt" := CURRENT_TIMESTAMP;
    END IF;
    IF NEW."status" = 'DELIVERED' AND NEW."deliveredAt" IS NULL THEN
      NEW."deliveredAt" := CURRENT_TIMESTAMP;
    END IF;
    -- Moved back a step (e.g. "Not delivered"): forget the later times.
    IF NEW."status" IN ('NEW', 'CONFIRMED', 'PAID') THEN
      NEW."dispatchedAt" := NULL;
      NEW."deliveredAt" := NULL;
    END IF;
    IF NEW."status" = 'NEW' THEN
      NEW."confirmedAt" := NULL;
    END IF;
    -- Cancelled: when (who is written by the code that cancels). Reopened: neither applies any more.
    IF NEW."status" = 'CANCELLED' AND NEW."cancelledAt" IS NULL THEN
      NEW."cancelledAt" := CURRENT_TIMESTAMP;
    END IF;
    IF NEW."status" <> 'CANCELLED' THEN
      NEW."cancelledAt" := NULL;
      NEW."cancelledBy" := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Order_step_times" ON "Order";
CREATE TRIGGER "Order_step_times" BEFORE UPDATE OF "status" ON "Order"
  FOR EACH ROW EXECUTE FUNCTION thabaal_order_step_times();

-- Orders cancelled before this: their last change is the best known time; their notes tell who, when they say.
UPDATE "Order" SET "cancelledAt" = "updatedAt" WHERE "status" = 'CANCELLED' AND "cancelledAt" IS NULL;
UPDATE "Order" SET "cancelledBy" = 'Customer on WhatsApp'
  WHERE "status" = 'CANCELLED' AND "cancelledBy" IS NULL AND "internalNote" ILIKE '%Cancelled by the customer on WhatsApp%';
UPDATE "Order" SET "cancelledBy" = 'Replaced by a newer cart'
  WHERE "status" = 'CANCELLED' AND "cancelledBy" IS NULL AND "internalNote" ILIKE '%Superseded by%';
UPDATE "Order" SET "cancelledBy" = 'Automatically: not completed in time'
  WHERE "status" = 'CANCELLED' AND "cancelledBy" IS NULL AND "internalNote" ILIKE '%Expired: not completed%';
