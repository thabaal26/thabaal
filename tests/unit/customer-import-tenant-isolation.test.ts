import test from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";

test("IMPORT-TENANT-ISOLATION: Worker Lease Fencing & Cross-Tenant Boundary Invariants", async (t) => {
  const testClientA = `test_cli_imp_a_${Date.now()}`;
  const testClientB = `test_cli_imp_b_${Date.now()}`;

  // Setup 2 isolated test clients
  await db.client.create({ data: { id: testClientA, name: "Import Isolation Tenant A" } });
  await db.client.create({ data: { id: testClientB, name: "Import Isolation Tenant B" } });

  t.after(async () => {
    await db.importBatch.deleteMany({ where: { clientId: { in: [testClientA, testClientB] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [testClientA, testClientB] } } }).catch(() => {});
  });

  await t.test("1. Cross-tenant isolation: Tenant A cannot see or claim Tenant B's import batch", async () => {
    // Create batch belonging strictly to Tenant B
    const batchB = await db.importBatch.create({
      data: {
        clientId: testClientB,
        userId: "user_b",
        idempotencyKey: `idem_b_${Date.now()}`,
        status: "STAGING",
        defaultTags: ["retail"],
        optInSource: "Store POS Bill",
      },
    });

    // Query scoped to Tenant A looking for batchB.id
    const scopedFind = await db.importBatch.findFirst({
      where: {
        id: batchB.id,
        clientId: testClientA, // Scoped to Tenant A
      },
    });

    assert.equal(scopedFind, null, "Tenant A must NEVER find or read Tenant B's import batch");

    // Attempted update by Tenant A on Tenant B's batch
    const unauthorizedUpdate = await db.importBatch.updateMany({
      where: {
        id: batchB.id,
        clientId: testClientA,
      },
      data: {
        status: "FAILED",
      },
    });

    assert.equal(unauthorizedUpdate.count, 0, "Tenant A must NOT be able to mutate Tenant B's batch");

    // Verify batch B remains in original state
    const originalB = await db.importBatch.findUnique({ where: { id: batchB.id } });
    assert.equal(originalB?.status, "STAGING", "Batch B state must remain completely unmutated");
  });

  await t.test("2. Worker lease fencing: Optimistic fence version serializes concurrent claims", async () => {
    const batch = await db.importBatch.create({
      data: {
        clientId: testClientA,
        userId: "user_a",
        idempotencyKey: `idem_fence_${Date.now()}`,
        status: "STAGING",
        workerFenceVersion: 1,
        optInSource: "Store POS Bill",
      },
    });

    const now = new Date();
    const expiresAt = new Date(Date.now() + 60_000);

    // Simulate Worker 1 and Worker 2 both seeing fenceVersion: 1
    const claim1Promise = db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: 1,
      },
      data: {
        workerLeaseToken: "worker-1-token",
        workerLeaseExpiresAt: expiresAt,
        workerHeartbeatAt: now,
        workerFenceVersion: { increment: 1 },
        attemptCount: { increment: 1 },
      },
    });

    const claim2Promise = db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: 1,
      },
      data: {
        workerLeaseToken: "worker-2-token",
        workerLeaseExpiresAt: expiresAt,
        workerHeartbeatAt: now,
        workerFenceVersion: { increment: 1 },
        attemptCount: { increment: 1 },
      },
    });

    const [res1, res2] = await Promise.all([claim1Promise, claim2Promise]);
    const totalWon = res1.count + res2.count;
    assert.equal(totalWon, 1, "Exactly one worker must win the lease under concurrent claim race");

    // Verify fence version was incremented to 2
    const updated = await db.importBatch.findUnique({ where: { id: batch.id } });
    assert.equal(updated?.workerFenceVersion, 2, "workerFenceVersion must be atomically incremented to 2");
    assert.equal(updated?.attemptCount, 1, "attemptCount must be incremented exactly once");
  });

  await t.test("3. Worker lease expiration: Expired lease can be claimed by a new worker", async () => {
    const past = new Date(Date.now() - 10_000); // Expired 10 seconds ago
    const batch = await db.importBatch.create({
      data: {
        clientId: testClientA,
        userId: "user_a",
        idempotencyKey: `idem_expired_${Date.now()}`,
        status: "STAGING",
        workerLeaseToken: "old-stalled-token",
        workerLeaseExpiresAt: past,
        workerFenceVersion: 3,
        optInSource: "Store POS Bill",
      },
    });

    const now = new Date();
    const newExpiresAt = new Date(Date.now() + 60_000);

    // Query finding pending batches eligible for lease
    const eligible = await db.importBatch.findFirst({
      where: {
        id: batch.id,
        status: { in: ["STAGING", "COMMITTING"] },
        OR: [
          { workerLeaseExpiresAt: null },
          { workerLeaseExpiresAt: { lt: now } },
        ],
      },
    });

    assert.ok(eligible, "Expired lease batch must be discovered as eligible for reclaim");

    // Claim the expired batch
    const reclaim = await db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: eligible.workerFenceVersion,
      },
      data: {
        workerLeaseToken: "reclaimed-token",
        workerLeaseExpiresAt: newExpiresAt,
        workerFenceVersion: { increment: 1 },
      },
    });

    assert.equal(reclaim.count, 1, "Reclaim of expired batch must succeed");
    const reclaimed = await db.importBatch.findUnique({ where: { id: batch.id } });
    assert.equal(reclaimed?.workerLeaseToken, "reclaimed-token");
    assert.equal(reclaimed?.workerFenceVersion, 4);
  });

  await t.test("4. Active lease blocks concurrent worker acquisition", async () => {
    const future = new Date(Date.now() + 60_000); // 1 minute in future
    const batch = await db.importBatch.create({
      data: {
        clientId: testClientA,
        userId: "user_a",
        idempotencyKey: `idem_active_${Date.now()}`,
        status: "STAGING",
        workerLeaseToken: "active-token",
        workerLeaseExpiresAt: future,
        workerFenceVersion: 5,
        optInSource: "Store POS Bill",
      },
    });

    const now = new Date();
    // Query should not find this batch because lease is not null and not < now
    const eligible = await db.importBatch.findFirst({
      where: {
        id: batch.id,
        status: { in: ["STAGING", "COMMITTING"] },
        OR: [
          { workerLeaseExpiresAt: null },
          { workerLeaseExpiresAt: { lt: now } },
        ],
      },
    });

    assert.equal(eligible, null, "Active unexpired lease must NOT be eligible for another worker");
  });
});
