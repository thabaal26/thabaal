// Loyalty points: how they're earned, what they're worth, and that offers never promise more than the balance.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyManualLoyaltyDelta, computeCustomerLoyalty, loyaltyFromOrders } from "../../src/lib/loyalty";
import { getOrderPricing, pointsDiscount } from "../../src/lib/order-pricing";

const base = { name: "Meena R", brandName: "Test Shop" };

describe("loyalty points", () => {
  test("1 point per ₹100 spent, +50 for each repeat order, 100 points = ₹50", () => {
    const l = computeCustomerLoyalty({ ...base, paidOrdersCount: 3, totalSpent: 1250 });
    assert.equal(l.spendPoints, 12); // ₹1,250 ÷ 100, rounded down
    assert.equal(l.frequencyPoints, 100); // 2nd and 3rd orders
    assert.equal(l.totalPoints, 112);
    assert.equal(l.rewardRupees, 56); // 112 × ₹0.50
    assert.equal(l.redeemableRupees, 50); // in ₹25 steps
    assert.equal(computeCustomerLoyalty({ ...base, paidOrdersCount: 1, totalSpent: 99 }).spendPoints, 0);
  });

  test("old order-sheet items earn 35 points each; manual changes add or take away", () => {
    const l = computeCustomerLoyalty({ ...base, paidOrdersCount: 0, totalSpent: 0, sheetPurchases: "Coconut oil, Gingelly oil", tags: ["loyalty-bonus:-20"] });
    assert.equal(l.sheetPoints, 70);
    assert.equal(l.manualPoints, -20);
    assert.equal(l.totalPoints, 50);
  });

  test("a customer with no points is offered no discount and no made-up points", () => {
    const l = computeCustomerLoyalty({ ...base, paidOrdersCount: 0, totalSpent: 0, unpaidCartValue: 750 });
    assert.equal(l.totalPoints, 0);
    assert.equal(l.redeemableRupees, 0);
    assert.doesNotMatch(l.whatsappOfferCopy, /loyalty points|₹\d+ off|discount/);
    assert.match(l.whatsappOfferCopy, /₹750/);
  });

  test("offers never promise free delivery, double points or free samples", () => {
    const cases = [
      { paidOrdersCount: 5, totalSpent: 4000, daysSinceLastOrder: 3 },
      { paidOrdersCount: 4, totalSpent: 3000, daysSinceLastOrder: 120 },
      { paidOrdersCount: 2, totalSpent: 900, daysSinceLastOrder: 40 },
      { paidOrdersCount: 0, totalSpent: 0 },
      { paidOrdersCount: 1, totalSpent: 300, droppedProduct: "Moringa oil" },
    ];
    for (const c of cases) {
      const l = computeCustomerLoyalty({ ...base, ...c });
      assert.doesNotMatch(l.whatsappOfferCopy, /free (doorstep )?delivery|2×|double|sample|trial pack|priority/i, l.whatsappOfferCopy);
      if (l.redeemableRupees > 0) assert.ok(l.redeemableRupees <= l.rewardRupees);
    }
  });

  test("points used on orders come off the balance; a cancelled order gives them back", () => {
    const orders = [
      { id: "a", total: 3000, status: "DELIVERED", paidAt: new Date(), pointsRedeemed: 0 },
      { id: "b", total: 2000, status: "CONFIRMED", paidAt: null, pointsRedeemed: 0 },
      { id: "c", total: 640, status: "NEW", paidAt: null, pointsRedeemed: 100 },
      { id: "d", total: 500, status: "CANCELLED", paidAt: null, pointsRedeemed: 50 },
    ];
    // Bought: a + b = ₹5,000 → 50 points + 50 repeat bonus = 100; minus 100 used on c (d was cancelled).
    const l = loyaltyFromOrders({ name: "Meena R", orders });
    assert.equal(l.totalPoints, 0);
    // Re-pricing order c leaves its own 100 points out.
    assert.equal(loyaltyFromOrders({ name: "Meena R", orders }, { exceptOrderId: "c" }).totalPoints, 100);
    assert.equal(loyaltyFromOrders({ name: "Meena R", orders }, { exceptOrderId: "c" }).redeemableRupees, 50);
  });

  test("an order's total, shipping and points discount read back correctly", () => {
    const items = [{ price: 690, quantity: 1 }];
    // ₹690 items + ₹60 shipping − ₹50 points = ₹700 stored.
    const p = getOrderPricing(items, 700, { applyDefaultWhenEqual: true, discount: pointsDiscount({ pointsRedeemed: 100 }) });
    assert.deepEqual(p, { subtotal: 690, shipping: 60, discount: 50, total: 700 });
    // Without the discount the same stored total would read as ₹10 shipping: why every caller passes it.
    assert.equal(getOrderPricing(items, 700).shipping, 10);
    // A new order priced with a discount.
    assert.equal(getOrderPricing(items, null, { customShippingFee: 60, discount: 25 }).total, 725);
  });

  test("a stored order with free delivery reads back at its stored total (no ₹60 added)", () => {
    const items = [{ price: 690, quantity: 1 }];
    // Saved from Edit items with the shipping charge set to ₹0: stored total = items.
    const p = getOrderPricing(items, 690, { applyDefaultWhenEqual: true });
    assert.deepEqual(p, { subtotal: 690, shipping: 0, discount: 0, total: 690 });
    // The amount asked for and the amount payments are checked against are the same number.
    assert.equal(p.total, 690);
  });

  test("the vip tag is added once a customer reaches 250 points", () => {
    assert.deepEqual(applyManualLoyaltyDelta(["regular"], 100, 260), ["regular", "loyalty-bonus:100", "vip"]);
    assert.deepEqual(applyManualLoyaltyDelta(["regular"], 100, 200), ["regular", "loyalty-bonus:100"]);
  });
});
