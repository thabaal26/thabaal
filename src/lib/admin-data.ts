import "server-only";

// Thabaal admin panel: every number on it, worked out from the live database on each request.
// Nothing here is stored or cached, and nothing is sample data. Where a figure is an estimate (Meta charges),
// the page says so.

import { Prisma } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PLANS, type BillingCycle, type PlanKey, type PlanLimits } from "./account-plans";
import { db } from "./db";
import { APP_TZ } from "./format";
import type { PriceTable } from "./plan-prices";
import { loadPlanPrices } from "./plan-prices-server";
import { RATES } from "./spend";
import { accessState, CYCLE_MONTHS, DAY_MS, summarize, WARN_DAYS, type AccessState } from "./subscription-core";
import { SALE_WHERE } from "@/lib/sale";

// ---- plans -------------------------------------------------------------------------------------------------

export const planDefOf = (k: string | null | undefined) => PLANS.find((p) => p.k === k);
export const planName = (k: string | null | undefined) => planDefOf(k)?.n ?? (k ? k : "No plan");
const cycleOf = (c: string | null | undefined): BillingCycle => (c === "q" || c === "y" ? c : "m");
export const cycleName = (c: string | null | undefined) => ({ m: "Monthly", q: "Every 3 months", y: "Yearly" })[cycleOf(c)];

/**
 * What a plan brings in per month: the amount paid for the period spread over its months, or the price list's
 * price when the amount isn't known. A price changed later never changes what an earlier period brought in.
 */
export function monthlyValue(plan: string | null | undefined, cycle: string | null | undefined, amountPaise?: number | null, prices?: PriceTable) {
  const c = cycleOf(cycle);
  if (amountPaise && amountPaise > 0) return amountPaise / 100 / CYCLE_MONTHS[c];
  return renewalPrice(plan, cycle, prices) / CYCLE_MONTHS[c];
}
/** What a new subscription to the same plan and cycle costs today. */
export function renewalPrice(plan: string | null | undefined, cycle: string | null | undefined, prices?: PriceTable) {
  const d = planDefOf(plan);
  return d ? (prices?.[d.k] ?? d.p)[cycleOf(cycle)] : 0;
}

// ---- months in the app's time zone -------------------------------------------------------------------------

export type Month = { key: string; label: string; start: Date; end: Date };

/** The last `n` calendar months (oldest first), the current one last. */
export function lastMonths(n: number, now = new Date()): Month[] {
  const [y, m] = formatInTimeZone(now, APP_TZ, "yyyy-MM").split("-").map(Number);
  const out: Month[] = [];
  for (let i = n - 1; i >= -1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: formatInTimeZone(new Date(`${key}-15T12:00:00Z`), "UTC", "MMM"), start: fromZonedTime(`${key}-01T00:00:00`, APP_TZ), end: new Date(0) });
  }
  for (let i = 0; i < n; i++) out[i].end = out[i + 1].start;
  return out.slice(0, n);
}

const monthKey = (d: Date) => formatInTimeZone(d, APP_TZ, "yyyy-MM");

// ---- status words for a business's plan --------------------------------------------------------------------

export type Tone = "ok" | "warn" | "bad" | "info" | "mute";

export const STATE_LABEL: Record<AccessState, [Tone, string]> = {
  ok: ["ok", "Active"],
  due: ["warn", "Renews soon"],
  overdue: ["bad", "Overdue"],
  locked: ["bad", "Locked"],
  new: ["bad", "Not paid yet"],
  unmanaged: ["mute", "No plan needed"],
};

// ---- one row per business ----------------------------------------------------------------------------------

type PurchaseRow = {
  id: string;
  clientId: string;
  plan: string;
  cycle: string;
  status: string;
  method: string;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  decidedAt: Date | null;
  amountPaise: number;
  utr: string | null;
};

