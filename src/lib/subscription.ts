// Thabaal plan payments and periods, stored in PlanPurchase (prisma/schema.prisma). The rules live in
// subscription-core.ts; this file reads and writes them with the checks that make them safe:
//
//  - A client's button press never changes a plan. A UPI reference is recorded as PENDING and grants nothing
//    until a Thabaal admin checks the money arrived and verifies it here. Razorpay payments are the one trusted
//    signal: lib/razorpay-billing.ts re-reads each payment from Razorpay, then calls grantGatewayPeriod.
//  - Verifying fixes the period on the server: it starts when the client's last verified period ends (or now if
//    nothing is running) and lasts the full cycle bought. Upgrades, downgrades and renewals all wait their turn.
//  - Every change takes a row lock on the client first, so two verifications (or a verification and a new
//    submission) for the same client can't interleave. A verification only applies to a row still PENDING, so
//    pressing it twice, or a callback delivered twice, changes nothing the second time; paymentRef is unique so
//    one UPI reference can't pay for two periods.
//
// Callers pass who is acting (Actor); the server actions build it from the session. Nothing here trusts a
// client-side date, price or plan.

import { Prisma } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { loadPlanPrices } from "./plan-prices-server";
import {
  isCycle,
  isPlanKey,
  nextStart,
  periodEnd,
  planDef,
  pricePaise,
  purchaseBlock,
  summarize,
  type PurchaseLike,
} from "./subscription-core";

export type Actor = {
  isAdmin: boolean;
  /** The business the login belongs to (client logins) or has picked (admins). */
  clientId: string | null;
  /** Client managers (and admins) may pay; staff and viewers may not. */
  canManage: boolean;
  name: string;
};

export type SubResult = { ok: boolean; message: string; code?: string; id?: string };

const UTR = /^[A-Za-z0-9]{6,22}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The database client or the one inside a transaction: both have what these helpers use. */
type Tx = Pick<typeof db, "planPurchase" | "$queryRaw">;

async function lockClient(tx: Tx, clientId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Client" WHERE "id" = ${clientId} FOR UPDATE`;
  return rows.length > 0;
}

const periodRows = (tx: Tx, clientId: string) =>
  tx.planPurchase.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });

export async function loadPurchases(clientId: string) {
  return periodRows(db, clientId);
}

const isUniqueClash = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function billNumber(id: string, at: Date) {
  return `TB-${formatInTimeZone(at, APP_TZ, "yyMM")}-${id.slice(-6).toUpperCase()}`;
}

/** A client says they paid for a plan period by UPI. Records it as waiting to be checked; grants nothing. */
export async function submitPlanPayment(
  actor: Actor,
  input: { clientId: string; plan: string; cycle: string; utr: string; payApp?: string; paidOn?: string },
  now = new Date(),
): Promise<SubResult> {
  if (!actor.isAdmin && actor.clientId !== input.clientId) return { ok: false, code: "forbidden", message: "You can only pay for your own business." };
  if (!actor.canManage) return { ok: false, code: "forbidden", message: "Only the business owner or a manager can pay for the plan." };
  if (!isPlanKey(input.plan) || !isCycle(input.cycle)) return { ok: false, code: "invalid", message: "Pick one of the plans and how long to pay for." };
  const ref = String(input.utr ?? "").trim().replace(/\s+/g, "");
  if (!UTR.test(ref)) return { ok: false, code: "invalid", message: "Enter the UPI reference (UTR) from your payment app: 6 to 22 letters or digits." };
  const paymentRef = `UPI:${ref.toUpperCase()}`;

  const usedInWallet = await db.walletEntry.findFirst({ where: { utr: { equals: ref, mode: "insensitive" }, status: { not: "REJECTED" } }, select: { id: true } });
  if (usedInWallet) return { ok: false, code: "duplicate", message: "This UPI reference was already used for a wallet recharge." };
  const prices = await loadPlanPrices();

  try {
    return await db.$transaction(async (tx) => {
      if (!(await lockClient(tx, input.clientId))) return { ok: false, code: "not_found", message: "Business not found." };
      const block = purchaseBlock(await periodRows(tx, input.clientId), now);
      if (block) return { ok: false, code: block.code, message: block.message };
      const row = await tx.planPurchase.create({
        data: {
          clientId: input.clientId,
          plan: input.plan as string,
          cycle: input.cycle as string,
          amountPaise: pricePaise(input.plan as never, input.cycle as never, prices),
          status: "PENDING",
          method: "UPI",
          utr: ref,
          paymentRef,
          payApp: input.payApp?.trim().slice(0, 40) || null,
          paidOn: input.paidOn?.trim().slice(0, 40) || null,
          submittedBy: actor.name,
        },
      });
      return { ok: true, id: row.id, message: "Payment details sent. Your plan doesn't change until Thabaal verifies the payment." };
    });
  } catch (e) {
    if (isUniqueClash(e)) return { ok: false, code: "duplicate", message: "This UPI reference was already sent. Each payment can be used once." };
    throw e;
  }
}

