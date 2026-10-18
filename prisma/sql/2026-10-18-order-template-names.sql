-- Order update templates (order_confirmation, order_dispatched, order_delivered, order_cancelled and their pic_ /
-- thenan_ picture versions) were saved with {{1}} as the fixed sample word "Priya", so their previews (and any campaign
-- using one) said "Hello Priya". {{1}} is the customer's first name. Order updates themselves are not affected: they
-- pass the customer's name and order number when sending.
-- Safe to run again: only rows whose {{1}} is still the static sample "Priya" change, and only that one key.
UPDATE "Template"
SET "variables" = jsonb_set("variables"::jsonb, '{1}', '{"source": "first_name"}'::jsonb)
WHERE "name" ~ '^(pic_|thenan_)?order_(confirmation|dispatched|delivered|cancelled)$'
  AND "variables"::jsonb -> '1' ->> 'source' = 'static'
  AND "variables"::jsonb -> '1' ->> 'value' = 'Priya';
