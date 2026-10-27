import "server-only";

import { formatInTimeZone } from "date-fns-tz";
import type { AdminPendingRow } from "@/app/dashboard/account/billing-types";
import type { BillingCycle, PlanKey } from "@/lib/account-plans";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/format";
import { nextStart, periodEnd } from "@/lib/subscription-core";

const label = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy, h:mm a");
const rupees = (paise: number) => Math.round(paise) / 100;
const CYCLE_LEN: Record<BillingCycle, string> = { m: "1 month", q: "3 months", y: "12 months" };

/** Pending payments, with where each period would sit if verified now, for Thabaal's check. */
export async function adminQueue(now: Date, clientId: string | null): Promise<AdminPendingRow[]> {
  const pending = await db.planPurchase.findMany({
    where: { status: "PENDING", ...(clientId ? { clientId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { client: { select: { name: true } } },
  });
  const ids = [...new Set(pending.map((p) => p.clientId))];
  const verified = ids.length ? await db.planPurchase.findMany({ where: { clientId: { in: ids }, status: "VERIFIED" } }) : [];
  return pending.map((p) => {
    const theirs = verified.filter((v) => v.clientId === p.clientId);
    const start = nextStart(theirs, now);
    const startsNow = start.getTime() === now.getTime();
    const cycle = p.cycle as BillingCycle;
    return {
      id: p.id,
      clientId: p.clientId,
      clientName: p.client.name,
      plan: p.plan as PlanKey,
      cycle,
      amount: rupees(p.amountPaise),
      utr: p.utr,
      payApp: p.payApp,
      paidOn: p.paidOn,
      submittedBy: p.submittedBy,
      submittedLabel: label(p.createdAt),
      hasHistory: theirs.length > 0,
      startsLabel: startsNow ? "When you verify" : label(start),
      endsLabel: startsNow ? `${CYCLE_LEN[cycle] ?? cycle} after that` : label(periodEnd(start, cycle, APP_TZ)),
    };
  });
}