/** The client withdraws a reference that hasn't been checked yet (a typo, or a change of mind). */
export async function cancelPlanPayment(actor: Actor, id: string): Promise<SubResult> {
  const row = await db.planPurchase.findUnique({ where: { id }, select: { clientId: true } });
  if (!row || (!actor.isAdmin && actor.clientId !== row.clientId)) return { ok: false, code: "not_found", message: "Payment not found." };
  if (!actor.canManage) return { ok: false, code: "forbidden", message: "Only the business owner or a manager can change payments." };
  const r = await db.planPurchase.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "CANCELLED", paymentRef: null, decidedBy: actor.name, decidedAt: new Date(), note: "Withdrawn before it was checked" },
  });
  if (!r.count) return { ok: false, code: "settled", message: "This payment was already checked, so it can't be withdrawn." };
  return { ok: true, message: "Payment details withdrawn." };
}

/**
 * Thabaal confirms the money arrived. The period starts when the client's last verified period ends (or now,
 * if none is running) and lasts the whole cycle. Safe to call again: only a PENDING row changes.
 * A client with no verified period on record may be one set up before plans were tracked and already paid
 * another way, so starting "now" needs `startNowIfNoHistory`; otherwise record their existing period first.
 */
export async function verifyPlanPayment(
  actor: Actor,
  id: string,
  opts: { startNowIfNoHistory?: boolean } = {},
  now = new Date(),
): Promise<SubResult> {
  if (!actor.isAdmin) return { ok: false, code: "forbidden", message: "Only Thabaal can verify a payment." };
  const first = await db.planPurchase.findUnique({ where: { id }, select: { clientId: true } });
  if (!first) return { ok: false, code: "not_found", message: "Payment not found." };

  return db.$transaction(async (tx) => {
    await lockClient(tx, first.clientId);
    const row = await tx.planPurchase.findUnique({ where: { id } });
    if (!row) return { ok: false, code: "not_found", message: "Payment not found." };
    if (row.status === "VERIFIED") return { ok: true, code: "already", message: "Already verified. Nothing changed." };
    if (row.status !== "PENDING") return { ok: false, code: "settled", message: `This payment was ${row.status.toLowerCase()}, so it can't be verified.` };
    if (!isPlanKey(row.plan) || !isCycle(row.cycle)) return { ok: false, code: "invalid", message: "This payment names an unknown plan." };

    const rows = await periodRows(tx, row.clientId);
    const hasHistory = rows.some((r) => r.status === "VERIFIED");
    if (!hasHistory && !opts.startNowIfNoHistory)
      return {
        ok: false,
        code: "needs_confirm",
        message: "This business has no paid period on record. If they already paid for a period another way, record it first; otherwise confirm the plan starts now.",
      };

    const startsAt = nextStart(rows, now);
    const endsAt = periodEnd(startsAt, row.cycle, APP_TZ);
    const done = await tx.planPurchase.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "VERIFIED", startsAt, endsAt, billNo: billNumber(id, now), decidedBy: actor.name, decidedAt: now },
    });
    if (!done.count) return { ok: true, code: "already", message: "Already handled. Nothing changed." };
    const plan = planDef(row.plan)!.n;
    const when = startsAt.getTime() === now.getTime() ? "starts now" : `starts ${formatInTimeZone(startsAt, APP_TZ, "d MMM yyyy, h:mm a")}`;
    return { ok: true, message: `Verified. ${plan} ${when} and runs to ${formatInTimeZone(endsAt, APP_TZ, "d MMM yyyy, h:mm a")}.` };
  });
}

