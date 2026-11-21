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

  await t.test("5. Stale worker final-commit fencing: expired worker cannot commit after newer lease", async () => {
    // 1. Create batch leased to Worker A under fence version 2
    const past = new Date(Date.now() - 5_000); // Expired
    const batch = await db.importBatch.create({
      data: {
        clientId: testClientA,
        userId: "user_a",
        idempotencyKey: `idem_stale_commit_${Date.now()}`,
        status: "COMMITTING",
        workerLeaseToken: "worker-a-stale-token",
        workerLeaseExpiresAt: past,
        workerFenceVersion: 2,
        optInSource: "Store POS Bill",
      },
    });

    // 2. Worker B reclaims the batch with fence version 3
    const newExpiresAt = new Date(Date.now() + 60_000);
    const reclaimResult = await db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: 2,
      },
      data: {
        workerLeaseToken: "worker-b-active-token",
        workerLeaseExpiresAt: newExpiresAt,
        workerFenceVersion: { increment: 1 }, // Becomes 3
      },
    });
    assert.equal(reclaimResult.count, 1, "Worker B must successfully acquire the lease");

    // 3. Worker A (stale) wakes up and attempts to commit results using stale fence version 2
    const staleCommitAttempt = await db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: 2, // STALE! Database is now at 3
      },
      data: {
        status: "COMPLETED",
        workerLeaseToken: null,
        workerLeaseExpiresAt: null,
      },
    });

    assert.equal(staleCommitAttempt.count, 0, "Stale worker commit MUST mutate exactly 0 rows");

    // 4. Verify batch remains in COMMITTING state owned by Worker B
    const currentBatch = await db.importBatch.findUnique({ where: { id: batch.id } });
    assert.equal(currentBatch?.status, "COMMITTING", "Batch state must not be overwritten by stale worker");
    assert.equal(currentBatch?.workerLeaseToken, "worker-b-active-token", "Worker B lease must remain intact");
    assert.equal(currentBatch?.workerFenceVersion, 3, "Fence version must remain at 3");
  });

  await t.test("6. Child-record tenant & batch consistency: ImportFile, ImportStagingRecord & ImportErrorLog isolation", async () => {
    // 1. Setup Tenant B batch with file, staging records, and error log
    const batchB = await db.importBatch.create({
      data: {
        clientId: testClientB,
        userId: "user_b",
        idempotencyKey: `idem_child_b_${Date.now()}`,
        status: "STAGING",
        optInSource: "Store POS Bill",
      },
    });

    const fileB = await db.importFile.create({
      data: {
        batchId: batchB.id,
        clientId: testClientB,
        originalFileName: "tenant_b_customers.xlsx",
        safeStoredFileName: "safe_tenant_b_customers.xlsx",
        fileFormat: "XLSX",
        fileSize: 2048,
        storagePath: "/tmp/b.xlsx",
        checksum: "hash_b_123456",
      },
    });

    const stagingB = await db.importStagingRecord.create({
      data: {
        batchId: batchB.id,
        fileId: fileB.id,
        clientId: testClientB,
        sourceRowNumber: 1,
        sourceIdentity: `${fileB.id}:Sheet1:1`,
        normalizedPhone: "919988776655",
        name: "Tenant B Secret Customer",
        reviewStatus: "PENDING",
      },
    });

    const errorB = await db.importErrorLog.create({
      data: {
        batchId: batchB.id,
        clientId: testClientB,
        fileId: fileB.id,
        sourceRowNumber: 2,
        errorCode: "INVALID_PHONE_LENGTH",
        reason: "Malformed phone number in Tenant B sheet",
      },
    });

    // 2. Query child records scoped to Tenant A looking for Tenant B records
    const crossTenantStaging = await db.importStagingRecord.findFirst({
      where: {
        id: stagingB.id,
        clientId: testClientA, // Scoped to Tenant A
      },
    });
    assert.equal(crossTenantStaging, null, "Tenant A must NEVER be able to query Tenant B staging records");

    // 3. Attempted mutation on Tenant B staging records by Tenant A
    const crossTenantStagingUpdate = await db.importStagingRecord.updateMany({
      where: {
        id: stagingB.id,
        clientId: testClientA,
      },
      data: {
        reviewStatus: "REJECTED",
      },
    });
    assert.equal(crossTenantStagingUpdate.count, 0, "Tenant A cannot mutate Tenant B staging records");

    // 4. Verify batch boundary consistency for files and error logs
    const crossBatchFile = await db.importFile.findFirst({
      where: {
        id: fileB.id,
        batch: { clientId: testClientA }, // Traversed to Tenant A
      },
    });
    assert.equal(crossBatchFile, null, "Tenant A must NOT traverse Tenant B import files");

    const crossBatchError = await db.importErrorLog.findFirst({
      where: {
        id: errorB.id,
        batch: { clientId: testClientA },
      },
    });
    assert.equal(crossBatchError, null, "Tenant A must NOT traverse Tenant B import error logs");
  });

  await t.test("7. Complete stale-worker finalization transaction: expired worker committing side effects is fully rejected", async () => {
    // 1. Setup batch leased to Worker A under version 2
    const past = new Date(Date.now() - 5_000);
    const batch = await db.importBatch.create({
      data: {
        clientId: testClientA,
        userId: "user_a",
        idempotencyKey: `idem_full_stale_${Date.now()}`,
        status: "COMMITTING",
        workerLeaseToken: "worker-a-stale-token",
        workerLeaseExpiresAt: past,
        workerFenceVersion: 2,
        optInSource: "Store POS Bill",
      },
    });

    const file = await db.importFile.create({
      data: {
        batchId: batch.id,
        clientId: testClientA,
        originalFileName: "customers.xlsx",
        safeStoredFileName: "safe_customers.xlsx",
        fileFormat: "XLSX",
        fileSize: 1024,
        storagePath: "/tmp/a.xlsx",
        checksum: "hash_a_123456",
      },
    });

    const staging = await db.importStagingRecord.create({
      data: {
        batchId: batch.id,
        fileId: file.id,
        clientId: testClientA,
        sourceRowNumber: 1,
        sourceIdentity: `${file.id}:Sheet1:1`,
        normalizedPhone: "919111223344",
        name: "Stale Candidate Customer",
        tags: ["stale-tag"],
        reviewStatus: "PENDING",
      },
    });

    // 2. Worker B reclaims the batch, incrementing fence version to 3
    const newExpiresAt = new Date(Date.now() + 60_000);
    await db.importBatch.updateMany({
      where: {
        id: batch.id,
        clientId: testClientA,
        workerFenceVersion: 2,
      },
      data: {
        workerLeaseToken: "worker-b-active-token",
        workerLeaseExpiresAt: newExpiresAt,
        workerFenceVersion: 3,
      },
    });

    // 3. Worker A (stale with version 2) attempts complete commit transaction
    const executeWorkerCommit = async (workerToken: string, fenceVersion: number) => {
      return await db.$transaction(async (tx) => {
        // Enforce fencing invariant on the batch inside the commit transaction
        const claim = await tx.importBatch.updateMany({
          where: {
            id: batch.id,
            clientId: testClientA,
            workerFenceVersion: fenceVersion,
            workerLeaseToken: workerToken,
          },
          data: {
            status: "COMPLETED",
            workerLeaseToken: null,
            workerLeaseExpiresAt: null,
          },
        });

        if (claim.count === 0) {
          throw new Error("STALE_WORKER_FENCE_VIOLATION");
        }

        // Side effect: create customer
        await tx.customer.create({
          data: {
            clientId: testClientA,
            phone: staging.normalizedPhone!,
            name: staging.name!,
            tags: staging.tags,
          },
        });

        // Side effect: mark staging record committed
        await tx.importStagingRecord.update({
          where: { id: staging.id },
          data: { reviewStatus: "APPROVED", committedAt: new Date() },
        });

        return { ok: true };
      });
    };

    let workerAError: string | null = null;
    try {
      await executeWorkerCommit("worker-a-stale-token", 2);
    } catch (err: any) {
      workerAError = err.message;
    }

    // 4. Verify all invariants requested by Architect:
    // a) Stale worker rejected with fence violation
    assert.equal(workerAError, "STALE_WORKER_FENCE_VIOLATION");

    // b) No Customer is created or updated
    const customer = await db.customer.findFirst({
      where: { clientId: testClientA, phone: "919111223344" },
    });
    assert.equal(customer, null, "No customer record must be created by stale worker");

    // c) No staging record is marked committed
    const freshStaging = await db.importStagingRecord.findUniqueOrThrow({ where: { id: staging.id } });
    assert.equal(freshStaging.reviewStatus, "PENDING", "Staging record must remain PENDING");
    assert.equal(freshStaging.committedAt, null, "committedAt must remain null");

    // d) Worker B active lease remains untouched
    const freshBatch = await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    assert.equal(freshBatch.status, "COMMITTING", "Batch must remain in COMMITTING status");
    assert.equal(freshBatch.workerLeaseToken, "worker-b-active-token", "Worker B lease must remain active");
    assert.equal(freshBatch.workerFenceVersion, 3, "workerFenceVersion must remain 3");
  });
});
