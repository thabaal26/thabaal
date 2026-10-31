import "server-only";

// Usage tracking for the admin panel's Usage page: what each business's logins open and do, counted per day.
// Only business logins count (role CLIENT with a business); Thabaal's admins helping a business never do.
// Recording never stops the app: a failure is logged and the page or action carries on.

import { formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";

export type UsageKind = "open" | "press" | "login";

/** Sections of the business portal, by the path after /dashboard ("" is Home). Folded like the sidebar. */
export const SECTIONS: Record<string, string> = {
  "": "Home",
  replies: "Chats",
  calls: "Chats",
  orders: "Orders",
  revenue: "Payments",
  customers: "Customers",
  refills: "Customers",
  catalogue: "Products",
  campaigns: "Campaigns",
  messages: "Campaigns",
  templates: "Templates",
  report: "Reports",
  wallet: "Wallet",
  account: "My account",
  settings: "Settings",
  guide: "Guide",
  notifications: "Notifications",
};

/** Actions counted as "buttons pressed": the key each server action records, and its short name in the admin panel. */
export const PRESSES: Record<string, string> = {
  "order.new": "New order",
  "order.step": "Order step",
  "order.confirm": "Confirm order",
  "order.dispatch": "Dispatch order",
  "order.deliver": "Mark delivered",
  "order.cod": "Cash received",
  "payment.request": "Payment link",
  "payment.record": "Mark as paid",
  "payment.verify": "Check payment",
  "chat.reply": "Reply in chat",
  "chat.send": "Send message",
  "chat.done": "Chat handled",
  "customer.save": "Save customer",
  "customer.import": "Import customers",
  "campaign.save": "Save campaign",
  "campaign.run": "Run campaign",
  "template.save": "Save template",
  "catalogue.send": "Send catalogue",
  "product.save": "Save product",
  "refill.nudge": "Refill reminder",
  "call.start": "Call customer",
  "call.answer": "Answer call",
};

/** The section a /dashboard address belongs to, or null for anything that isn't a portal section. */
export function sectionOf(path: string): string | null {
  // Plain path pieces only (no "..", no odd characters), then an optional ?query or #hash.
  const m = /^\/dashboard(?:\/([a-z-]+)(?:\/[A-Za-z0-9_-]+)*)?\/?(?:[?#].*)?$/.exec(path);
  if (!m) return null;
  const seg = m[1] ?? "";
  return seg in SECTIONS ? seg : null;
}

export type UsageWho = { id: string; role: string; clientId: string | null };

/** Counts one open, press or login for a business login. Anyone else, or an unknown key, is ignored. */
export async function recordUsage(who: UsageWho | null, kind: UsageKind, key: string, at = new Date()): Promise<boolean> {
  if (!who || who.role !== "CLIENT" || !who.clientId) return false;
  if (kind === "open" ? !(key in SECTIONS) : kind === "press" ? !(key in PRESSES) : key !== "login") return false;
  const day = formatInTimeZone(at, APP_TZ, "yyyy-MM-dd");
  try {
    await db.$executeRaw`
      INSERT INTO "UsageDay" ("clientId", "userId", "day", "kind", "key", "count", "lastAt")
      VALUES (${who.clientId}, ${who.id}, ${day}::date, ${kind}, ${key}, 1, (${at.toISOString()}::timestamptz AT TIME ZONE 'UTC'))
      ON CONFLICT ("clientId", "userId", "day", "kind", "key")
      DO UPDATE SET "count" = "UsageDay"."count" + 1, "lastAt" = GREATEST("UsageDay"."lastAt", EXCLUDED."lastAt")`;
    return true;
  } catch (e) {
    console.error("usage record", kind, key, e);
    return false;
  }
}
