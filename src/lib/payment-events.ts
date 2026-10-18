import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

/** A bank UPI reference (UTR / RRN) is 12 digits. */
export const UTR_ONLY = /^\d{12}$/;

/** The UTR inside a reference someone typed ("UTR-412345678901", "412345678901"), or null. */
export function utrOf(ref: string | null | undefined): string | null {
  const m = (ref ?? "").replace(/\s+/g, "").match(/^(?:UTR-|DUP-)?(\d{12})$/i);
  return m ? m[1] : null;
}

/**
 * The bank reference in a Meta payment message, if Meta sent one. Meta's UPI mode doesn't document one; payment
 * gateway setups may include it under names like utr, rrn or bank_reference, so look for those keys anywhere.
 */
export function findUtr(raw: unknown, depth = 0): string | null {
  if (!raw || typeof raw !== "object" || depth > 5) return null;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^(utr|rrn|upi_?utr|bank_?ref(erence)?(_?(id|number))?|upi_?transaction_?id|bank_?transaction_?id|npci_?txn_?id)$/i.test(k)) {
      const s = String(v ?? "").trim();
      if (UTR_ONLY.test(s)) return s;
    }
    if (v && typeof v === "object") {
      const inner = findUtr(v, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

export type PaymentEventInput = {
  clientId?: string | null;
  orderId?: string | null;
  /** meta_status (payment update), meta_bubble (UPI bubble in chat), customer_text, screenshot, staff. */
  source: string;
  /** paid, failed, pending, claimed, recorded, reference_added. */
  status: string;
  transactionId?: string | null;
  utr?: string | null;
  amount?: number | null;
  currency?: string | null;
  note?: string | null;
  raw?: unknown;
};

/** Keeps a payment message for the order's history. Never throws: a payment is never lost because logging failed. */
export async function logPaymentEvent(e: PaymentEventInput) {
  try {
    let clientId = e.clientId ?? null;
    if (!clientId && e.orderId) clientId = (await db.order.findUnique({ where: { id: e.orderId }, select: { clientId: true } }))?.clientId ?? null;
    await db.paymentEvent.create({
      data: {
        clientId,
        orderId: e.orderId ?? null,
        source: e.source.slice(0, 40),
        status: e.status.slice(0, 40),
        transactionId: e.transactionId?.slice(0, 120) ?? null,
        utr: e.utr ?? null,
        amount: e.amount ?? null,
        currency: e.currency?.slice(0, 8) ?? null,
        note: e.note?.slice(0, 500) ?? null,
        raw: e.raw === undefined ? undefined : (JSON.parse(JSON.stringify(e.raw)) as Prisma.InputJsonValue),
      },
    });
  } catch (err) {
    console.warn("Could not log the payment event", err instanceof Error ? err.message : err);
  }
}

/** An order's payment history, newest first. */
export function paymentEventsFor(orderId: string) {
  return db.paymentEvent
    .findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, source: true, status: true, transactionId: true, utr: true, amount: true, currency: true, note: true, createdAt: true },
    })
    .catch(() => []);
}
