-- Payments › Payment settings: what each client turned on and the rules around it.
-- Additive and safe to run again: two new nullable columns; nothing existing changes.
--   Client.paySettings: pay inside WhatsApp on/off, UPI ID, name and QR, cash on delivery limit and areas,
--   bank name with the account's last 4 digits only, and the reminder and receipt switches (lib/pay-settings.ts).
--   Order.paymentReminder2At: when the last (3-day) payment reminder went; the first one stays paymentReminderAt.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "paySettings" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentReminder2At" TIMESTAMP(3);