export type ClientRow = {
  id: string;
  name: string;
  city: string | null;
  businessType: string | null;
  createdAt: Date;
  owner: { name: string; email: string } | null;
  phone: string | null;
  planRequired: boolean;
  state: AccessState;
  stateTone: Tone;
  stateLabel: string;
  /** Plan in force, or the last one (for renewals). */
  plan: PlanKey | null;
  cycle: BillingCycle | null;
  /** Per-month value of the plan in force; 0 when nothing is paid now. */
  monthly: number;
  /** Price to renew the same plan and cycle. */
  renewal: number;
  endsAt: Date | null;
  days: number;
  pending: { id: string; amount: number; utr: string | null; createdAt: Date } | null;
  /** Razorpay auto-pay (the only way plans are paid): on (approved or charging each period), failing (last charge
   *  failed, Razorpay retrying or stopped), off (cancelled, running to the end of the paid period), or none. */
  autoPay: "on" | "failing" | "off" | "none";
  /** The newest plan subscription, for Payments › Auto-pay. */
  sub: { rzpId: string; status: string; plan: string | null; cycle: string | null; amount: number; since: Date; updatedAt: Date; note: string | null } | null;
  /** When Razorpay last collected a plan payment for this business. */
  lastAutoCharge: Date | null;
  limits: PlanLimits | null;
  usage: { numbers: number; staff: number; campaignsMonth: number; templates: number };
  salesMonth: number;
  salesTotal: number;
  ordersTotal: number;
  /** Meta charges this month, estimated from delivery reports at Meta's India rates (before GST). */
  spendMonth: number;
  messages30: { sent: number; read: number; failed: number; replied: number };
  customers: number;
  lastActivity: Date | null;
  connected: boolean;
  numbersRed: number;
  risk: number;
  health: Tone;
  healthLabel: string;
  reasons: string[];
};

const SALE: Prisma.OrderWhereInput = {
  status: { not: "CANCELLED" },
  ...SALE_WHERE,
};

type CountRow = { clientId: string; k: string | null; n: number };
type MaxRow = { clientId: string; at: Date | null };

async function messageCounts(since: Date) {
  return db.$queryRaw<CountRow[]>`
    SELECT c."clientId" AS "clientId", m.status::text AS k, count(*)::int AS n
    FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
    WHERE m."createdAt" >= ${since} AND m.simulated = false
    GROUP BY 1, 2`;
}
async function spendCounts(since: Date, until?: Date) {
  return db.$queryRaw<CountRow[]>`
    SELECT c."clientId" AS "clientId", m."pricingCategory" AS k, count(*)::int AS n
    FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
    WHERE m.billable = true AND m.simulated = false AND m."pricingCategory" IS NOT NULL AND m."pricingCategory" <> 'service'
      AND m.status::text IN ('SENT', 'DELIVERED', 'READ')
      AND m."createdAt" >= ${since} AND m."createdAt" < ${until ?? new Date(Date.now() + DAY_MS)}
    GROUP BY 1, 2`;
}
async function replyCounts(since: Date) {
  return db.$queryRaw<CountRow[]>`
    SELECT c."clientId" AS "clientId", NULL AS k, count(*)::int AS n
    FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
    WHERE r."receivedAt" >= ${since}
    GROUP BY 1`;
}
async function lastSends() {
  return db.$queryRaw<MaxRow[]>`
    SELECT c."clientId" AS "clientId", max(m."sentAt") AS at
    FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
    WHERE m.simulated = false
    GROUP BY 1`;
}
async function lastReplies() {
  return db.$queryRaw<MaxRow[]>`
    SELECT c."clientId" AS "clientId", max(r."receivedAt") AS at
    FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId"
    GROUP BY 1`;
}

const spendOf = (rows: CountRow[]) => rows.reduce((s, r) => s + r.n * (RATES[r.k ?? ""] ?? 0), 0);
const latest = (...d: (Date | null | undefined)[]) => d.filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

