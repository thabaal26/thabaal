"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pushOrderToSheet } from "@/lib/google-sheets-live";
import { money, orderRef } from "@/lib/orders";
import { canUndoPayment, dueOf, isPaymentMethod, methodLabel, receivedOf } from "@/lib/payment-state";
import { confirmPayment, textInWindow } from "@/lib/payments";
import { requireOrderAccess } from "@/lib/session";
import { notifyOrder } from "./orders";
import type { SendResult } from "./send-helpers";

// Staff side of order payments: record UPI / cash / bank money (in full or in part), cash on delivery,
// checking a customer's "I paid", refunds, and undoing a payment recorded by mistake.

const stamp = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const addNote = (note: string | null, line: string) => [note, line].filter(Boolean).join("\n").slice(0, 1000);

async function ownOrder(id: string) {
  const s = await requireOrderAccess();
  if ("denied" in s) return { denied: s.denied, order: null };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!order) return { denied: "Order not found.", order: null };
  return { denied: "", order };
}

const done = (message: string, ok = true): SendResult => {
  revalidatePath("/dashboard", "layout");
  return { ok, message };
};

/**
 * Money received for an order, recorded by staff: UPI to the shop's number or QR, cash, bank transfer or card.
 * Less than what's due is kept as a part payment; the customer is thanked once it's fully paid.
 */
export async function recordPayment(
  id: string,
  input: { method: string; amount?: number | null; reference?: string; collectedBy?: string; tell?: boolean },
): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  if (o.status === "CANCELLED") return { ok: false, message: "This order is cancelled. Reopen it first." };
  if (dueOf(o) <= 0) return { ok: false, message: "This order is already paid." };
  if (!isPaymentMethod(input.method)) return { ok: false, message: "Choose how the customer paid." };
  const due = dueOf(o);
  const amount = input.amount == null || Number.isNaN(input.amount) ? due : Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { ok: false, message: "Enter the amount received." };
  if (amount > due + 0.5 && due > 0) return { ok: false, message: `That's more than the ${money(due, o.currency)} still due. Check the amount or edit the order total.` };
  const ref = input.reference?.trim().slice(0, 60) || null;
  await confirmPayment(o.id, ref, {
    method: input.method,
    source: "staff",
    amount,
    collectedBy: input.collectedBy?.trim() || null,
    quiet: input.tell === false,
  });
  const full = amount + 0.5 >= due;
  return done(
    full
      ? `Recorded ${money(amount, o.currency)} by ${methodLabel(input.method, true)}. ${orderRef(o)} is paid${input.tell === false ? "" : " and the customer was thanked"}.`
      : `Recorded ${money(amount, o.currency)} by ${methodLabel(input.method, true)}. ${money(due - amount, o.currency)} still due.`,
  );
}

/**
 * Sets how the customer will pay: cash on delivery, or back to online (UPI). For a new order, choosing
 * cash on delivery also confirms it and tells the customer the amount to keep ready.
 */
export async function setPaymentMethod(id: string, method: "cod" | "upi", opts: { confirm?: boolean } = {}): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  if (dueOf(o) <= 0) return { ok: false, message: "This order is already paid." };
  if (o.status === "CANCELLED") return { ok: false, message: "This order is cancelled." };
  await db.order.update({
    where: { id: o.id },
    data: {
      paymentMethod: method,
      internalNote: addNote(o.internalNote, method === "cod" ? `${stamp()}: cash on delivery` : `${stamp()}: switched to online payment`),
    },
  });
  pushOrderToSheet(o.id, "ORDER_UPDATE", method === "cod" ? "Cash on delivery" : "Online payment");
  if (method === "cod" && opts.confirm && o.status === "NEW") {
    const c = await notifyOrder(o.id, "confirm");
    return done(c.ok ? `Cash on delivery. ${c.message}` : `Set to cash on delivery, but the confirmation didn't go: ${c.message}`, c.ok);
  }
  return done(method === "cod" ? `${orderRef(o)} is cash on delivery: collect ${money(dueOf(o), o.currency)} when it's delivered.` : `${orderRef(o)} is back to online payment.`);
}

/** Cash on delivery handed over: records the cash (when collected) and marks it delivered with the usual thank-you. */
export async function deliverCod(id: string, input: { collected: boolean; amount?: number | null; collectedBy?: string }): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  if (o.status === "CANCELLED") return { ok: false, message: "This order is cancelled." };
  let cash = "";
  if (input.collected && dueOf(o) > 0) {
    const due = dueOf(o);
    const amount = input.amount != null && input.amount > 0 ? Math.min(input.amount, due) : due;
    await confirmPayment(o.id, null, { method: o.paymentMethod ?? "cod", source: "staff", amount, collectedBy: input.collectedBy?.trim() || null, quiet: true });
    cash = amount + 0.5 >= due ? `Cash ${money(amount, o.currency)} recorded. ` : `Part cash ${money(amount, o.currency)} recorded, ${money(due - amount, o.currency)} still due. `;
  } else if (!input.collected && dueOf(o) > 0) {
    await db.order.update({ where: { id: o.id }, data: { internalNote: addNote(o.internalNote, `${stamp()}: delivered, cash ${money(dueOf(o), o.currency)} not collected yet`) } });
    cash = "Cash still to collect. ";
  }
  if (o.status === "DELIVERED") return done(cash.trim() || "Already delivered.");
  const n = await notifyOrder(o.id, "deliver");
  return done(`${cash}${n.message}`, n.ok);
}

