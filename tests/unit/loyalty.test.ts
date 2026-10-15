// Loyalty points: how they're earned, what they're worth, and that offers never promise more than the balance.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyManualLoyaltyDelta, computeCustomerLoyalty } from "../../src/lib/loyalty";

const base = { name: "Meena R", brandName: "Test Shop" };

describe("loyalty points", () => {
  test("1 point per ₹10 spent, +50 for each repeat order, 100 points = ₹50", () => {
    const l = computeCustomerLoyalty({ ...base, paidOrdersCount: 3, totalSpent: 1250 });
    assert.equal(l.spendPoints, 125);
    assert.equal(l.frequencyPoints, 100); // 2nd and 3rd orders
    assert.equal(l.totalPoints, 225);
    assert.equal(l.rewardRupees, 113); // 225 × ₹0.50, rounded
    assert.equal(l.redeemableRupees, 100); // in ₹25 steps
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

  test("the vip tag is added once a customer reaches 250 points", () => {
    assert.deepEqual(applyManualLoyaltyDelta(["regular"], 100, 260), ["regular", "loyalty-bonus:100", "vip"]);
    assert.deepEqual(applyManualLoyaltyDelta(["regular"], 100, 200), ["regular", "loyalty-bonus:100"]);
  });
});
