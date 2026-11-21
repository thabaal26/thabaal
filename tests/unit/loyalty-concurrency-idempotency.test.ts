import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";

test("LOYALTY-IDEMPOTENCY: Concurrent & Sequential Idempotency Invariants", async (t) => {
  const testClientId = `test_cli_loy_${Date.now()}`;
  const testCustomerId = `test_cust_loy_${Date.now()}`;

  // Setup test client & customer
  await db.client.create({
    data: {
      id: testClientId,
      name: "Loyalty Test Client",
    },
  });

  await db.customer.create({
    data: {
      id: testCustomerId,
      clientId: testClientId,
      name: "Loyalty Test Customer",
      phone: `9199999${Math.floor(10000 + Math.random() * 90000)}`,
    },
  });

  t.after(async () => {
    await db.loyaltyEntry.deleteMany({ where: { clientId: testClientId } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId: testClientId } }).catch(() => {});
    await db.client.deleteMany({ where: { id: testClientId } }).catch(() => {});
  });

  await t.test("1. Sequential idempotency: identical idempotencyKey throws unique constraint", async () => {
    const key = `loy_idem_seq_${Date.now()}`;

    // First insertion succeeds
    const first = await db.loyaltyEntry.create({
      data: {
        clientId: testClientId,
        customerId: testCustomerId,
        delta: 100,
        kind: "give",
        reason: "First welcome bonus",
        idempotencyKey: key,
        sourceRef: "order_001",
      },
    });
    assert.ok(first.id);

    // Second insertion with identical key must fail with unique constraint
    let threw = false;
    try {
      await db.loyaltyEntry.create({
        data: {
          clientId: testClientId,
          customerId: testCustomerId,
          delta: 100,
          kind: "give",
          reason: "Duplicate welcome bonus attempt",
          idempotencyKey: key,
          sourceRef: "order_001",
        },
      });
    } catch (err: any) {
      threw = true;
      assert.equal(err.code, "P2002", "Must throw Prisma P2002 Unique constraint violation");
    }
    assert.equal(threw, true, "Duplicate key must be rejected");

    // Verify only 1 record exists
    const count = await db.loyaltyEntry.count({
      where: { clientId: testClientId, idempotencyKey: key },
    });
    assert.equal(count, 1, "Exactly one loyalty entry must exist");
  });

  await t.test("2. Concurrent idempotency: 10 racing requests create exactly 1 entry", async () => {
    const key = `loy_idem_race_${Date.now()}`;

    const attempts = Array.from({ length: 10 }, (_, i) =>
      db.loyaltyEntry.create({
        data: {
          clientId: testClientId,
          customerId: testCustomerId,
          delta: 50,
          kind: "give",
          reason: `Concurrent grant attempt #${i}`,
          idempotencyKey: key,
          sourceRef: `race_ref_${i}`,
        },
      })
    );

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly one winner must succeed in concurrent race");
    assert.equal(rejected.length, 9, "Exactly 9 competing transactions must be rejected");

    for (const r of rejected) {
      if (r.status === "rejected") {
        assert.equal(r.reason?.code, "P2002", "Rejected attempts must fail on unique constraint");
      }
    }

    const count = await db.loyaltyEntry.count({
      where: { clientId: testClientId, idempotencyKey: key },
    });
    assert.equal(count, 1, "Database must hold exactly 1 row under concurrent contention");
  });

  await t.test("3. Null idempotencyKey: multiple legacy records with null keys are permitted", async () => {
    const firstNull = await db.loyaltyEntry.create({
      data: {
        clientId: testClientId,
        customerId: testCustomerId,
        delta: 10,
        kind: "give",
        reason: "Legacy grant 1",
        idempotencyKey: null,
      },
    });

    const secondNull = await db.loyaltyEntry.create({
      data: {
        clientId: testClientId,
        customerId: testCustomerId,
        delta: 20,
        kind: "give",
        reason: "Legacy grant 2",
        idempotencyKey: null,
      },
    });

    assert.ok(firstNull.id);
    assert.ok(secondNull.id);
    assert.notEqual(firstNull.id, secondNull.id);
  });
});
