import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { CYCLE_NAMES, type BillingCycle, type PlanKey } from "./account-plans";
import { capturedPayment, orderSignatureOk, razorpayKeys, RazorpayError, rzp, subscriptionSignatureOk, type RzpPayment } from "./razorpay";
import { isCycle, isPlanKey, paidThrough, planDef, pricePaise, purchaseBlock } from "./subscription-core";
import { grantGatewayPeriod } from "./subscription";
import { sendEmail } from "./email";

// Thabaal's own fees through Razorpay.
//
//  - Plan: a Razorpay Subscription per business (auto-renew). Every successful charge, from checkout or from the
//    subscription.charged webhook, records one verified plan period (lib/subscription.ts grantGatewayPeriod),
//    keyed by the Razorpay payment id so the same charge never grants twice.
//  - Wallet: a one-time Razorpay Order. A captured payment for exactly the order's amount adds a DONE recharge.
//  - Test (Thabaal admins only): the same flows for ₹1 that grant nothing, to check live keys and the webhook.
//
// Nothing here trusts the browser: amounts come from the server's prices, the business comes from the
// RazorpayRecord row made when the subscription or order was created, and every payment is re-read from
// Razorpay (and captured if needed) before anything is granted.

export type Result = { ok: boolean; message: string };
type Who = { clientId: string | null; name: string; canManage: boolean; isAdmin: boolean };

const TOTAL_COUNT: Record<BillingCycle, number> = { m: 120, q: 40, y: 10 };
const INTERVAL: Record<BillingCycle, number> = { m: 1, q: 3, y: 12 };
const LIVE_SUB = ["authenticated", "active", "pending", "halted"];
export const TEST_PAISE = 100;
const MIN_RECHARGE = 100;
const MAX_RECHARGE = 500_000;

const keysOr = () => {
  const k = razorpayKeys();
  if (!k) throw new RazorpayError("Online payment isn't set up yet. Pay by UPI below, or try again later.", 500, "not_configured");
  return k;
};
const say = (e: unknown) => (e instanceof RazorpayError ? e.message : "Couldn't reach Razorpay. Try again in a minute.");
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const nowSec = () => Math.floor(Date.now() / 1000);

/** Tells Thabaal's inbox about something that needs a person (a failing auto-renew, a dispute). Never throws. */
async function alertThabaal(subject: string, clientId: string | null, rows: [string, string][]) {
  try {
    const client = clientId ? await db.client.findUnique({ where: { id: clientId }, select: { name: true } }) : null;
    await sendEmail({ subject, rows: [["Business", client?.name ?? (clientId ? clientId : "Thabaal (test)")], ...rows] });
  } catch (e) {
    console.error("razorpay alert email", e);
  }
}

type RzpSubscription = { id: string; status: string; current_end?: number | null; charge_at?: number | null; start_at?: number | null };
type RzpOrder = { id: string; amount: number; status: string };

/* ----------------------------------------------------------------- plans */

/** The Razorpay plan for a Thabaal plan, cycle and price, made once per key mode and reused. */
async function razorpayPlanId(plan: PlanKey | "test", cycle: BillingCycle, amountPaise: number) {
  const mode = keysOr().mode;
  const lookupKey = `${plan}-${cycle}-${amountPaise}-${mode}`;
  const found = await db.razorpayRecord.findFirst({ where: { kind: "plan_def", lookupKey }, select: { rzpId: true } });
  if (found) return found.rzpId;
  const name = plan === "test" ? "Thabaal live test" : `Thabaal ${planDef(plan)!.n}`;
  const created = await rzp<{ id: string }>("POST", "/plans", {
    period: "monthly",
    interval: INTERVAL[cycle],
    item: { name: `${name} · ${CYCLE_NAMES[cycle].en}`, amount: amountPaise, currency: "INR" },
    notes: { thabaal_plan: plan, cycle },
  });
  await db.razorpayRecord.create({
    data: { kind: "plan_def", rzpId: created.id, purpose: plan === "test" ? "test" : "plan", plan, cycle, amountPaise, status: "ready", lookupKey },
  });
  return created.id;
}

