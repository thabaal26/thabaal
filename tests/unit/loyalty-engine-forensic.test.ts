import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  computeCustomerLoyalty,
  loyaltyRules,
  pointsForOrder,
  parseManualLoyaltyPoints,
  applyManualLoyaltyDelta,
  DEFAULT_LOYALTY_RULES,
  loyaltyFromOrders,
} from "../../src/lib/loyalty";
import { isSale } from "../../src/lib/sale";
import { keptPointsDiscount, REDEEM_STEP } from "../../src/lib/loyalty-redeem";
import { analyzeCartMentality } from "../../src/lib/cart-mentality";

describe("Domain 5B: Loyalty, RFM & Cart Mentality Forensic Audit Suite", () => {
  test("1. Base Earning & Repeat Order Bonus Calculation", () => {
    // Default rules: 1 pt per ₹100, +50 repeat bonus
    assert.equal(pointsForOrder(550, 1, DEFAULT_LOYALTY_RULES), 5); // 1st order: 5 pts, 0 repeat bonus
    assert.equal(pointsForOrder(550, 2, DEFAULT_LOYALTY_RULES), 55); // 2nd order: 5 pts + 50 repeat bonus
    assert.equal(pointsForOrder(1200, 3, DEFAULT_LOYALTY_RULES), 62); // 3rd order: 12 pts + 50 repeat bonus

    // Custom tenant rules: 1 pt per ₹50, +25 repeat bonus
    const customRules = loyaltyRules({ loyaltyEarnOn: true, loyaltyRupeesPerPoint: 50, loyaltyRepeatOn: true, loyaltyRepeatBonus: 25 });
    assert.equal(pointsForOrder(550, 1, customRules), 11);
    assert.equal(pointsForOrder(550, 2, customRules), 36);

    // Earning turned off
    const noEarn = loyaltyRules({ loyaltyEarnOn: false, loyaltyRepeatOn: false });
    assert.equal(pointsForOrder(1000, 2, noEarn), 0);
  });

  test("2. Historical Sheet Purchases Bonus (+35 pts per item)", () => {
    const l1 = computeCustomerLoyalty({
      name: "Suresh",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: "Gingelly Oil 1L, Groundnut Oil 500ml",
    });
    // 2 sheet items = 70 points
    assert.equal(l1.sheetPoints, 70);
    assert.equal(l1.totalPoints, 70);
    // Empirical Discovery: sheetItemsCount >= 1 automatically qualifies customer as 'silver' (Silver Member)
    assert.equal(l1.tier, "silver");
  });

  test("3. Manual Loyalty Adjustments via Tags & VIP Threshold", () => {
    assert.equal(parseManualLoyaltyPoints(["vip", "loyal", "loyalty-bonus:120"]), 120);
    assert.equal(parseManualLoyaltyPoints(["loyalty-bonus:-50"]), -50);
    assert.equal(parseManualLoyaltyPoints(["regular"]), 0);

    // Apply delta: +150
    const t1 = applyManualLoyaltyDelta(["regular"], 150, 150);
    assert.ok(t1.includes("loyalty-bonus:150"));
    assert.ok(!t1.includes("vip")); // < 250 points

    // Apply delta crossing 250 threshold -> adds 'vip' tag
    const t2 = applyManualLoyaltyDelta(["regular", "loyalty-bonus:150"], 120, 270);
    assert.ok(t2.includes("loyalty-bonus:270"));
    assert.ok(t2.includes("vip"));
  });

  test("4. Point Redemption Formula & ₹25 Step Enforcements", () => {
    // 40 points = ₹20 value -> below 50 pt threshold -> 0 redeemable
    const l1 = computeCustomerLoyalty({ name: "A", paidOrdersCount: 1, totalSpent: 4000 }); // 40 pts
    assert.equal(l1.totalPoints, 40);
    assert.equal(l1.rewardRupees, 20);
    assert.equal(l1.redeemableRupees, 0);

    // 100 points = ₹50 value -> exactly ₹50 redeemable (in ₹25 steps)
    const l2 = computeCustomerLoyalty({ name: "B", paidOrdersCount: 1, totalSpent: 10000 }); // 100 pts
    assert.equal(l2.totalPoints, 100);
    assert.equal(l2.rewardRupees, 50);
    assert.equal(l2.redeemableRupees, 50);

    // 250 points = ₹125 value -> exactly ₹125 redeemable
    const l3 = computeCustomerLoyalty({ name: "C", paidOrdersCount: 1, totalSpent: 25000 }); // 250 pts
    assert.equal(l3.rewardRupees, 125);
    assert.equal(l3.redeemableRupees, 125);

    // 600 points = ₹300 value -> capped at ₹250 max redeemable per order
    const l4 = computeCustomerLoyalty({ name: "D", paidOrdersCount: 1, totalSpent: 60000 }); // 600 pts
    assert.equal(l4.rewardRupees, 300);
    assert.equal(l4.redeemableRupees, 250); // Capped at ₹250
  });

  test("5. Tier Progression Boundaries (Bronze, Silver, Gold, Platinum)", () => {
    // Bronze: < 100 points, 0 orders
    const b = computeCustomerLoyalty({ name: "B", paidOrdersCount: 0, totalSpent: 0 });
    assert.equal(b.tier, "bronze");
    assert.equal(b.pointsToNextTier, 100);

    // Silver: 100+ points or 1 paid order
    const s1 = computeCustomerLoyalty({ name: "S1", paidOrdersCount: 1, totalSpent: 500 });
    assert.equal(s1.tier, "silver");
    assert.equal(s1.pointsToNextTier, 245); // 250 - 5

    // Gold: 250+ points or 2+ paid orders or ₹1500+ spend
    const g1 = computeCustomerLoyalty({ name: "G1", paidOrdersCount: 2, totalSpent: 1000 });
    assert.equal(g1.tier, "gold");

    // Platinum: 500+ points or 4+ paid orders or ₹3000+ spend
    const p1 = computeCustomerLoyalty({ name: "P1", paidOrdersCount: 4, totalSpent: 2000 });
    assert.equal(p1.tier, "platinum");
    assert.equal(p1.pointsToNextTier, 0);
  });

  test("6. RFM (Recency, Frequency, Monetary) Scoring & Segmentation", () => {
    // Champion: R>=4, F>=4, M>=4
    const champ = computeCustomerLoyalty({
      name: "Champ",
      paidOrdersCount: 5, // F=5
      totalSpent: 3500, // M=5
      daysSinceLastOrder: 10, // R=5
    });
    assert.equal(champ.rScore, 5);
    assert.equal(champ.fScore, 5);
    assert.equal(champ.mScore, 5);
    assert.equal(champ.rfmCode, "5-5-5");
    assert.equal(champ.rfmRatioPct, 100);
    assert.equal(champ.rfmSegment, "Champion (5·5·5)");

    // At Risk Big Spender: High M/F, Low R
    const atRisk = computeCustomerLoyalty({
      name: "Risk",
      paidOrdersCount: 4, // F=5
      totalSpent: 3000, // M=5
      daysSinceLastOrder: 120, // R=1
    });
    assert.equal(atRisk.rScore, 1);
    assert.equal(atRisk.rfmSegment, "Big Spender · At Risk");
  });

  test("7. Finding LOY-01 Demonstration: Order Cancellation & Paid Status Invariant", () => {
    // A normal paid order qualifies as a sale
    const paidOrder = { status: "PAID", paidAt: new Date(), paymentMethod: "upi_whatsapp", internalNote: null };
    assert.equal(isSale(paidOrder), true);

    // Finding LOY-01 Resolution: An order that was marked PAID, but subsequently cancelled:
    // With LOY-01 remediation, isSale strictly returns false for CANCELLED orders even if paidAt is set.
    const cancelledPaidOrder = { status: "CANCELLED", paidAt: new Date(), paymentMethod: "upi_whatsapp", internalNote: null };
    const saleResult = isSale(cancelledPaidOrder);
    assert.equal(saleResult, false, "LOY-01 Fixed: isSale returns false for CANCELLED orders even if paidAt is set");
  });

  test("8. Cart Mentality Downsizing & Swapping Behavior", () => {
    const currentCart = {
      id: "ord_2",
      number: 1002,
      ref: "TH-1002",
      total: 350,
      currency: "INR",
      status: "NEW",
      items: [{ id: "gingelly_500ml", name: "Gingelly Oil 500ml", quantity: 1, price: 350, currency: "INR" }],
      internalNote: null,
      createdAt: new Date(),
      paidAt: null,
    };

    const previousCart = {
      id: "ord_1",
      number: 1001,
      ref: "TH-1001",
      total: 650,
      currency: "INR",
      status: "CANCELLED",
      items: [{ id: "gingelly_1L", name: "Gingelly Oil 1L", quantity: 1, price: 650, currency: "INR" }],
      internalNote: "Replaced by TH-1002",
      createdAt: new Date(Date.now() - 3600_000),
      paidAt: null,
    };

    const analysis = analyzeCartMentality(currentCart, [previousCart]);
    assert.equal(analysis.attemptCount, 2);
    assert.equal(analysis.behavior, "downsized");
    assert.equal(analysis.deltaAmount, -300);
    assert.equal(analysis.droppedItems.length, 1);
    assert.equal(analysis.droppedItems[0].name, "Gingelly Oil 1L");
    assert.equal(analysis.addedItems.length, 1);
    assert.equal(analysis.addedItems[0].name, "Gingelly Oil 500ml");
  });
});
