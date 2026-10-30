import { test } from "node:test";
import assert from "node:assert/strict";
import { isOpenCart, isSale } from "../../src/lib/sale";
import { isBoughtOrder } from "../../src/lib/loyalty";

// One rule for "sale" everywhere (owner's decision, 30 Oct 2026): paid, or COD confirmed, or gone out.
const o = (status: string, extra: Partial<{ paidAt: Date | null; paymentMethod: string | null; internalNote: string | null }> = {}) => ({
  status,
  paidAt: null,
  paymentMethod: null,
  internalNote: null,
  ...extra,
});

test("paid orders are sales, whatever the status", () => {
  assert.equal(isSale(o("CONFIRMED", { paidAt: new Date() })), true);
  assert.equal(isSale(o("PAID")), true);
  assert.equal(isSale(o("NEW", { paidAt: new Date() })), true);
});

test("a confirmed cash-on-delivery order is a sale and not an open cart", () => {
  const cod = o("CONFIRMED", { paymentMethod: "cod" });
  assert.equal(isSale(cod), true);
  assert.equal(isOpenCart(cod), false);
  // Older orders with only a team note saying COD count too.
  assert.equal(isSale(o("CONFIRMED", { internalNote: "Customer wants COD" })), true);
  assert.equal(isSale(o("CONFIRMED", { internalNote: "promo code FEST10" })), false);
});

test("confirmed but unpaid online orders are not sales (an old order, or a payment undone)", () => {
  const upi = o("CONFIRMED", { paymentMethod: "upi" });
  assert.equal(isSale(upi), false);
  assert.equal(isOpenCart(upi), true);
  assert.equal(isBoughtOrder(upi), false, "earns no loyalty points");
});

test("dispatched and delivered orders are sales; new and cancelled are not", () => {
  assert.equal(isSale(o("DISPATCHED", { paymentMethod: "cod" })), true);
  assert.equal(isSale(o("DELIVERED")), true);
  assert.equal(isSale(o("NEW")), false);
  assert.equal(isOpenCart(o("NEW")), true);
  assert.equal(isSale(o("CANCELLED")), false);
  assert.equal(isOpenCart(o("CANCELLED")), false);
});