/* --------------------------------------------------------- subscriptions */

export type CheckoutStart =
  | { ok: false; message: string }
  | { ok: true; kind: "subscription" | "order"; id: string; keyId: string; amountPaise: number; label: string; startsLabel: string | null };

/**
 * Starts auto-renew for a plan: a Razorpay subscription the client authorises in checkout. If a paid period is
 * still running, the first charge waits until it ends, so paying early never overlaps a paid term.
 */
export async function startPlanSubscription(who: Who, plan: string, cycle: string, now = new Date()): Promise<CheckoutStart> {
  try {
    if (!who.clientId) return { ok: false, message: who.isAdmin ? "Pick a client in the sidebar first." : "Your login isn't linked to a business." };
    if (!who.canManage) return { ok: false, message: "Only the business owner or a manager can pay for the plan." };
    if (!isPlanKey(plan) || !isCycle(cycle)) return { ok: false, message: "Pick one of the plans and how long to pay for." };
    const k = keysOr();
    const clientId = who.clientId;
    const rows = await db.planPurchase.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
    const block = purchaseBlock(rows, now);
    if (block) return { ok: false, message: block.message };

    const amountPaise = pricePaise(plan, cycle);
    const label = `${planDef(plan)!.n} · ${CYCLE_NAMES[cycle].en}`;
    const same = await db.razorpayRecord.findFirst({
      where: { kind: "subscription", purpose: "plan", clientId, plan, cycle, amountPaise, status: { in: ["authenticated", "active"] } },
      select: { id: true },
    });
    if (same) return { ok: false, message: `Auto-renew is already on for ${label}.` };

    const through = paidThrough(rows);
    const startAt = through && through.getTime() > now.getTime() + 10 * 60_000 ? Math.floor(through.getTime() / 1000) : null;
    const startsLabel = startAt ? formatInTimeZone(new Date(startAt * 1000), APP_TZ, "d MMM yyyy, h:mm a") : null;

    // Reuse a checkout opened in the last 30 minutes for the same plan instead of piling up unpaid subscriptions.
    const recent = await db.razorpayRecord.findFirst({
      where: { kind: "subscription", purpose: "plan", clientId, plan, cycle, amountPaise, status: "created", createdAt: { gte: new Date(now.getTime() - 30 * 60_000) } },
      orderBy: { createdAt: "desc" },
      select: { rzpId: true },
    });
    if (recent) return { ok: true, kind: "subscription", id: recent.rzpId, keyId: k.keyId, amountPaise, label, startsLabel };

    const planId = await razorpayPlanId(plan, cycle, amountPaise);
    const sub = await rzp<RzpSubscription>("POST", "/subscriptions", {
      plan_id: planId,
      total_count: TOTAL_COUNT[cycle],
      quantity: 1,
      customer_notify: 1,
      ...(startAt ? { start_at: startAt } : {}),
      expire_by: nowSec() + 3 * 86_400,
      notes: { clientId, plan, cycle, purpose: "plan" },
    });
    await db.razorpayRecord.create({
      data: { kind: "subscription", rzpId: sub.id, purpose: "plan", clientId, plan, cycle, amountPaise, status: sub.status || "created", createdBy: who.name },
    });
    return { ok: true, kind: "subscription", id: sub.id, keyId: k.keyId, amountPaise, label, startsLabel };
  } catch (e) {
    console.error("razorpay startPlanSubscription", e);
    return { ok: false, message: say(e) };
  }
}

