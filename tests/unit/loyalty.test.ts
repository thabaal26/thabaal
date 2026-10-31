// Loyalty points: how they're earned, what they're worth, and that offers never promise more than the balance.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyManualLoyaltyDelta, computeCustomerLoyalty, DEFAULT_LOYALTY_RULES, loyaltyFromOrders, loyaltyRules, pointsForOrder } from "../../src/lib/loyalty";
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
      { id: "a", total: 3000, status: "DELIVERED", paidAt: new Date(), paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
      { id: "b", total: 2000, status: "CONFIRMED", paidAt: null, paymentMethod: "cod", internalNote: null, pointsRedeemed: 0 },
      { id: "c", total: 640, status: "NEW", paidAt: null, paymentMethod: null, internalNote: null, pointsRedeemed: 100 },
      { id: "d", total: 500, status: "CANCELLED", paidAt: null, paymentMethod: null, internalNote: null, pointsRedeemed: 50 },
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

  test("each shop's own rules: a different rate and bonus, or either one turned off", () => {
    const orders = [
      { id: "a", total: 1000, status: "DELIVERED", paidAt: new Date(), paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
      { id: "b", total: 500, status: "DELIVERED", paidAt: new Date(), paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
      { id: "c", total: 900, status: "NEW", paidAt: null, paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
    ];
    const c = { name: "Meena R", orders };
    // Defaults: ₹1,500 → 15 + 50 repeat bonus.
    assert.equal(loyaltyFromOrders(c).totalPoints, 65);
    assert.equal(loyaltyFromOrders(c, { rules: DEFAULT_LOYALTY_RULES }).totalPoints, 65);
    // 1 point per ₹50 and +20 per repeat order.
    const custom = { earnOn: true, rupeesPerPoint: 50, repeatOn: true, repeatBonus: 20 };
    assert.equal(loyaltyFromOrders(c, { rules: custom }).totalPoints, 50);
    // Repeat bonus off: spend points only. Spend off: bonus only. Both off: nothing new.
    assert.equal(loyaltyFromOrders(c, { rules: { ...custom, repeatOn: false } }).totalPoints, 30);
    assert.equal(loyaltyFromOrders(c, { rules: { ...custom, earnOn: false } }).totalPoints, 20);
    const none = loyaltyFromOrders({ ...c, tags: ["loyalty-bonus:100"] }, { rules: { ...custom, earnOn: false, repeatOn: false } });
    assert.equal(none.totalPoints, 100); // hand-given points stay
    assert.equal(none.redeemableRupees, 50); // and are worth the same
  });

  test("checkout uses the shop's rules for what a customer can take off", () => {
    const orders = [
      { id: "a", total: 4000, status: "DELIVERED", paidAt: new Date(), paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
      { id: "new", total: 800, status: "NEW", paidAt: null, paymentMethod: null, internalNote: null, pointsRedeemed: 0 },
    ];
    const c = { name: "Meena R", orders };
    assert.equal(loyaltyFromOrders(c, { exceptOrderId: "new" }).redeemableRupees, 0); // 40 points: below 50
    assert.equal(loyaltyFromOrders(c, { exceptOrderId: "new", rules: { ...DEFAULT_LOYALTY_RULES, rupeesPerPoint: 20 } }).redeemableRupees, 100); // 200 points
    assert.equal(loyaltyFromOrders(c, { exceptOrderId: "new", rules: { ...DEFAULT_LOYALTY_RULES, rupeesPerPoint: 1 } }).redeemableRupees, 250); // capped
  });

  test("rules read from the database fall back to the defaults when missing or out of range", () => {
    assert.deepEqual(loyaltyRules(null), DEFAULT_LOYALTY_RULES);
    assert.deepEqual(loyaltyRules({ loyaltyEarnOn: false, loyaltyRupeesPerPoint: 0, loyaltyRepeatOn: true, loyaltyRepeatBonus: 2.5 }), {
      earnOn: false,
      rupeesPerPoint: 100,
      repeatOn: true,
      repeatBonus: 50,
    });
    assert.equal(pointsForOrder(1250, 1), 12);
    assert.equal(pointsForOrder(1250, 2), 62);
    assert.equal(pointsForOrder(1250, 2, { earnOn: false, rupeesPerPoint: 100, repeatOn: true, repeatBonus: 30 }), 30);
  });

  test("the first-order invite only mentions rules that are on", () => {
    const off = computeCustomerLoyalty({ ...base, paidOrdersCount: 0, totalSpent: 0, rules: { ...DEFAULT_LOYALTY_RULES, earnOn: false, repeatOn: false } });
    assert.doesNotMatch(off.whatsappOfferCopy, /point/);
    const on = computeCustomerLoyalty({ ...base, paidOrdersCount: 0, totalSpent: 0, rules: { ...DEFAULT_LOYALTY_RULES, rupeesPerPoint: 200, repeatOn: false } });
    assert.match(on.whatsappOfferCopy, /1 point for every ₹200/);
    assert.doesNotMatch(on.whatsappOfferCopy, /repeat/);
  });
});
