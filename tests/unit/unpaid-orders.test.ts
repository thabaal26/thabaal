// Home's "Unpaid carts" tile and Orders' "Not paid yet" list (?show=unpaid) count with one rule, isUnpaidOrder
// (lib/order-flow.ts), so the tile's number is the list's length: not cancelled, not paid, not cash on delivery,
// whatever step the order is at and whenever it came.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isUnpaidOrder } from "../../src/lib/order-flow";

const o = (status: string, extra: { paidAt?: Date | null; paymentMethod?: string | null; internalNote?: string | null } = {}) => ({
  status,
  paidAt: null,
  paymentMethod: null,
  internalNote: null,
  ...extra,
});

describe("unpaid orders: one rule for Home's tile and Orders' list", () => {
  test("1. waiting for money at any step counts; paid, cash on delivery and cancelled don't", () => {
    const cases: [ReturnType<typeof o>, boolean, string][] = [
      [o("NEW"), true, "new, no payment yet"],
      [o("CONFIRMED"), true, "confirmed without payment (an older order)"],
      [o("DISPATCHED"), true, "sent out, still unpaid (not COD)"],
      [o("NEW", { paymentMethod: "cod" }), false, "new, cash on delivery chosen"],
      [o("CONFIRMED", { paymentMethod: "cod" }), false, "COD confirmed"],
      [o("CONFIRMED", { internalNote: "Cash on delivery" }), false, "older COD order known from its note"],
      [o("PAID"), false, "marked paid"],
      [o("NEW", { paidAt: new Date() }), false, "payment recorded"],
      [o("CANCELLED"), false, "cancelled"],
    ];
    for (const [order, want, what] of cases) assert.equal(isUnpaidOrder(order), want, what);
  });
});
