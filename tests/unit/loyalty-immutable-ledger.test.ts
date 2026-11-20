import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { db } from "../../src/lib/db";
import { computeCustomerLoyalty, DEFAULT_LOYALTY_RULES } from "../../src/lib/loyalty";

describe("LOY-03: Immutable Loyalty Ledger & Policy Reconciliation Test Suite", () => {
  test("1. LoyaltyEntry enforces uniqueness on idempotencyKey", async () => {
    const client = await db.client.create({
      data: { name: `Ledger Test Client ${Date.now()}` },
    });
    const customer = await db.customer.create({
      data: {
        clientId: client.id,
        name: "Ledger User",
        phone: `91986${Math.floor(1000000 + Math.random() * 9000000)}`,
        tags: [],
      },
    });

    const key = `test-idemp:${Date.now()}:${Math.random()}`;

    // First insert succeeds
    const entry1 = await db.loyaltyEntry.create({
      data: {
        clientId: client.id,
        customerId: customer.id,
        delta: 50,
        kind: "give",
        reason: "Test bonus",
        idempotencyKey: key,
        sourceRef: "order_123",
      },
    });
    assert.ok(entry1.id);
    assert.equal(entry1.idempotencyKey, key);
    assert.equal(entry1.sourceRef, "order_123");

    // Second insert with duplicate idempotencyKey must throw Prisma P2002
    await assert.rejects(
      async () => {
        await db.loyaltyEntry.create({
          data: {
            clientId: client.id,
            customerId: customer.id,
            delta: 50,
            kind: "give",
            reason: "Duplicate test bonus",
            idempotencyKey: key,
            sourceRef: "order_123",
          },
        });
      },
      (err: unknown) => {
        return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      },
      "Duplicate idempotencyKey must be rejected with P2002 unique constraint error"
    );
  });

  test("2. Earning policy reconciliation: Default rupeesPerPoint is 100", () => {
    assert.equal(DEFAULT_LOYALTY_RULES.rupeesPerPoint, 100, "Default codebase loyalty policy is 1 pt per ₹100 spent");

    const bronzeCust = computeCustomerLoyalty({
      name: "Prospect",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: null,
      tags: ["loyalty-bonus:40"],
      rules: DEFAULT_LOYALTY_RULES,
    });
    assert.equal(bronzeCust.totalPoints, 40);
    assert.equal(bronzeCust.tier, "bronze");
    assert.equal(bronzeCust.tierLabel, "Bronze Starter");
  });

  test("3. Tier boundaries and Sheet Purchases Behavior", () => {
    // Single sheet purchase item gives +35 pts and qualifies for Silver
    const singleSheetItem = computeCustomerLoyalty({
      name: "Sheet Customer",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: "Cold-Pressed Sesame Oil 1L",
      tags: [],
      rules: DEFAULT_LOYALTY_RULES,
    });
    assert.equal(singleSheetItem.totalPoints, 35);
    assert.equal(singleSheetItem.tier, "silver", "Customer with historical sheet item qualifies for Silver status");
    assert.equal(singleSheetItem.tierLabel, "Silver Member");

    // Customer with 120 points without sheet purchases qualifies for Silver (>= 100 pts)
    const pointsCustomer = computeCustomerLoyalty({
      name: "Points Customer",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: null,
      tags: ["loyalty-bonus:120"],
      rules: DEFAULT_LOYALTY_RULES,
    });
    assert.equal(pointsCustomer.totalPoints, 120);
    assert.equal(pointsCustomer.tier, "silver");
    assert.equal(pointsCustomer.tierLabel, "Silver Member");

    // Customer with 500 points qualifies for Gold (or >= 250)
    const goldCustomer = computeCustomerLoyalty({
      name: "Gold Customer",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: null,
      tags: ["loyalty-bonus:300"],
      rules: DEFAULT_LOYALTY_RULES,
    });
    assert.equal(goldCustomer.totalPoints, 300);
    assert.equal(goldCustomer.tier, "gold");
    assert.equal(goldCustomer.tierLabel, "Gold Regular");

    // Customer with 1000 points qualifies for Platinum (or >= 500)
    const platCustomer = computeCustomerLoyalty({
      name: "Platinum Customer",
      paidOrdersCount: 0,
      totalSpent: 0,
      sheetPurchases: null,
      tags: ["loyalty-bonus:1050"],
      rules: DEFAULT_LOYALTY_RULES,
    });
    assert.equal(platCustomer.totalPoints, 1050);
    assert.equal(platCustomer.tier, "platinum");
    assert.equal(platCustomer.tierLabel, "Platinum VIP");
  });
});
