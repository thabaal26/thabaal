import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { isSale } from "../../src/lib/sale";
import { loyaltyFromOrders, pointsForOrder, redeemedOnOrders } from "../../src/lib/loyalty";

describe("LOY-01: Order Cancellation & Refund Lifecycle Test Suite", () => {
  const rules = {
    earnOn: true,
    rupeesPerPoint: 100,
    repeatOn: true,
    repeatBonus: 50,
    redeemOn: true,
  };

  test("LOY-01-A: Normal completed paid order earns points and counts toward frequency", () => {
    const order = {
      id: "ord_1",
      total: 1000,
      status: "DELIVERED",
      paidAt: new Date(),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: null,
      pointsRedeemed: 0,
    };

    assert.equal(isSale(order), true);
    const summary = loyaltyFromOrders(
      { name: "Ananya", purchases: null, tags: [], orders: [order] },
      { rules }
    );
    assert.equal(summary.spendPoints, 10); // 1000 / 100 = 10 pts
    assert.equal(summary.frequencyPoints, 0); // 0 repeat bonus for 1st order
    assert.equal(summary.totalPoints, 10);
  });

  test("LOY-01-B: Unpaid cancelled order earns 0 points and does not count as sale", () => {
    const order = {
      id: "ord_2",
      total: 800,
      status: "CANCELLED",
      paidAt: null,
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: null,
      pointsRedeemed: 0,
    };

    assert.equal(isSale(order), false);
    const summary = loyaltyFromOrders(
      { name: "Bala", purchases: null, tags: [], orders: [order] },
      { rules }
    );
    assert.equal(summary.spendPoints, 0);
    assert.equal(summary.frequencyPoints, 0);
    assert.equal(summary.totalPoints, 0);
  });

  test("LOY-01-C: Paid order subsequently cancelled loses qualifying sale status and earns 0 points", () => {
    // Crucial LOY-01 finding: Even if paidAt has a valid timestamp, status: CANCELLED must invalidate the sale!
    const order = {
      id: "ord_3",
      total: 1200,
      status: "CANCELLED",
      paidAt: new Date(Date.now() - 3600_000),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: null,
      pointsRedeemed: 0,
    };

    assert.equal(isSale(order), false, "Cancelled order must not qualify as a sale even with paidAt timestamp");
    const summary = loyaltyFromOrders(
      { name: "Chitra", purchases: null, tags: [], orders: [order] },
      { rules }
    );
    assert.equal(summary.spendPoints, 0);
    assert.equal(summary.frequencyPoints, 0);
    assert.equal(summary.totalPoints, 0);
  });

  test("LOY-01-D: 100% full refund loses qualifying sale status and awards 0 points", () => {
    const order = {
      id: "ord_4",
      total: 1500,
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: 1500, // 100% refunded
      pointsRedeemed: 0,
    };

    assert.equal(isSale(order), false, "100% refunded order produces zero net revenue and ceases to be a qualifying sale");
    const summary = loyaltyFromOrders(
      { name: "Deepak", purchases: null, tags: [], orders: [order] },
      { rules }
    );
    assert.equal(summary.spendPoints, 0);
    assert.equal(summary.frequencyPoints, 0);
    assert.equal(summary.totalPoints, 0);
  });

  test("LOY-01-E: Partial refund calculates points strictly on net non-refunded spend", () => {
    const order = {
      id: "ord_5",
      total: 1000,
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: 400, // net spend is 600
      pointsRedeemed: 0,
    };

    assert.equal(isSale(order), true);
    const summary = loyaltyFromOrders(
      { name: "Ezhil", purchases: null, tags: [], orders: [order] },
      { rules }
    );
    assert.equal(summary.spendPoints, 6, "Spend points must be floor(600 / 100) = 6");
    assert.equal(summary.totalPoints, 6);
  });

  test("LOY-01-F: Repeat order bonus revoked when previous qualifying order is cancelled or fully refunded", () => {
    const order1 = {
      id: "ord_6a",
      total: 1000,
      status: "DELIVERED",
      paidAt: new Date(Date.now() - 86400_000),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: 0,
      pointsRedeemed: 0,
    };
    const order2 = {
      id: "ord_6b",
      total: 1000,
      status: "DELIVERED",
      paidAt: new Date(),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: 0,
      pointsRedeemed: 0,
    };

    // Before refund: 2 paid orders -> 10 + 10 spend pts + 50 repeat bonus = 70 pts
    const summaryBefore = loyaltyFromOrders(
      { name: "Farooq", purchases: null, tags: [], orders: [order1, order2] },
      { rules }
    );
    assert.equal(summaryBefore.spendPoints, 20);
    assert.equal(summaryBefore.frequencyPoints, 50);
    assert.equal(summaryBefore.totalPoints, 70);

    // Order 1 is cancelled/refunded
    const order1Cancelled = { ...order1, status: "CANCELLED" };
    const summaryAfter = loyaltyFromOrders(
      { name: "Farooq", purchases: null, tags: [], orders: [order1Cancelled, order2] },
      { rules }
    );
    assert.equal(summaryAfter.spendPoints, 10);
    assert.equal(summaryAfter.frequencyPoints, 0, "Repeat bonus must be revoked when 1st order is cancelled");
    assert.equal(summaryAfter.totalPoints, 10);
  });

  test("LOY-01-G: Cancelled order automatically restores redeemed points to customer balance", () => {
    const standingOrder = {
      id: "ord_7a",
      total: 1000,
      status: "DELIVERED",
      paidAt: new Date(Date.now() - 86400_000),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      pointsRedeemed: 0,
    };
    const cancelledOrderWithRedemption = {
      id: "ord_7b",
      total: 500,
      status: "CANCELLED",
      paidAt: null,
      paymentMethod: "cod",
      internalNote: null,
      pointsRedeemed: 50, // customer had redeemed 50 points
    };

    // redeemedOnOrders filters out CANCELLED orders
    const redeemed = redeemedOnOrders([standingOrder, cancelledOrderWithRedemption]);
    assert.equal(redeemed, 0, "Points on cancelled order must not remain deducted");

    const summary = loyaltyFromOrders(
      { name: "Gita", purchases: null, tags: ["loyalty-bonus:100"], orders: [standingOrder, cancelledOrderWithRedemption] },
      { rules }
    );
    // 10 spend pts + 100 manual pts - 0 redeemed = 110 pts
    assert.equal(summary.totalPoints, 110);
  });

  test("LOY-01-H: Zero-dollar order does not award spend points or repeat bonus", () => {
    const freeOrder = {
      id: "ord_8",
      total: 0,
      status: "DELIVERED",
      paidAt: new Date(),
      paymentMethod: "promo",
      internalNote: null,
      pointsRedeemed: 0,
    };

    assert.equal(isSale(freeOrder), true);
    const summary = loyaltyFromOrders(
      { name: "Hari", purchases: null, tags: [], orders: [freeOrder] },
      { rules }
    );
    assert.equal(summary.spendPoints, 0);
    assert.equal(summary.totalPoints, 0);
  });

  test("LOY-01-I: COD confirmed order qualifies as sale; cancelled COD order immediately revokes sale", () => {
    const codOrder = {
      id: "ord_9",
      total: 1000,
      status: "CONFIRMED",
      paidAt: null,
      paymentMethod: "cod",
      internalNote: null,
      pointsRedeemed: 0,
    };

    assert.equal(isSale(codOrder), true, "CONFIRMED COD order is a qualifying sale");

    const codCancelled = { ...codOrder, status: "CANCELLED" };
    assert.equal(isSale(codCancelled), false, "CANCELLED COD order must not be a qualifying sale");
  });

  test("LOY-01-J: Over-refund clamp guarantees non-negative net spend and clean computation", () => {
    const overRefunded = {
      id: "ord_10",
      total: 500,
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi_whatsapp",
      internalNote: null,
      refundAmount: 900, // over-refund
      pointsRedeemed: 0,
    };

    // When refundAmount >= total, isSale returns false
    assert.equal(isSale(overRefunded), false);

    const pts = pointsForOrder(500, 1, rules, 900);
    assert.equal(pts, 0, "pointsForOrder must return 0 for over-refunded order");
  });
});