/** Thabaal couldn't find the money. Grants nothing; the reference can be sent again if it was a mistake. */
export async function rejectPlanPayment(actor: Actor, id: string, reason: string): Promise<SubResult> {
  if (!actor.isAdmin) return { ok: false, code: "forbidden", message: "Only Thabaal can turn down a payment." };
  const r = await db.planPurchase.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", paymentRef: null, decidedBy: actor.name, decidedAt: new Date(), note: reason.trim().slice(0, 200) || "Payment not found" },
  });
  if (!r.count) return { ok: false, code: "settled", message: "This payment was already handled." };
  return { ok: true, message: "Payment turned down. The client sees it wasn't found." };
}

/**
 * For a business set up before plan payments were tracked: Thabaal records the period the client already paid
 * for (from its own records), so their next payment is scheduled after it instead of starting now.
 */
export async function recordExistingPeriod(
  actor: Actor,
  input: { clientId: string; plan: string; cycle: string; startDate: string; note?: string },
  now = new Date(),
): Promise<SubResult> {
  if (!actor.isAdmin) return { ok: false, code: "forbidden", message: "Only Thabaal can record a paid period." };
  if (!isPlanKey(input.plan) || !isCycle(input.cycle)) return { ok: false, code: "invalid", message: "Pick the plan and how long it was paid for." };
  if (!DATE_ONLY.test(input.startDate)) return { ok: false, code: "invalid", message: "Enter the date the paid period started." };
  const startsAt = fromZonedTime(`${input.startDate}T00:00:00`, APP_TZ);
  if (Number.isNaN(startsAt.getTime()) || startsAt > now) return { ok: false, code: "invalid", message: "The start date must be today or earlier." };
  const endsAt = periodEnd(startsAt, input.cycle, APP_TZ);
  const prices = await loadPlanPrices();

  return db.$transaction(async (tx) => {
    if (!(await lockClient(tx, input.clientId))) return { ok: false, code: "not_found", message: "Business not found." };
    const rows = await periodRows(tx, input.clientId);
    const overlap = rows.some((r) => r.status === "VERIFIED" && r.startsAt && r.endsAt && r.startsAt < endsAt && startsAt < r.endsAt);
    if (overlap) return { ok: false, code: "overlap", message: "That period overlaps one already on record." };
    const row = await tx.planPurchase.create({
      data: {
        clientId: input.clientId,
        plan: input.plan as string,
        cycle: input.cycle as string,
        amountPaise: pricePaise(input.plan as never, input.cycle as never, prices),
        status: "VERIFIED",
        method: "ADMIN_RECORD",
        startsAt,
        endsAt,
        submittedBy: actor.name,
        decidedBy: actor.name,
        decidedAt: now,
        note: input.note?.trim().slice(0, 200) || "Paid before plan payments were tracked",
      },
    });
    return { ok: true, id: row.id, message: `Recorded ${planDef(input.plan)!.n} to ${formatInTimeZone(endsAt, APP_TZ, "d MMM yyyy")}.` };
  });
}

/**
 * A payment gateway confirmed the money (Razorpay, checked on the server: lib/razorpay-billing.ts). Records a
 * verified period straight away, placed like any verified payment: after the last verified period, or now.
 * `paymentRef` is unique, so the same payment arriving twice (checkout and webhook) grants one period.
 */
