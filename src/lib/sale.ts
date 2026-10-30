import type { Prisma } from "@prisma/client";
import { COD_NOTE_RE } from "./payment-state";

/*
 * What counts as a sale, in one place (Home, Reports, Customers, loyalty points, filters, admin).
 * A sale is an order whose money is in, or a cash-on-delivery order that was confirmed, or an order that has
 * gone out (dispatched or delivered). It is the same point the order steps call "Order confirmed"
 * (lib/order-flow.ts): an online order is only confirmed once its payment is verified, so an order marked
 * CONFIRMED with no payment and no COD (an older order, or one whose payment was undone) is not a sale.
 * Owner's decision, 30 Oct 2026 (DEC-01 in docs/qa/BUG_REPORT.md).
 */

export type SaleFields = { status: string; paidAt: Date | null; paymentMethod: string | null; internalNote: string | null };

const isCod = (o: SaleFields) => (o.paymentMethod ? o.paymentMethod === "cod" : COD_NOTE_RE.test(o.internalNote ?? ""));

export function isSale(o: SaleFields): boolean {
  if (o.paidAt) return true;
  if (o.status === "PAID" || o.status === "DISPATCHED" || o.status === "DELIVERED") return true;
  return o.status === "CONFIRMED" && isCod(o);
}

/** Still an open cart: not a sale, not cancelled, money not in. */
export const isOpenCart = (o: SaleFields) => (o.status === "NEW" || o.status === "CONFIRMED") && !o.paidAt && !isSale(o);

/** The same rule for raw SQL on an Order alias (e.g. `o`). Postgres \m…\M are word boundaries, like \b in COD_NOTE_RE. */
export const saleSqlText = (a = "o") =>
  `(${a}."paidAt" IS NOT NULL OR ${a}.status IN ('PAID','DISPATCHED','DELIVERED') OR (${a}.status = 'CONFIRMED' AND (${a}."paymentMethod" = 'cod' OR (${a}."paymentMethod" IS NULL AND ${a}."internalNote" ~* '\\m(cod|cash\\s+on\\s+delivery)\\M'))))`;

/**
 * The same rule as a Prisma filter. Prisma can't match a word, so older orders with only a "COD" note are found
 * by the note containing "cod" or "cash on delivery" (close enough for counts; the code rule above is exact).
 */
export const SALE_WHERE: Prisma.OrderWhereInput = {
  OR: [
    { paidAt: { not: null } },
    { status: { in: ["PAID", "DISPATCHED", "DELIVERED"] } },
    { status: "CONFIRMED", paymentMethod: "cod" },
    { status: "CONFIRMED", paymentMethod: null, internalNote: { contains: "cod", mode: "insensitive" } },
    { status: "CONFIRMED", paymentMethod: null, internalNote: { contains: "cash on delivery", mode: "insensitive" } },
  ],
};