/** Ends the business's other auto-renewals once a new one is authorised: a running one stops at its cycle end. */
async function cancelOtherSubscriptions(clientId: string | null, purpose: string, keepRzpId: string) {
  const others = await db.razorpayRecord.findMany({
    where: { kind: "subscription", purpose, clientId, rzpId: { not: keepRzpId }, status: { in: [...LIVE_SUB, "created"] } },
  });
  for (const o of others) {
    try {
      const atEnd = o.status === "active";
      const s = await rzp<RzpSubscription>("POST", `/subscriptions/${o.rzpId}/cancel`, { cancel_at_cycle_end: atEnd ? 1 : 0 });
      await db.razorpayRecord.update({ where: { id: o.id }, data: { status: atEnd ? "cancelling" : s.status, note: "Replaced by a new auto-renew" } });
    } catch (e) {
      console.error("razorpay cancel replaced subscription", o.rzpId, e);
    }
  }
}

/** A captured charge of a subscription: one verified plan period (or, for the admin test, just a note). */
async function applySubscriptionCharge(rzpSubId: string, payment: RzpPayment, source: string): Promise<Result> {
  const rec = await db.razorpayRecord.findUnique({ where: { rzpId: rzpSubId } });
  if (!rec || rec.kind !== "subscription") return { ok: false, message: "Unknown subscription." };
  await db.razorpayRecord.update({ where: { id: rec.id }, data: { paymentId: payment.id } });
  if (payment.status !== "captured") return { ok: false, message: "The payment isn't complete yet." };
  if (payment.amount !== rec.amountPaise) {
    // An authorisation charge (first charge later) or a price mismatch: never grants a period.
    await db.razorpayRecord.update({ where: { id: rec.id }, data: { note: `Payment ${payment.id} of ${rupees(payment.amount)} didn't match ${rupees(rec.amountPaise)}` } });
    return { ok: true, message: "Auto-renew is set." };
  }
  if (rec.purpose === "test") {
    await db.razorpayRecord.update({ where: { id: rec.id }, data: { note: `Test charge ${payment.id} received (${source})` } });
    return { ok: true, message: `Test charge of ${rupees(payment.amount)} received.` };
  }
  if (!rec.clientId || !rec.plan || !rec.cycle) return { ok: false, message: "Subscription is missing its business." };
  const r = await grantGatewayPeriod({
    clientId: rec.clientId,
    plan: rec.plan,
    cycle: rec.cycle,
    amountPaise: payment.amount,
    paymentRef: `RZP:${payment.id}`,
    paymentId: payment.id,
    payApp: payment.method ? `Razorpay ${payment.method}` : "Razorpay",
    by: rec.createdBy ?? "Razorpay",
    note: `Auto-renew ${rzpSubId}`,
  });
  if (r.id) await db.razorpayRecord.update({ where: { id: rec.id }, data: { refId: r.id } });
  return { ok: r.ok, message: r.message };
}

/** Checkout said the subscription was authorised: check the signature, then read the truth from Razorpay. */
export async function confirmSubscriptionCheckout(who: Who, input: { subscriptionId: string; paymentId: string; signature: string }): Promise<Result> {
  try {
    if (!subscriptionSignatureOk(input.subscriptionId, input.paymentId, input.signature)) return { ok: false, message: "This payment couldn't be confirmed. If money left your account, contact Thabaal." };
    const rec = await db.razorpayRecord.findUnique({ where: { rzpId: input.subscriptionId } });
    if (!rec || rec.kind !== "subscription") return { ok: false, message: "Payment not found." };
    if (rec.purpose === "test" ? !who.isAdmin : rec.clientId !== who.clientId) return { ok: false, message: "Payment not found." };
    const [payment, sub] = await Promise.all([capturedPayment(input.paymentId), rzp<RzpSubscription>("GET", `/subscriptions/${input.subscriptionId}`)]);
    await db.razorpayRecord.update({ where: { id: rec.id }, data: { status: sub.status } });
    if (["authenticated", "active"].includes(sub.status)) await cancelOtherSubscriptions(rec.clientId, rec.purpose, rec.rzpId);
    const charged = await applySubscriptionCharge(rec.rzpId, payment, "checkout");
    if (payment.amount !== rec.amountPaise && sub.charge_at) {
      return { ok: true, message: `Auto-renew is on. The first charge of ${rupees(rec.amountPaise)} is on ${formatInTimeZone(new Date(sub.charge_at * 1000), APP_TZ, "d MMM yyyy")}.` };
    }
    return charged.ok ? { ok: true, message: `Paid. ${charged.message} Auto-renew is on.` } : charged;
  } catch (e) {
    console.error("razorpay confirmSubscriptionCheckout", e);
    return { ok: false, message: `${say(e)} If money left your account, it is added automatically within a few minutes.` };
  }
}

