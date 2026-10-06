import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { metaError } from "./meta-errors";

// Sending rules that protect a number's quality: no marketing at night, no customer
// flooded with offers, and no retrying people Meta says can't be reached.

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * When quiet hours end if `now` falls inside them (in IST), else null. Handles windows
 * that cross midnight, like 21:00–09:00.
 */
export function quietUntil(rules: { quietFrom: string | null; quietTo: string | null }, now = new Date()) {
  if (!rules.quietFrom || !rules.quietTo || rules.quietFrom === rules.quietTo) return null;
  const from = minutes(rules.quietFrom);
  const to = minutes(rules.quietTo);
  const nowMin = minutes(formatInTimeZone(now, APP_TZ, "HH:mm"));
  const inside = from < to ? nowMin >= from && nowMin < to : nowMin >= from || nowMin < to;
  if (!inside) return null;
  const today = formatInTimeZone(now, APP_TZ, "yyyy-MM-dd");
  let end = fromZonedTime(`${today}T${rules.quietTo}:00`, APP_TZ);
  if (end <= now) end = new Date(end.getTime() + 86_400_000);
  return end;
}

/** Of these customers, who got a marketing message within the gap (from any campaign). */
export async function recentlyMarketed(customerIds: string[], gapHours: number) {
  if (!gapHours || !customerIds.length) return new Map<string, Date>();
  const rows = await db.message.findMany({
    where: {
      customerId: { in: customerIds },
      sentAt: { gte: new Date(Date.now() - gapHours * 3_600_000) },
      status: { in: ["SENT", "DELIVERED", "READ"] },
      template: { category: "MARKETING" },
    },
    select: { customerId: true, sentAt: true },
    orderBy: { sentAt: "desc" },
  });
  const last = new Map<string, Date>();
  for (const r of rows) if (!last.has(r.customerId)) last.set(r.customerId, r.sentAt!);
  return last;
}

/** Updates the customer after a failed send, so campaigns stop retrying hopeless numbers. */
export async function applyFailure(customerId: string, code: number | null | undefined) {
  const kind = metaError(code)?.kind;
  if (kind === "unreachable") await db.customer.update({ where: { id: customerId }, data: { unreachable: true } });
  if (kind === "stopped-marketing") await db.customer.update({ where: { id: customerId }, data: { optedOut: true } });
}
