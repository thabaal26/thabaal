import test, { describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { setOrderPoints } from "../../src/lib/loyalty-redeem";

describe("LOY-02: Customer Loyalty Concurrency & Advisory Lock Test Suite", () => {
  let testClientId: string;
  let testCustomerId: string;
  let orderAId: string;
  let orderBId: string;

  beforeEach(async () => {
    // 1. Setup isolated test client
    const client = await db.client.create({
      data: {
        name: `Test Shop Loyalty Lock ${Date.now()}`,
        loyaltyRedeemOn: true,
        loyaltyEarnOn: true,
        loyaltyRepeatOn: true,
        loyaltyRupeesPerPoint: 100,
        loyaltyRepeatBonus: 50,
      },
    });
    testClientId = client.id;

    // 2. Setup customer with 100 manual points (eligible for ₹50 discount = 100 pts)
    const customer = await db.customer.create({
      data: {
        clientId: testClientId,
        name: "Concurrency Tester",
        phone: `91987${Math.floor(1000000 + Math.random() * 9000000)}`,
        tags: ["loyalty-bonus:100"],
      },
    });
    testCustomerId = customer.id;

    // 3. Create two pending orders for this customer (subtotal ₹300 each)
    const numA = Math.floor(100000 + Math.random() * 800000);
    const orderA = await db.order.create({
      data: {
        clientId: testClientId,
        customerId: testCustomerId,
        number: numA,
        total: 300,
        status: "NEW",
        items: [{ id: "item_1", name: "Cold-Pressed Sesame 500ml", price: 300, quantity: 1, currency: "INR" }],
        pointsRedeemed: 0,
      },
    });
    orderAId = orderA.id;

    const numB = numA + 1;
    const orderB = await db.order.create({
      data: {
        clientId: testClientId,
        customerId: testCustomerId,
        number: numB,
        total: 300,
        status: "NEW",
        items: [{ id: "item_2", name: "Cold-Pressed Groundnut 500ml", price: 300, quantity: 1, currency: "INR" }],
        pointsRedeemed: 0,
      },
    });
    orderBId = orderB.id;
  });

  test("1. Two concurrent order redemptions for same customer are serialized by pg_advisory_xact_lock", async () => {
    // Customer has 100 points (= ₹50 discount).
    // Both orders simultaneously attempt to claim ₹50 discount (100 points).
    // Under un-serialized execution, both would see 100 points and deduct them.
    // Under LOY-02 pg_advisory_xact_lock, one executes first, claims 100 pts;
    // the second executes next under lock, sees 0 pts, and is rejected!

    const [resA, resB] = await Promise.all([
      setOrderPoints(orderAId, 50),
      setOrderPoints(orderBId, 50),
    ]);

    const successes = [resA, resB].filter((r) => r.ok);
    const failures = [resA, resB].filter((r) => !r.ok);

    assert.equal(successes.length, 1, "Exactly one order redemption must succeed");
    assert.equal(failures.length, 1, "The competing concurrent redemption must be rejected due to insufficient points");

    assert.equal(successes[0].applied, 50, "Winning order received ₹50 points discount");
    assert.match(failures[0].message, /doesn't have enough points yet/i, "Failing order was rejected with insufficient points message");

    // Verify database state: only one order has pointsRedeemed = 100
    const [freshA, freshB] = await Promise.all([
      db.order.findUniqueOrThrow({ where: { id: orderAId } }),
      db.order.findUniqueOrThrow({ where: { id: orderBId } }),
    ]);

    const totalPointsRedeemed = (freshA.pointsRedeemed ?? 0) + (freshB.pointsRedeemed ?? 0);
    assert.equal(totalPointsRedeemed, 100, "Total redeemed points across orders must not exceed the customer's 100 point balance");

    // Verify ledger entry was created
    const entries = await db.loyaltyEntry.findMany({
      where: { customerId: testCustomerId },
    });
    assert.equal(entries.length, 1, "Exactly one LoyaltyEntry ledger record was written");
    assert.equal(entries[0].delta, -100, "Ledger delta must be -100 points");
  });

  test("2. Re-attempting redemption after order cancellation restores customer balance", async () => {
    // Redeem on Order A
    const resA = await setOrderPoints(orderAId, 50);
    assert.equal(resA.ok, true);

    // Cancel Order A
    await db.order.update({
      where: { id: orderAId },
      data: { status: "CANCELLED" },
    });

    // Now Order B attempts redemption
    const resB = await setOrderPoints(orderBId, 50);
    assert.equal(resB.ok, true, "Order B must succeed because Order A cancellation restored points to customer");
    assert.equal(resB.applied, 50);

    const freshB = await db.order.findUniqueOrThrow({ where: { id: orderBId } });
    assert.equal(freshB.pointsRedeemed, 100);
    assert.equal(freshB.total, 250); // 300 - 50 = 250
  });
});