/** The customer said they paid: staff checked the bank / UPI app. Received → paid; not received → ask them for the reference. */
export async function verifyPaymentClaim(id: string, received: boolean): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  if (o.paidAt) return { ok: false, message: "This order is already paid." };
  if (received) {
    await confirmPayment(o.id, null, { method: o.paymentMethod ?? "upi", source: "verified" });
    return done(`Payment checked and recorded. ${o.customer.name} was thanked.`);
  }
  await db.order.update({
    where: { id: o.id },
    data: {
      paymentClaimedAt: null,
      paymentClaimNote: null,
      ...(o.paymentTxnId?.startsWith("UTR-") && { paymentTxnId: null }),
      internalNote: addNote(o.internalNote, `${stamp()}: customer said paid${o.paymentTxnId?.startsWith("UTR-") ? ` (${o.paymentTxnId})` : ""}, not found in account`),
    },
  });
  pushOrderToSheet(o.id, "ORDER_UPDATE", "Payment not found");
  const first = o.customer.name.trim().split(/\s+/)[0] || "there";
  const text = `Hello ${first}, we couldn't find your payment of ${money(dueOf(o), o.currency)} for order ${orderRef(o)} yet. Could you send the 12-digit UPI reference (UTR) or a screenshot of the payment? Thank you!`;
  const told = await textInWindow(o.customer, text, "Payment not found").catch(() => false);
  return done(told ? "Marked not received and asked the customer for the UPI reference." : "Marked not received. Their 24-hour window is closed, so call or message them.");
}

/** Money given back: a cancelled paid order, or part of one (a missing or damaged item). */
export async function recordRefund(id: string, input: { amount?: number | null; method?: string; note?: string; tell?: boolean }): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  const received = receivedOf(o);
  if (received <= 0) return { ok: false, message: "No payment was recorded for this order, so there is nothing to refund." };
  const already = o.refundAmount ?? 0;
  const left = Math.max(0, received - already);
  const amount = input.amount == null || Number.isNaN(input.amount) ? left : Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { ok: false, message: "Enter the amount refunded." };
  if (amount > left + 0.5) return { ok: false, message: `Only ${money(left, o.currency)} can be refunded on this order.` };
  const how = input.method && isPaymentMethod(input.method) ? methodLabel(input.method, true) : null;
  const line = `${stamp()}: refunded ${money(amount, o.currency)}${how ? ` by ${how}` : ""}${input.note?.trim() ? ` (${input.note.trim()})` : ""}`;
  await db.order.update({
    where: { id: o.id },
    data: {
      refundedAt: new Date(),
      refundAmount: Math.round((already + amount) * 100) / 100,
      refundNote: [o.refundNote, line].filter(Boolean).join("\n").slice(0, 500),
      internalNote: addNote(o.internalNote, line),
    },
  });
  pushOrderToSheet(o.id, "ORDER_UPDATE", "Refunded");
  let told = false;
  if (input.tell !== false) {
    const first = o.customer.name.trim().split(/\s+/)[0] || "there";
    const text = `Hello ${first}, we have refunded ${money(amount, o.currency)}${how ? ` by ${how}` : ""} for order ${orderRef(o)}. It may take a few days to show in your account. Reply here if you have any questions.`;
    told = await textInWindow(o.customer, text, "Refund").catch(() => false);
  }
  return done(`Refund of ${money(amount, o.currency)} recorded${told ? " and the customer was told" : ""}.`);
}

/** A payment recorded by mistake (wrong order, cash not actually taken). WhatsApp-confirmed payments can't be undone. */
export async function undoPayment(id: string): Promise<SendResult> {
  const r = await ownOrder(id);
  if (!r.order) return { ok: false, message: r.denied };
  const o = r.order;
  if (!o.paidAt && !(o.paidAmount && o.paidAmount > 0)) return { ok: false, message: "No payment is recorded on this order." };
  if (!canUndoPayment(o)) return { ok: false, message: "WhatsApp confirmed this payment, so it can't be undone here. Record a refund instead." };
  await db.order.update({
    where: { id: o.id },
    data: {
      paidAt: null,
      paidAmount: null,
      paymentSource: null,
      paymentTxnId: null,
      collectedBy: null,
      ...(o.status === "PAID" && { status: "CONFIRMED" as const }),
      internalNote: addNote(o.internalNote, `${stamp()}: payment of ${money(receivedOf(o), o.currency)} undone`),
    },
  });
  pushOrderToSheet(o.id, "ORDER_UPDATE", "Payment undone");
  return done(`Payment removed from ${orderRef(o)}. It shows as not paid again.`);
}