/** Every business, with its plan state, usage, sales and WhatsApp activity. */
export async function loadClientRows(now = new Date()): Promise<{ rows: ClientRow[]; purchases: PurchaseRow[] }> {
  const month = lastMonths(1, now)[0].start;
  const d30 = new Date(now.getTime() - 30 * DAY_MS);
  const [clients, purchases, runs, templates, salesAll, salesMonth, customers, msgs, spend, replies, sends, replyAt, orderAt] = await Promise.all([
    db.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        homeCity: true,
        businessType: true,
        createdAt: true,
        supportPhone: true,
        planRequired: true,
        waToken: true,
        users: { where: { role: "CLIENT" }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, access: true } },
        numbers: { select: { token: true, qualityRating: true } },
      },
    }),
    db.planPurchase.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, clientId: true, plan: true, cycle: true, status: true, method: true, startsAt: true, endsAt: true, createdAt: true, decidedAt: true, amountPaise: true, utr: true },
    }),
    db.campaignRun.findMany({ where: { startedAt: { gte: month } }, select: { campaign: { select: { clientId: true } } } }),
    db.template.groupBy({ by: ["clientId"], where: { status: "APPROVED" }, _count: true }),
    db.order.groupBy({ by: ["clientId"], where: SALE, _sum: { total: true }, _count: true }),
    db.order.groupBy({ by: ["clientId"], where: { ...SALE, createdAt: { gte: month } }, _sum: { total: true } }),
    db.customer.groupBy({ by: ["clientId"], _count: true }),
    messageCounts(d30),
    spendCounts(month),
    replyCounts(d30),
    lastSends(),
    lastReplies(),
    db.order.groupBy({ by: ["clientId"], _max: { createdAt: true } }),
  ]);
  const prices = await loadPlanPrices();
  // Newest plan subscription per business (Razorpay auto-pay).
  const subs = await db.razorpayRecord.findMany({
    where: { kind: "subscription", purpose: "plan", status: { in: ["authenticated", "active", "pending", "halted", "cancelling"] } },
    orderBy: { createdAt: "desc" },
    select: { clientId: true, status: true, rzpId: true, plan: true, cycle: true, amountPaise: true, createdAt: true, updatedAt: true, note: true },
  });
  const autoPayOf = (clientId: string): ClientRow["autoPay"] => {
    const s = subs.find((x) => x.clientId === clientId)?.status;
    return !s ? "none" : s === "pending" || s === "halted" ? "failing" : s === "cancelling" ? "off" : "on";
  };

  const rows = clients.map((c): ClientRow => {
    const mine = purchases.filter((p) => p.clientId === c.id);
    const acc = accessState(mine, c.planRequired, now);
    const sum = summarize(mine, now);
    const [stateTone, stateLabel] = sum.pending ? (["warn", "Checking payment"] as [Tone, string]) : STATE_LABEL[acc.state];
    const plan = (acc.plan as PlanKey | null) ?? null;
    const cycle = acc.cycle ? cycleOf(acc.cycle) : null;
    const paidNow = acc.state === "ok" || acc.state === "due";
    const m = msgs.filter((r) => r.clientId === c.id);
    const n = (k: string) => m.filter((r) => r.k === k).reduce((s, r) => s + r.n, 0);
    const sent = n("SENT") + n("DELIVERED") + n("READ");
    const read = n("READ");
    const failed = n("FAILED");
    const replied = replies.find((r) => r.clientId === c.id)?.n ?? 0;
    const connectedNumbers = c.numbers.filter((x) => x.token || c.waToken).length;
    const numbersRed = c.numbers.filter((x) => x.qualityRating === "RED").length;
    const lastActivity = latest(
      sends.find((r) => r.clientId === c.id)?.at,
      replyAt.find((r) => r.clientId === c.id)?.at,
      orderAt.find((r) => r.clientId === c.id)?._max.createdAt,
    );
    const limits = planDefOf(plan)?.lim ?? null;
    const usage = {
      numbers: c.numbers.length,
      staff: c.users.length,
      campaignsMonth: runs.filter((r) => r.campaign.clientId === c.id).length,
      templates: templates.find((t) => t.clientId === c.id)?._count ?? 0,
    };

    // Health: a plain points score from facts on record. Logins are not tracked yet, so app opens don't count.
    const reasons: string[] = [];
    let risk = 0;
    const flag = (points: number, why: string) => {
      risk += points;
      reasons.push(why);
    };
    if (acc.state === "locked" || acc.state === "new") flag(50, acc.state === "new" ? "has never paid" : "locked for non-payment");
    else if (acc.state === "overdue") flag(40, "payment overdue");
    else if (acc.state === "due") flag(10, `plan ends in ${acc.days} day${acc.days === 1 ? "" : "s"}`);
    const autoPay = autoPayOf(c.id);
    const subRec = subs.find((x) => x.clientId === c.id) ?? null;
    const lastAutoCharge = latest(...mine.filter((p) => p.method === "RAZORPAY" && p.status === "VERIFIED").map((p) => p.decidedAt ?? p.createdAt));
    if (autoPay === "failing") flag(30, "auto-pay charge failed");
    if (!connectedNumbers && (paidNow || c.planRequired)) flag(25, "no WhatsApp number connected");
    if (numbersRed) flag(20, "a number is rated red by Meta");
    if (connectedNumbers && sent === 0) flag(20, "sent nothing in 30 days");
    if (sent >= 10 && failed / (sent + failed) > 0.15) flag(10, "many messages failing");
    const [health, healthLabel]: [Tone, string] = risk < 20 ? ["ok", "Healthy"] : risk < 50 ? ["warn", "Watch"] : ["bad", "At risk"];

    return {
      id: c.id,
      name: c.name,
      city: c.homeCity,
      businessType: c.businessType,
      createdAt: c.createdAt,
      owner: c.users[0] ? { name: c.users[0].name, email: c.users[0].email } : null,
      phone: c.supportPhone,
      planRequired: c.planRequired,
      state: acc.state,
      stateTone,
      stateLabel,
      plan,
      cycle,
      monthly: paidNow ? monthlyValue(plan, cycle, sum.active?.amountPaise, prices) : 0,
      // A running subscription renews at the amount it was made with; otherwise today's price.
      renewal: subRec && autoPay !== "off" && subRec.plan === plan && subRec.cycle === cycle ? subRec.amountPaise / 100 : renewalPrice(plan, cycle, prices),
      endsAt: acc.endsAt,
      days: acc.days,
      pending: sum.pending ? { id: sum.pending.id, amount: sum.pending.amountPaise / 100, utr: sum.pending.utr, createdAt: sum.pending.createdAt } : null,
      autoPay,
      sub: subRec
        ? { rzpId: subRec.rzpId, status: subRec.status, plan: subRec.plan, cycle: subRec.cycle, amount: subRec.amountPaise / 100, since: subRec.createdAt, updatedAt: subRec.updatedAt, note: subRec.note }
        : null,
      lastAutoCharge,
      limits,
      usage,
      salesMonth: salesMonth.find((s) => s.clientId === c.id)?._sum.total ?? 0,
      salesTotal: salesAll.find((s) => s.clientId === c.id)?._sum.total ?? 0,
      ordersTotal: salesAll.find((s) => s.clientId === c.id)?._count ?? 0,
      spendMonth: spendOf(spend.filter((r) => r.clientId === c.id)),
      messages30: { sent, read, failed, replied },
      customers: customers.find((x) => x.clientId === c.id)?._count ?? 0,
      lastActivity,
      connected: connectedNumbers > 0,
      numbersRed,
      risk,
      health,
      healthLabel,
      reasons,
    };
  });
  return { rows, purchases };
}

