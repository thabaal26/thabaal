import "server-only";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { getOrderPricing, pointsDiscount } from "./order-pricing";
import { orderRef, type OrderItem } from "./orders";
import { dueOf, methodOf, paymentState, receivedOf, type PayState } from "./payment-state";

/*
 * Payments page (portal design): money to collect, money received, cash on delivery and every
 * payment event, all from the client's own orders. Pure reads; the buttons use the existing
 * order and payment actions.
 */

const DAY = 86_400_000;

/** Midnight today in the app's time zone. */
export function dayStart(d = new Date()) {
  return fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
}

/** How the money came in, as the design groups it. */
export type Way = "wa" | "upi" | "cash" | "bank";
export const WAY_LABEL: Record<Way, string> = { wa: "WhatsApp pay", upi: "UPI", cash: "Cash", bank: "Bank / card / other" };
export const WAY_LABEL_TA: Record<Way, string> = { wa: "WhatsApp", upi: "UPI", cash: "ரொக்கம்", bank: "வங்கி / கார்டு" };
export const WAY_COLOR: Record<Way, string> = { wa: "var(--bar)", upi: "var(--bar2)", cash: "var(--bar3)", bank: "var(--bar4)" };

export function wayOf(method: string | null, source?: string | null): Way {
  if (method === "upi_whatsapp" || (!method && source === "meta")) return "wa";
  if (method === "upi") return "upi";
  if (method === "cod" || method === "cash") return "cash";
  if (!method) return "upi";
  return "bank";
}

/** One order still owed money. Dates are epoch ms so the list can go to the browser. */
export type CollectRow = {
  id: string;
  ref: string;
  customerId: string;
  name: string;
  due: number;
  total: number;
  state: PayState;
  status: string;
  cod: boolean;
  waitingSinceMs: number;
  requested: boolean;
  late: boolean;
  canRequest: boolean;
};

export type ReceivedRow = { id: string; ref: string; customerId: string; name: string; amount: number; way: Way; atMs: number; collectedBy: string | null; reference: string | null };

export type TxnRow = { key: string; ref: string; name: string; kind: "in" | "refund" | "fail"; way: string; amount: number; atMs: number; status: string; reference?: string | null };

export type CashDayRow = { by: string; orders: number; amount: number };

