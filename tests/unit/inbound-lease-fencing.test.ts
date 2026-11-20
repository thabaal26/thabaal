import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { claimInbound, markProcessed, releaseInbound, STALE_MS } from "../../src/lib/engine/inbound";

describe("WEB-03: Inbound Claim Atomic Lease Reservation & Fencing Test Suite", () => {
  test("1. Fresh message claims PROCESSING lease and returns 'new'", async () => {
    const inboundId = `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker1 = "worker-node-1";

    const res1 = await claimInbound(inboundId, null, new Date(), "text", worker1);
    assert.equal(res1, "new");

    const record = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(record.status, "PROCESSING");
    assert.equal(record.leaseOwnerId, worker1);
    assert.equal(record.leaseVersion, 1);
    assert.equal(record.attemptCount, 1);
    assert.ok(record.leaseExpiresAt);
    assert.equal(record.completedAt, null);
  });

  test("2. Concurrent claim while lease is active is rejected as 'duplicate'", async () => {
    const inboundId = `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker1 = "worker-node-1";
    const worker2 = "worker-node-2";

    const res1 = await claimInbound(inboundId, null, new Date(), "text", worker1);
    assert.equal(res1, "new");

    // Second worker attempts claim before lease expiry
    const res2 = await claimInbound(inboundId, null, new Date(), "text", worker2);
    assert.equal(res2, "duplicate");

    // Ensure lease was not stolen by worker 2
    const record = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(record.leaseOwnerId, worker1);
    assert.equal(record.leaseVersion, 1);
  });

  test("3. Released retryable failure allows immediate takeover by next retry", async () => {
    const inboundId = `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker1 = "worker-node-1";
    const worker2 = "worker-node-2";

    await claimInbound(inboundId, null, new Date(), "text", worker1);

    // Worker 1 encounters transient failure
    await releaseInbound(inboundId, new Error("Transient network timeout"), worker1);

    const recordAfterRelease = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(recordAfterRelease.status, "RETRYABLE_FAILURE");
    assert.match(recordAfterRelease.lastError ?? "", /Transient network timeout/);

    // Worker 2 (Meta retry) attempts claim
    const res2 = await claimInbound(inboundId, null, new Date(), "text", worker2);
    assert.equal(res2, "new", "Retryable failure must be immediately claimable by next attempt");

    const recordAfterTakeover = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(recordAfterTakeover.status, "PROCESSING");
    assert.equal(recordAfterTakeover.leaseOwnerId, worker2);
    assert.equal(recordAfterTakeover.leaseVersion, 2);
    assert.equal(recordAfterTakeover.attemptCount, 2);
  });

  test("4. Stale lease past STALE_MS is atomically taken over by recovering worker", async () => {
    const inboundId = `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker1 = "crashed-worker";
    const worker2 = "recovery-worker";

    // Simulate an event created 5 minutes ago (exceeding STALE_MS of 3 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000);
    await db.inboundEvent.create({
      data: {
        id: inboundId,
        status: "PROCESSING",
        leaseOwnerId: worker1,
        leaseExpiresAt: new Date(fiveMinutesAgo.getTime() + STALE_MS), // expired 2 mins ago
        leaseVersion: 1,
        attemptCount: 1,
        receivedAt: fiveMinutesAgo,
      },
    });

    // Recovery worker claims the expired lease
    const res = await claimInbound(inboundId, null, new Date(), "text", worker2);
    assert.equal(res, "new");

    const record = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(record.leaseOwnerId, worker2);
    assert.equal(record.leaseVersion, 2);
    assert.equal(record.attemptCount, 2);
    assert.equal(record.status, "PROCESSING");
  });

  test("5. Completed event is sealed and never re-processed or stolen", async () => {
    const inboundId = `wamid.test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const worker1 = "worker-1";
    const worker2 = "worker-2";

    await claimInbound(inboundId, null, new Date(), "text", worker1);
    await markProcessed(inboundId, worker1);

    const record = await db.inboundEvent.findUniqueOrThrow({ where: { id: inboundId } });
    assert.equal(record.status, "COMPLETED");
    assert.ok(record.completedAt);
    assert.ok(record.processedAt);

    // Later attempt by another worker or retry
    const res = await claimInbound(inboundId, null, new Date(Date.now() + 10 * 60_000), "text", worker2);
    assert.equal(res, "duplicate", "COMPLETED event must never be claimed again");
  });
});