/** Turns off auto-renew. A running period stays; the next charge doesn't happen. */
export async function cancelAutoRenew(who: Who, purpose: "plan" | "test" = "plan"): Promise<Result> {
  try {
    if (purpose === "plan" && (!who.clientId || !who.canManage)) return { ok: false, message: "Only the business owner or a manager can change this." };
    if (purpose === "test" && !who.isAdmin) return { ok: false, message: "Only Thabaal can do this." };
    const subs = await db.razorpayRecord.findMany({
      where: { kind: "subscription", purpose, ...(purpose === "plan" ? { clientId: who.clientId } : {}), status: { in: LIVE_SUB } },
    });
    if (!subs.length) return { ok: false, message: "Auto-renew isn't on." };
    for (const s of subs) {
      const atEnd = s.status === "active";
      const r = await rzp<RzpSubscription>("POST", `/subscriptions/${s.rzpId}/cancel`, { cancel_at_cycle_end: atEnd ? 1 : 0 });
      await db.razorpayRecord.update({ where: { id: s.id }, data: { status: atEnd ? "cancelling" : r.status, note: `Turned off by ${who.name}` } });
    }
    return { ok: true, message: "Auto-renew is off. Your current period stays until it ends; pay again any time." };
  } catch (e) {
    console.error("razorpay cancelAutoRenew", e);
    return { ok: false, message: say(e) };
  }
}