export async function paymentsData(clientId: string, period: "t" | "w" | "m") {
  const now = new Date();
  const today = dayStart(now);
  const from = period === "t" ? today : period === "w" ? new Date(today.getTime() - 6 * DAY) : new Date(today.getTime() - 29 * DAY);
  const ninety = new Date(today.getTime() - 89 * DAY);

  const paySelect = {
    id: true,
    number: true,
    ref: true,
    status: true,
    total: true,
    items: true,
    pointsRedeemed: true,
    paidAt: true,
    paidAmount: true,
    paymentMethod: true,
    paymentSource: true,
    paymentTxnId: true,
    paymentRequestedAt: true,
    paymentClaimedAt: true,
    paymentFailedAt: true,
    paymentFailReason: true,
    refundedAt: true,
    refundAmount: true,
    collectedBy: true,
    internalNote: true,
    createdAt: true,
    customerId: true,
    customer: { select: { name: true } },
  } as const;

  const [open, paid, events, client] = await Promise.all([
    // Owed: not cancelled, money not (fully) in, from the last 60 days.
    db.order.findMany({
      where: { clientId, status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"] }, paidAt: null, createdAt: { gte: new Date(now.getTime() - 60 * DAY) } },
      select: paySelect,
      orderBy: { createdAt: "asc" },
    }),
    // Received in the period (the paid date).
    db.order.findMany({ where: { clientId, paidAt: { gte: from } }, select: paySelect, orderBy: { paidAt: "desc" } }),
    // Every payment event in the last 90 days, for All transactions and today's cash.
    db.order.findMany({
      where: { clientId, OR: [{ paidAt: { gte: ninety } }, { refundedAt: { gte: ninety } }, { paymentFailedAt: { gte: ninety } }] },
      select: paySelect,
      orderBy: { updatedAt: "desc" },
      take: 600,
    }),
    db.client.findUnique({ where: { id: clientId }, select: { paymentConfig: true } }),
  ]);

  const shown = (o: { items: unknown; total: number; pointsRedeemed?: number | null }) =>
    getOrderPricing(o.items as OrderItem[], o.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(o) }).total;

  const collect: CollectRow[] = open
    .map((o) => {
      const state = paymentState(o);
      const cod = methodOf(o) === "cod";
      const since = o.paymentRequestedAt ?? o.createdAt;
      return {
        id: o.id,
        ref: orderRef(o),
        customerId: o.customerId,
        name: o.customer.name,
        due: dueOf(o),
        total: shown(o),
        state,
        status: o.status,
        cod,
        waitingSinceMs: since.getTime(),
        requested: Boolean(o.paymentRequestedAt),
        // A request older than a day with no money, or a failed payment, is late.
        late: state === "failed" || (state === "requested" && now.getTime() - since.getTime() > DAY),
        canRequest: Boolean(client?.paymentConfig) && !cod && o.total > 0,
      };
    })
    .filter((r) => r.due > 0);

  const received: ReceivedRow[] = paid.map((o) => ({
    id: o.id,
    ref: orderRef(o),
    customerId: o.customerId,
    name: o.customer.name,
    amount: receivedOf(o),
    way: wayOf(methodOf(o), o.paymentSource),
    atMs: (o.paidAt ?? o.createdAt).getTime(),
    collectedBy: o.collectedBy,
    reference: o.paymentTxnId,
  }));

  const txns: TxnRow[] = [];
  for (const o of events) {
    const name = o.customer.name;
    const ref = orderRef(o);
    if (o.paidAt && o.paidAt >= ninety)
      txns.push({ key: `${o.id}-in`, ref, name, kind: "in", way: WAY_LABEL[wayOf(methodOf(o), o.paymentSource)], amount: receivedOf(o), atMs: o.paidAt.getTime(), status: "Received", reference: o.paymentTxnId });
    if (o.refundedAt && o.refundedAt >= ninety)
      txns.push({ key: `${o.id}-refund`, ref, name, kind: "refund", way: "Refund", amount: o.refundAmount ?? receivedOf(o), atMs: o.refundedAt.getTime(), status: "Refunded", reference: o.paymentTxnId });
    if (o.paymentFailedAt && o.paymentFailedAt >= ninety)
      txns.push({ key: `${o.id}-fail`, ref, name, kind: "fail", way: "WhatsApp pay", amount: shown(o), atMs: o.paymentFailedAt.getTime(), status: o.paymentFailReason ?? "Failed", reference: o.paymentTxnId });
  }
  txns.sort((a, b) => b.atMs - a.atMs);

  // Today's cash, by who collected it (the day close).
  const cashToday = new Map<string, CashDayRow>();
  for (const o of events) {
    if (!o.paidAt || o.paidAt < today || wayOf(methodOf(o), o.paymentSource) !== "cash") continue;
    const by = o.collectedBy?.trim() || "Not noted";
    const row = cashToday.get(by) ?? { by, orders: 0, amount: 0 };
    row.orders += 1;
    row.amount += receivedOf(o);
    cashToday.set(by, row);
  }

  const receivedToday = events.filter((o) => o.paidAt && o.paidAt >= today).reduce((n, o) => n + receivedOf(o), 0);

  return {
    collect,
    received,
    txns,
    cashDay: [...cashToday.values()].sort((a, b) => b.amount - a.amount),
    receivedToday,
    hasPaymentConfig: Boolean(client?.paymentConfig),
  };
}

export type PaymentsData = Awaited<ReturnType<typeof paymentsData>>;
