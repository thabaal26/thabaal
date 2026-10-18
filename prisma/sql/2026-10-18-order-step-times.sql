-- When each order step happened (Orders > Timeline showed "Done" with no time for Confirmed, Dispatched and Delivered).
-- Additive and safe to run again: three new nullable columns and a trigger that stamps them when the status changes,
-- whichever code path (portal, WhatsApp webhook, sheet sync) changes it. Existing rows are left as they are.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Order_step_times" ON "Order";
CREATE TRIGGER "Order_step_times" BEFORE UPDATE OF "status" ON "Order"
  FOR EACH ROW EXECUTE FUNCTION thabaal_order_step_times();