export async function grantGatewayPeriod(
  input: { clientId: string; plan: string; cycle: string; amountPaise: number; paymentRef: string; paymentId: string; payApp?: string | null; by: string; note?: string },
  now = new Date(),
): Promise<SubResult> {
  if (!isPlanKey(input.plan) || !isCycle(input.cycle)) return { ok: false, code: "invalid", message: "Unknown plan." };
  try {
    return await db.$transaction(async (tx) => {
      if (!(await lockClient(tx, input.clientId))) return { ok: false, code: "not_found", message: "Business not found." };
      const already = await tx.planPurchase.findUnique({ where: { paymentRef: input.paymentRef }, select: { id: true } });
      if (already) return { ok: true, code: "already", id: already.id, message: "Already recorded." };
      const rows = await periodRows(tx, input.clientId);
      const startsAt = nextStart(rows, now);
      const endsAt = periodEnd(startsAt, input.cycle as never, APP_TZ);
      const row = await tx.planPurchase.create({
        data: {
          clientId: input.clientId,
          plan: input.plan,
          cycle: input.cycle,
          amountPaise: input.amountPaise,
          status: "VERIFIED",
          method: "RAZORPAY",
          utr: input.paymentId,
          paymentRef: input.paymentRef,
          payApp: input.payApp?.slice(0, 40) || null,
          startsAt,
          endsAt,
          submittedBy: input.by,
          decidedBy: "Razorpay",
          decidedAt: now,
          note: input.note?.slice(0, 200) || null,
        },
      });
      await tx.planPurchase.update({ where: { id: row.id }, data: { billNo: billNumber(row.id, now) } });
      return { ok: true, id: row.id, message: `${planDef(input.plan)!.n} paid to ${formatInTimeZone(endsAt, APP_TZ, "d MMM yyyy, h:mm a")}.` };
    });
  } catch (e) {
    if (isUniqueClash(e)) return { ok: true, code: "already", message: "Already recorded." };
    throw e;
  }
}

/**
 * The plan whose limits apply now. Businesses with no verified period on record (set up before plans were
 * tracked) are "unmanaged": nothing here limits them, as before. Once a business has a verified period, an
 * ended plan keeps no paid capacity.
 */
export async function effectivePlan(clientId: string, now = new Date()) {
  const rows: PurchaseLike[] = await db.planPurchase.findMany({
    where: { clientId, status: "VERIFIED" },
    select: { id: true, plan: true, cycle: true, status: true, startsAt: true, endsAt: true, createdAt: true },
  });
  const s = summarize(rows, now);
  return { status: s.status, plan: s.active ? (planDef(s.active.plan) ?? null) : null, endsAt: s.active?.endsAt ?? s.lastEnded?.endsAt ?? null };
}

/** Why one more WhatsApp number or staff login can't be added for this business now, or null if it can. */
export async function planCapacityBlock(clientId: string, kind: "num" | "staff", now = new Date()): Promise<string | null> {
  const eff = await effectivePlan(clientId, now);
  if (eff.status === "none") return null;
  const what = kind === "num" ? "WhatsApp numbers" : "staff logins";
  if (!eff.plan) return `This business's plan ended${eff.endsAt ? ` on ${formatInTimeZone(eff.endsAt, APP_TZ, "d MMM yyyy")}` : ""}. Renew it before adding more ${what}.`;
  const used = kind === "num" ? await db.whatsAppNumber.count({ where: { clientId } }) : await db.user.count({ where: { clientId } });
  const limit = eff.plan.lim[kind];
  return used >= limit ? `The ${eff.plan.n} plan allows ${limit} ${what}, and all are in use.` : null;
}

/** Thabaal decides whether a business must have a paid plan to use thabaal (new businesses start with yes). */
export async function setPlanRequired(actor: Actor, clientId: string, required: boolean): Promise<SubResult> {
  if (!actor.isAdmin) return { ok: false, code: "forbidden", message: "Only Thabaal can change this." };
  const r = await db.client.updateMany({ where: { id: clientId }, data: { planRequired: required } });
  if (!r.count) return { ok: false, code: "not_found", message: "Business not found." };
  return {
    ok: true,
    message: required
      ? "This business now needs a paid plan. Without one, only Home, My account and Settings open."
      : "This business no longer needs a paid plan to use thabaal.",
  };
}