/** The business's auto-renew, for the account page. */
export async function autoRenewView(clientId: string) {
  const rec = await db.razorpayRecord.findFirst({
    where: { kind: "subscription", purpose: "plan", clientId, status: { in: [...LIVE_SUB, "cancelling"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!rec || !rec.plan || !isPlanKey(rec.plan) || !rec.cycle || !isCycle(rec.cycle)) return null;
  return { plan: rec.plan, cycle: rec.cycle, status: rec.status, amount: rec.amountPaise / 100 };
}

/* ---------------------------------------------------------------- orders */

/** A one-time payment: a wallet recharge, or the admin's ₹1 test. */
export async function startOrder(who: Who, purpose: "wallet" | "test", rupeesAmount: number): Promise<CheckoutStart> {
  try {
    const k = keysOr();
    let clientId: string | null = null;
    let amountPaise = TEST_PAISE;
    if (purpose === "test") {
      if (!who.isAdmin) return { ok: false, message: "Only Thabaal can run the test payment." };
    } else {
      if (!who.clientId || !who.canManage) return { ok: false, message: "Only the business owner or a manager can recharge." };
      const client = await db.client.findUnique({ where: { id: who.clientId }, select: { billingMode: true } });
      if (client?.billingMode !== "wallet") return { ok: false, message: "This account pays Meta directly, so it has no Thabaal wallet." };
      const value = Math.round(Number(rupeesAmount) * 100) / 100;
      if (!(value >= MIN_RECHARGE) || value > MAX_RECHARGE) return { ok: false, message: `Enter an amount from ₹${MIN_RECHARGE} to ₹${MAX_RECHARGE.toLocaleString("en-IN")}.` };
      clientId = who.clientId;
      amountPaise = Math.round(value * 100);
    }
    const order = await rzp<RzpOrder>("POST", "/orders", {
      amount: amountPaise,
      currency: "INR",
      receipt: `${purpose === "test" ? "t" : "w"}-${Date.now().toString(36)}`,
      notes: { clientId: clientId ?? "", purpose },
    });
    await db.razorpayRecord.create({ data: { kind: "order", rzpId: order.id, purpose, clientId, amountPaise, status: "created", createdBy: who.name } });
    return {
      ok: true,
      kind: "order",
      id: order.id,
      keyId: k.keyId,
      amountPaise,
      label: purpose === "test" ? "Thabaal live test" : "Wallet recharge",
      startsLabel: null,
    };
  } catch (e) {
    console.error("razorpay startOrder", e);
    return { ok: false, message: say(e) };
  }
}

/**
 * Pays for one plan period once: yearly plans (each charge is above the ₹15,000 UPI AutoPay limit) and anyone who
 * doesn't want auto-renew. The period is added the moment Razorpay confirms the payment.
 */
export async function startPlanOrder(who: Who, plan: string, cycle: string, now = new Date()): Promise<CheckoutStart> {
  try {
    if (!who.clientId) return { ok: false, message: who.isAdmin ? "Pick a client in the sidebar first." : "Your login isn't linked to a business." };
    if (!who.canManage) return { ok: false, message: "Only the business owner or a manager can pay for the plan." };
    if (!isPlanKey(plan) || !isCycle(cycle)) return { ok: false, message: "Pick one of the plans and how long to pay for." };
    const k = keysOr();
    const clientId = who.clientId;
    const rows = await db.planPurchase.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
    const block = purchaseBlock(rows, now);
    if (block) return { ok: false, message: block.message };
    const amountPaise = pricePaise(plan, cycle);
    const order = await rzp<RzpOrder>("POST", "/orders", {
      amount: amountPaise,
      currency: "INR",
      receipt: `p-${Date.now().toString(36)}`,
      notes: { clientId, plan, cycle, purpose: "plan" },
    });
    await db.razorpayRecord.create({ data: { kind: "order", rzpId: order.id, purpose: "plan", clientId, plan, cycle, amountPaise, status: "created", createdBy: who.name } });
    const through = paidThrough(rows);
    return {
      ok: true,
      kind: "order",
      id: order.id,
      keyId: k.keyId,
      amountPaise,
      label: `${planDef(plan)!.n} · ${CYCLE_NAMES[cycle].en}`,
      startsLabel: through && through > now ? formatInTimeZone(through, APP_TZ, "d MMM yyyy, h:mm a") : null,
    };
  } catch (e) {
    console.error("razorpay startPlanOrder", e);
    return { ok: false, message: say(e) };
  }
}

/** A paid order: re-read the payment, check it is this order's full amount, then credit once. */
async function applyOrderPayment(orderId: string, paymentId: string): Promise<Result> {
  const rec = await db.razorpayRecord.findUnique({ where: { rzpId: orderId } });
  if (!rec || rec.kind !== "order") return { ok: false, message: "Unknown order." };
  if (rec.status === "paid")
    return { ok: true, message: rec.purpose === "test" ? "Test payment received." : rec.purpose === "plan" ? "Already paid. Your plan is updated." : `${rupees(rec.amountPaise)} added to the wallet.` };
  const p = await capturedPayment(paymentId);
  if (p.order_id !== orderId || p.status !== "captured" || p.amount !== rec.amountPaise || p.currency !== "INR") {
    await db.razorpayRecord.update({ where: { id: rec.id }, data: { paymentId, note: `Payment ${paymentId} is ${p.status}, ${rupees(p.amount)}` } });
    return { ok: false, message: p.status === "failed" ? "The payment failed. No money was taken." : "The payment isn't complete yet." };
  }
  if (rec.purpose === "plan") {
    // grantGatewayPeriod is keyed by the payment id, so running this twice (checkout and webhook) adds one period.
    const r = await grantGatewayPeriod({
      clientId: rec.clientId!,
      plan: rec.plan ?? "",
      cycle: rec.cycle ?? "",
      amountPaise: p.amount,
      paymentRef: `RZP:${p.id}`,
      paymentId: p.id,
      payApp: p.method ? `Razorpay ${p.method}` : "Razorpay",
      by: rec.createdBy ?? "Razorpay",
      note: `One-time ${orderId}`,
    });
    await db.razorpayRecord.update({ where: { id: rec.id }, data: { paymentId: p.id, ...(r.ok ? { status: "paid", refId: r.id ?? rec.refId } : { note: r.message }) } });
    if (!r.ok) await alertThabaal("Razorpay plan payment needs a look", rec.clientId, [["Payment", p.id], ["Problem", r.message]]);
    return r.ok ? { ok: true, message: `Paid. ${r.message}` } : r;
  }
  return db.$transaction(async (tx) => {
    const claim = await tx.razorpayRecord.updateMany({ where: { id: rec.id, status: { not: "paid" } }, data: { status: "paid", paymentId: p.id } });
    if (!claim.count) return { ok: true, message: "Already added." };
    if (rec.purpose === "test") {
      await tx.razorpayRecord.update({ where: { id: rec.id }, data: { note: `Test payment via ${p.method ?? "Razorpay"}` } });
      return { ok: true, message: `Test payment of ${rupees(p.amount)} received.` };
    }
    const entry = await tx.walletEntry.create({
      data: {
        clientId: rec.clientId!,
        kind: "RECHARGE",
        amount: p.amount / 100,
        status: "DONE",
        utr: p.id,
        note: `Razorpay${p.method ? ` · ${p.method}` : ""}`,
        createdBy: rec.createdBy,
        decidedBy: "Razorpay",
        decidedAt: new Date(),
      },
    });
    await tx.razorpayRecord.update({ where: { id: rec.id }, data: { refId: entry.id } });
    // Campaigns that stopped for want of money try again straight away.
    await tx.campaignRun.updateMany({ where: { status: "WAITING_FUNDS", campaign: { clientId: rec.clientId! } }, data: { nextBatchAt: new Date() } });
    return { ok: true, message: `${rupees(p.amount)} added to the wallet.` };
  });
}

export async function confirmOrderCheckout(who: Who, input: { orderId: string; paymentId: string; signature: string }): Promise<Result> {
  try {
    if (!orderSignatureOk(input.orderId, input.paymentId, input.signature)) return { ok: false, message: "This payment couldn't be confirmed. If money left your account, contact Thabaal." };
    const rec = await db.razorpayRecord.findUnique({ where: { rzpId: input.orderId }, select: { purpose: true, clientId: true } });
    if (!rec || (rec.purpose === "test" ? !who.isAdmin : rec.clientId !== who.clientId)) return { ok: false, message: "Payment not found." };
    return await applyOrderPayment(input.orderId, input.paymentId);
  } catch (e) {
    console.error("razorpay confirmOrderCheckout", e);
    return { ok: false, message: `${say(e)} If money left your account, it is added automatically within a few minutes.` };
  }
}

/* --------------------------------------------------------------- webhook */

type WebhookBody = {
  event: string;
  payload?: {
    payment?: { entity?: RzpPayment };
    subscription?: { entity?: RzpSubscription };
    order?: { entity?: RzpOrder };
    refund?: { entity?: { id: string; payment_id: string; amount: number; status?: string } };
    dispute?: { entity?: { id: string; payment_id: string; amount: number; reason_code?: string; status?: string; respond_by?: number } };
  };
};

/** Applies one verified webhook event. Safe to run twice for the same event. */
export async function handleRazorpayEvent(body: WebhookBody): Promise<string> {
  const pay = body.payload?.payment?.entity;
  const sub = body.payload?.subscription?.entity;
  switch (body.event) {
    case "payment.authorized":
    case "payment.captured":
    case "order.paid": {
      const orderId = body.payload?.order?.entity?.id ?? pay?.order_id;
      if (!orderId || !pay) return "no order";
      const rec = await db.razorpayRecord.findUnique({ where: { rzpId: orderId }, select: { kind: true } });
      if (!rec) return "not ours"; // subscription charges carry their own order; subscription.charged handles them
      return (await applyOrderPayment(orderId, pay.id)).message;
    }
    case "payment.failed": {
      if (!pay) return "no payment";
      const where = pay.order_id ? { rzpId: pay.order_id } : null;
      if (where) await db.razorpayRecord.updateMany({ where: { ...where, status: "created" }, data: { paymentId: pay.id, note: `Failed: ${pay.error_description ?? "payment failed"}` } });
      return "noted";
    }
    case "subscription.charged": {
      if (!sub || !pay) return "no subscription";
      await db.razorpayRecord.updateMany({ where: { rzpId: sub.id }, data: { status: sub.status } });
      return (await applySubscriptionCharge(sub.id, pay, "webhook")).message;
    }
    case "subscription.authenticated":
    case "subscription.activated":
    case "subscription.pending":
    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed":
    case "subscription.paused":
    case "subscription.resumed":
    case "subscription.updated": {
      if (!sub) return "no subscription";
      const rec = await db.razorpayRecord.findUnique({ where: { rzpId: sub.id } });
      if (!rec) return "not ours";
      // "cancelling" (turned off, running to its end) stays until Razorpay says it is cancelled or completed.
      const status = rec.status === "cancelling" && ["active", "pending"].includes(sub.status) ? "cancelling" : sub.status;
      await db.razorpayRecord.update({ where: { id: rec.id }, data: { status } });
      if (["subscription.authenticated", "subscription.activated"].includes(body.event)) await cancelOtherSubscriptions(rec.clientId, rec.purpose, rec.rzpId);
      // An immediate start carries its first charge on "activated"; granting is keyed by payment id, so a later
      // subscription.charged for the same payment adds nothing.
      if (body.event === "subscription.activated" && pay) await applySubscriptionCharge(sub.id, pay, "webhook");
      if (body.event === "subscription.halted" && rec.purpose === "plan")
        await alertThabaal("Auto-renew stopped: payments failed", rec.clientId, [
          ["Subscription", sub.id],
          ["What happens", "Razorpay stopped retrying. The plan ends at the end of the paid period unless the business pays again."],
        ]);
      return status;
    }
    case "refund.processed": {
      const rf = body.payload?.refund?.entity;
      if (!rf) return "no refund";
      const amount = rf.amount / 100;
      const order = await db.razorpayRecord.findFirst({ where: { kind: "order", paymentId: rf.payment_id, purpose: "wallet" } });
      if (order?.clientId) {
        const seen = await db.walletEntry.findFirst({ where: { utr: rf.id }, select: { id: true } });
        if (!seen)
          await db.walletEntry.create({
            data: { clientId: order.clientId, kind: "REFUND", amount: -amount, status: "DONE", utr: rf.id, note: `Razorpay refund of ${rf.payment_id}`, createdBy: "Razorpay", decidedBy: "Razorpay", decidedAt: new Date() },
          });
        return "wallet refund recorded";
      }
      const purchase = await db.planPurchase.findFirst({ where: { utr: rf.payment_id, method: "RAZORPAY" } });
      if (purchase && !(purchase.note ?? "").includes(rf.id)) {
        await db.planPurchase.update({
          where: { id: purchase.id },
          data: { note: `${purchase.note ? `${purchase.note} · ` : ""}Refunded ₹${amount.toLocaleString("en-IN")} (${rf.id}); period not changed`.slice(0, 200) },
        });
        return "plan refund noted";
      }
      await db.razorpayRecord.updateMany({ where: { paymentId: rf.payment_id }, data: { note: `Refunded ${rupees(rf.amount)} (${rf.id})` } });
      return "refund noted";
    }
    case "refund.created":
    case "refund.failed": {
      const rf = body.payload?.refund?.entity;
      if (!rf) return "no refund";
      const note = `Refund ${rf.id} ${body.event === "refund.failed" ? "FAILED" : "started"} (${rupees(rf.amount)})`;
      await db.razorpayRecord.updateMany({ where: { paymentId: rf.payment_id }, data: { note } });
      if (body.event === "refund.failed") {
        const rec = await db.razorpayRecord.findFirst({ where: { paymentId: rf.payment_id }, select: { clientId: true } });
        await alertThabaal("Razorpay refund failed", rec?.clientId ?? null, [["Payment", rf.payment_id], ["Refund", rf.id], ["Amount", rupees(rf.amount)]]);
      }
      return note;
    }
    case "payment.dispute.created":
    case "payment.dispute.action_required":
    case "payment.dispute.under_review":
    case "payment.dispute.won":
    case "payment.dispute.lost":
    case "payment.dispute.closed": {
      const d = body.payload?.dispute?.entity;
      const paymentId = d?.payment_id ?? pay?.id;
      if (!paymentId) return "no dispute";
      const what = body.event.replace("payment.dispute.", "");
      await db.razorpayRecord.updateMany({ where: { paymentId }, data: { note: `Dispute ${what}${d ? ` (${rupees(d.amount)})` : ""}` } });
      const rec = await db.razorpayRecord.findFirst({ where: { paymentId }, select: { clientId: true } });
      const plan = await db.planPurchase.findFirst({ where: { utr: paymentId, method: "RAZORPAY" }, select: { clientId: true } });
      await alertThabaal(`Razorpay dispute ${what}`, rec?.clientId ?? plan?.clientId ?? null, [
        ["Payment", paymentId],
        ["Reason", d?.reason_code ?? "-"],
        ["Respond by", d?.respond_by ? formatInTimeZone(new Date(d.respond_by * 1000), APP_TZ, "d MMM yyyy") : "-"],
        ["Where", "Razorpay Dashboard → Disputes"],
      ]);
      return `dispute ${what}`;
    }
    default:
      // Payment links, QR codes, settlements, downtime, tokens, invoices and the rest: nothing to change here.
      // (Subscription invoices are covered by subscription.charged.)
      return "ignored";
  }
}

/* ------------------------------------------------------------- admin test */

/** ₹1 monthly auto-renew on Thabaal's live keys. Grants nothing; cancel it after the first charge. */
export async function startTestSubscription(who: Who): Promise<CheckoutStart> {
  try {
    if (!who.isAdmin) return { ok: false, message: "Only Thabaal can run the test." };
    const k = keysOr();
    const planId = await razorpayPlanId("test", "m", TEST_PAISE);
    const sub = await rzp<RzpSubscription>("POST", "/subscriptions", {
      plan_id: planId,
      total_count: 12,
      quantity: 1,
      customer_notify: 1,
      expire_by: nowSec() + 86_400,
      notes: { purpose: "test" },
    });
    await db.razorpayRecord.create({ data: { kind: "subscription", rzpId: sub.id, purpose: "test", plan: "test", cycle: "m", amountPaise: TEST_PAISE, status: sub.status || "created", createdBy: who.name } });
    return { ok: true, kind: "subscription", id: sub.id, keyId: k.keyId, amountPaise: TEST_PAISE, label: "Thabaal live test · auto-renew", startsLabel: null };
  } catch (e) {
    console.error("razorpay startTestSubscription", e);
    return { ok: false, message: say(e) };
  }
}

/** For the admin settings page: key mode and recent Razorpay activity. Never returns secrets. */
export async function razorpayStatus() {
  const k = razorpayKeys();
  const [recent, events] = await Promise.all([
    db.razorpayRecord.findMany({ where: { kind: { not: "plan_def" } }, orderBy: { updatedAt: "desc" }, take: 12 }),
    db.razorpayEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return {
    configured: !!k,
    mode: k?.mode ?? null,
    keyIdHint: k ? `${k.keyId.slice(0, 13)}…` : null,
    webhookSecret: !!process.env.RAZORPAY_WEBHOOK_SECRET?.trim(),
    recent,
    events,
  };
}