// ---- history (last six months) ------------------------------------------------------------------------------

export type MonthPoint = { key: string; label: string; mrr: number; paying: number; collected: number; spend: number };

export async function loadHistory(purchases: PurchaseRow[], now = new Date(), n = 6): Promise<MonthPoint[]> {
  const months = lastMonths(n, now);
  const verified = purchases.filter((p) => p.status === "VERIFIED" && p.startsAt && p.endsAt);
  const spendRows = await db.$queryRaw<{ ym: string; k: string; n: number }[]>`
    SELECT to_char(m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${APP_TZ}, 'YYYY-MM') AS ym, m."pricingCategory" AS k, count(*)::int AS n
    FROM "Message" m
    WHERE m.billable = true AND m.simulated = false AND m."pricingCategory" IS NOT NULL AND m."pricingCategory" <> 'service'
      AND m.status::text IN ('SENT', 'DELIVERED', 'READ') AND m."createdAt" >= ${months[0].start}
    GROUP BY 1, 2`;
  return months.map((mo) => {
    const at = mo.end > now ? now : new Date(mo.end.getTime() - 1);
    const live = verified.filter((p) => p.startsAt! <= at && at < p.endsAt!);
    const paying = new Set(live.map((p) => p.clientId));
    const collected = verified
      .filter((p) => monthKey(p.decidedAt ?? p.createdAt) === mo.key)
      .reduce((s, p) => s + p.amountPaise / 100, 0);
    const spend = spendRows.filter((r) => r.ym === mo.key).reduce((s, r) => s + r.n * (RATES[r.k] ?? 0), 0);
    return {
      key: mo.key,
      label: mo.label,
      mrr: live.reduce((s, p) => s + monthlyValue(p.plan, p.cycle, p.amountPaise), 0),
      paying: paying.size,
      collected,
      spend,
    };
  });
}

