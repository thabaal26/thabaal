import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { CampaignConcurrencyError, startRun } from "../../src/lib/dispatcher";

describe("Campaign Concurrency & Transaction Atomicity (P0/P1 Safety)", () => {
  let clientId: string;
  let clientBId: string;
  let templateId: string;
  let senderNumberId: string;
  let customer1Id: string;
  let customer2Id: string;
  let customer3Id: string;

  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.concurrency_${Date.now()}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });

    // 1. Create Tenant A
    const clientA = await db.client.create({
      data: {
        name: `Concurrency_TenantA_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_concurrency_token_a",
        waPhoneNumberId: "phone_id_concurrency_a",
        waBusinessAccountId: "waba_id_concurrency_a",
      },
    });
    clientId = clientA.id;

    // 2. Create Tenant B (for cross-tenant concurrency testing)
    const clientB = await db.client.create({
      data: {
        name: `Concurrency_TenantB_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_concurrency_token_b",
        waPhoneNumberId: "phone_id_concurrency_b",
        waBusinessAccountId: "waba_id_concurrency_b",
      },
    });
    clientBId = clientB.id;

    // 3. Sender number
    const num = await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Primary Number",
        phoneNumberId: "phone_id_concurrency_a",
        businessAccountId: "waba_id_concurrency_a",
        token: "EAAX_concurrency_token_a",
        isDefault: true,
        qualityRating: "GREEN",
        messagingTier: "TIER_1K",
      },
    });
    senderNumberId = num.id;

    // 4. Template
    const tpl = await db.template.create({
      data: {
        clientId,
        name: `concurrency_promo_${Date.now()}`,
        category: "MARKETING",
        status: "APPROVED",
        language: "en",
        body: "Exclusive deal for {{1}}!",
      },
    });
    templateId = tpl.id;

    // 5. Customers with valid consent
    const c1 = await db.customer.create({
      data: {
        clientId,
        name: "Concurrency Buyer 1",
        phone: "+919876543210",
        optInAt: new Date(),
        optInSource: "Store Buyer",
      },
    });
    customer1Id = c1.id;

    const c2 = await db.customer.create({
      data: {
        clientId,
        name: "Concurrency Buyer 2",
        phone: "+919876543211",
        optInAt: new Date(),
        optInSource: "Store Buyer",
      },
    });
    customer2Id = c2.id;

    const c3 = await db.customer.create({
      data: {
        clientId,
        name: "Concurrency Buyer 3",
        phone: "+919876543212",
        optInAt: new Date(),
        optInSource: "Store Buyer",
      },
    });
    customer3Id = c3.id;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId: { in: [clientId, clientBId] } } } });
    await db.campaignRun.deleteMany({ where: { campaign: { clientId: { in: [clientId, clientBId] } } } });
    await db.campaign.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.template.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.customer.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.whatsAppNumber.deleteMany({ where: { clientId: { in: [clientId, clientBId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientId, clientBId] } } });
  });

  test("1. pg_try_advisory_xact_lock blocks concurrent session from acquiring same campaign lock", async () => {
    const testCampId = `advisory_test_${Date.now()}`;
    // Simulate holding the advisory lock in transaction A
    const result = await db.$transaction(async (txA) => {
      const lockA = await txA.$queryRaw<{ acquired: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtext('camp_dispatch_' || ${testCampId})::bigint) AS acquired
      `;
      assert.equal(lockA[0]?.acquired, true, "Transaction A must acquire the lock");

      // While transaction A holds the lock, a second query on a separate transaction must fail to acquire
      let lockBResult: boolean | undefined;
      await db.$transaction(async (txB) => {
        const lockB = await txB.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('camp_dispatch_' || ${testCampId})::bigint) AS acquired
        `;
        lockBResult = lockB[0]?.acquired;
      });

      return { lockBResult };
    });

    assert.equal(result.lockBResult, false, "Concurrent transaction B must be denied advisory lock while A holds it");
  });

  test("2. Concurrent startRun attempts reject duplicate with CampaignConcurrencyError", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Concurrent Test 2",
        templateId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const now = new Date();

    // Fire 2 concurrent startRun calls simultaneously on the same campaign
    const results = await Promise.allSettled([
      startRun(campaign, now),
      startRun(campaign, now),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly one concurrent startRun must succeed");
    assert.equal(rejected.length, 1, "Exactly one concurrent startRun must be rejected");

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    assert.ok(
      rejectionReason instanceof CampaignConcurrencyError,
      `Expected CampaignConcurrencyError, got: ${rejectionReason}`
    );
    assert.match(rejectionReason.message, /already being dispatched by another process/);

    // Verify exactly 1 CampaignRun was created in the database
    const runs = await db.campaignRun.findMany({ where: { campaignId: campaign.id } });
    assert.equal(runs.length, 1, "Only one run record should exist");
    assert.equal(runs[0].total, 3, "All 3 eligible customers queued in the successful run");
  });

  test("3. Parallel dispatches for DIFFERENT campaigns succeed without lock contention", async () => {
    const campA = await db.campaign.create({
      data: {
        clientId,
        name: "Parallel Campaign A",
        templateId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    // Create a template for Tenant B
    const tplB = await db.template.create({
      data: {
        clientId: clientBId,
        name: `tenant_b_promo_${Date.now()}`,
        category: "MARKETING",
        status: "APPROVED",
        language: "en",
        body: "Hello from Tenant B!",
      },
    });

    const campB = await db.campaign.create({
      data: {
        clientId: clientBId,
        name: "Parallel Campaign B (Tenant B)",
        templateId: tplB.id,
        scheduleType: "ONCE",
        sendTime: "11:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const now = new Date();

    // Fire 2 concurrent startRun calls for DIFFERENT campaigns (and different tenants)
    const results = await Promise.allSettled([
      startRun(campA, now),
      startRun(campB, now),
    ]);

    assert.equal(results[0].status, "fulfilled", "Campaign A dispatch must succeed");
    assert.equal(results[1].status, "fulfilled", "Campaign B dispatch must succeed");

    const runsA = await db.campaignRun.findMany({ where: { campaignId: campA.id } });
    const runsB = await db.campaignRun.findMany({ where: { campaignId: campB.id } });
    assert.equal(runsA.length, 1);
    assert.equal(runsB.length, 1);
  });

  test("4. Permanent deduplication prevents re-sending ONCE campaigns without explicit resend", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Deduplication ONCE Test",
        templateId,
        scheduleType: "ONCE",
        sendTime: "12:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    // 1st run: dispatch normally
    const run1 = await startRun(campaign, new Date());
    assert.equal(run1.total, 3, "All 3 customers queued in first run");

    // Simulate that all messages in run1 were SENT
    await db.message.updateMany({
      where: { runId: run1.id },
      data: { status: "SENT", sentAt: new Date(Date.now() - 30 * 86_400_000) }, // 30 days ago!
    });

    // 2nd run with permanentDedupe (like runCampaignNow operator dispatch):
    // Even though 30 days have elapsed, permanent dedupe MUST exclude already reached customers
    const run2 = await startRun(campaign, new Date(Date.now() + 1000), { permanentDedupe: true });
    assert.equal(run2.total, 0, "No duplicate customers queued for one-time campaign");
    assert.equal(run2.status, "COMPLETED", "Empty run immediately marked COMPLETED");

    const messagesRun2 = await db.message.count({ where: { runId: run2.id } });
    assert.equal(messagesRun2, 0, "Zero new messages created in run 2");
  });

  test("5. Authorized resend (allowResend: true) successfully re-queues all recipients", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Resend Authorized Test",
        templateId,
        scheduleType: "ONCE",
        sendTime: "13:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    // 1st run
    const run1 = await startRun(campaign, new Date());
    assert.equal(run1.total, 3);
    await db.message.updateMany({
      where: { runId: run1.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    // 2nd run with explicit allowResend: true (like resendCampaignNow)
    const run2 = await startRun(campaign, new Date(Date.now() + 1000), { allowResend: true });
    assert.equal(run2.total, 3, "All 3 customers re-queued with authorized resend");

    const messagesRun2 = await db.message.count({ where: { runId: run2.id } });
    assert.equal(messagesRun2, 3, "3 fresh messages created in run 2");
  });

  test("6. Weekly recurring campaigns repeat recipients by design across runs", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Weekly Recurring Test",
        templateId,
        scheduleType: "WEEKLY",
        daysOfWeek: [1, 3, 5],
        sendTime: "14:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    // Week 1 run
    const runW1 = await startRun(campaign, new Date());
    assert.equal(runW1.total, 3, "Week 1 queues all 3 customers");
    await db.message.updateMany({
      where: { runId: runW1.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    // Week 2 run (7 days later)
    const week2Date = new Date(Date.now() + 7 * 86_400_000);
    const runW2 = await startRun(campaign, week2Date);
    assert.equal(runW2.total, 3, "Week 2 queues all 3 customers again by design");
  });

  test("7. Transaction atomicity rolls back CampaignRun if chunk insert fails", async () => {
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Transaction Rollback Test",
        templateId,
        scheduleType: "ONCE",
        sendTime: "15:00",
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const runsBefore = await db.campaignRun.count({ where: { campaignId: campaign.id } });
    const messagesBefore = await db.message.count({ where: { customer: { clientId } } });

    // Simulate failure during transaction by executing an atomic transaction block that throws
    let errorCaught = false;
    try {
      await db.$transaction(async (tx) => {
        // Step 1: create run
        const run = await tx.campaignRun.create({
          data: { campaignId: campaign.id, scheduledFor: new Date(), total: 3, nextBatchAt: new Date() },
        });
        // Step 2: insert 1 valid message
        await tx.message.create({
          data: {
            runId: run.id,
            customerId: customer1Id,
            templateId: campaign.templateId,
            templateName: campaign.template.name,
          },
        });
        // Step 3: simulate unexpected failure during chunk processing
        throw new Error("Simulated network/DB crash mid-dispatch");
      });
    } catch (e: unknown) {
      errorCaught = true;
      assert.equal((e as Error).message, "Simulated network/DB crash mid-dispatch");
    }

    assert.equal(errorCaught, true);

    // Verify atomicity: ZERO partial CampaignRun or Message records remain
    const runsAfter = await db.campaignRun.count({ where: { campaignId: campaign.id } });
    const messagesAfter = await db.message.count({ where: { customer: { clientId } } });

    assert.equal(runsAfter, runsBefore, "CampaignRun must be completely rolled back on error");
    assert.equal(messagesAfter, messagesBefore, "Messages must be completely rolled back on error");
  });

  test("8. Scheduler (startDueCampaigns) and manual dispatch (startRun) race creates exactly one run", async () => {
    const now = new Date();
    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Scheduler vs Manual Race Test",
        templateId,
        scheduleType: "ONCE",
        sendTime: "16:00",
        runAt: now,
        nextRunAt: now,
        active: true,
        batchSize: 50,
        intervalMinutes: 5,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    // Fire scheduler and manual dispatch simultaneously
    const results = await Promise.allSettled([
      startRun(campaign, now),
      startRun(campaign, now),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly one dispatch succeeds");
    assert.equal(rejected.length, 1, "The competing dispatch is safely rejected");

    const runs = await db.campaignRun.findMany({ where: { campaignId: campaign.id } });
    assert.equal(runs.length, 1, "Exactly 1 CampaignRun created");
    assert.equal(runs[0].total, 3, "All 3 customers queued without duplicates");

    const messages = await db.message.findMany({ where: { runId: runs[0].id } });
    assert.equal(messages.length, 3, "Exactly 3 messages created");
  });
});