// ---- usage across all businesses ------------------------------------------------------------------------------

export async function loadUsage(now = new Date()) {
  const months = lastMonths(6, now);
  const since14 = new Date(now.getTime() - 13 * DAY_MS);
  const day0 = fromZonedTime(`${formatInTimeZone(since14, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
  const [runs, templates, daily] = await Promise.all([
    db.campaignRun.findMany({ where: { startedAt: { gte: months[0].start } }, select: { startedAt: true } }),
    db.template.findMany({ where: { createdAt: { gte: months[0].start } }, select: { createdAt: true } }),
    db.$queryRaw<{ d: string; n: number; shops: number }[]>`
      SELECT to_char(m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${APP_TZ}, 'YYYY-MM-DD') AS d, count(*)::int AS n,
             count(DISTINCT c."clientId")::int AS shops
      FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE m."createdAt" >= ${day0} AND m.simulated = false AND m.status::text IN ('SENT', 'DELIVERED', 'READ')
      GROUP BY 1`,
  ]);
  const work = months.map((mo) => ({
    label: mo.label,
    campaigns: runs.filter((r) => monthKey(r.startedAt) === mo.key).length,
    templates: templates.filter((t) => monthKey(t.createdAt) === mo.key).length,
  }));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(day0.getTime() + i * DAY_MS + 12 * 3600_000);
    const key = formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
    const row = daily.find((r) => r.d === key);
    return { key, label: formatInTimeZone(d, APP_TZ, "EEEEE"), date: formatInTimeZone(d, APP_TZ, "d MMM"), messages: row?.n ?? 0, shops: row?.shops ?? 0 };
  });
  return { work, days };
}

// ---- plan subscriptions (Razorpay auto-pay) ----------------------------------------------------------------------

/** What each Razorpay subscription status means to Thabaal, for the admin panel. */
export const SUB_STATUS: Record<string, [Tone, string]> = {
  created: ["mute", "Checkout not finished"],
  authenticated: ["ok", "Approved · first charge later"],
  active: ["ok", "Active · charging each period"],
  pending: ["bad", "Charge failed · Razorpay retrying"],
  halted: ["bad", "Stopped · charges failed"],
  cancelling: ["warn", "Cancelled · runs to period end"],
  cancelled: ["mute", "Cancelled"],
  completed: ["mute", "Completed"],
  expired: ["mute", "Checkout expired"],
  paused: ["warn", "Paused"],
};

/** Every plan subscription of one business (or all), newest first. */
export async function loadSubscriptions(clientId?: string) {
  const rows = await db.razorpayRecord.findMany({
    where: { kind: "subscription", purpose: "plan", ...(clientId ? { clientId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, rzpId: true, clientId: true, plan: true, cycle: true, amountPaise: true, status: true, note: true, createdAt: true, updatedAt: true, paymentId: true },
    take: 200,
  });
  return rows.map((r) => ({ ...r, amount: r.amountPaise / 100 }));
}

// ---- plan payments, newest first -------------------------------------------------------------------------------

export async function loadPayments() {
  return db.planPurchase.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, name: true } } },
  });
}

/** Renewals coming up, if every business renews the plan it has now. */
export function forecast(rows: ClientRow[], now = new Date()) {
  const months = lastMonths(1, now)[0];
  const next = [0, 1, 2].map((i) => {
    const [y, m] = months.key.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { key, label: formatInTimeZone(new Date(`${key}-15T12:00:00Z`), "UTC", "MMMM") };
  });
  const renewing = rows.filter((r) => (r.state === "ok" || r.state === "due") && r.endsAt);
  const byMonth = next.map((mo) => ({
    ...mo,
    amount: renewing.filter((r) => monthKey(r.endsAt!) === mo.key).reduce((s, r) => s + r.renewal, 0),
    shops: renewing.filter((r) => monthKey(r.endsAt!) === mo.key).length,
  }));
  const in30 = renewing
    .filter((r) => r.endsAt!.getTime() - now.getTime() <= 30 * DAY_MS)
    .sort((a, b) => a.endsAt!.getTime() - b.endsAt!.getTime());
  return { byMonth, in30 };
}

export { WARN_DAYS };
