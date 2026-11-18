import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { startRun } from "../../src/lib/dispatcher";

describe("Campaign Capacity & High-Volume Chunking Benchmark (Phase 5)", () => {
  let clientId: string;
  let templateId: string;
  const realFetch = globalThis.fetch;

  before(async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ messages: [{ id: `wamid.capacity_${Date.now()}` }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await db.setting.upsert({ where: { id: 1 }, update: { provider: "META" }, create: { id: 1, provider: "META" } });

    const client = await db.client.create({
      data: {
        name: `Capacity_Tenant_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_capacity_token",
        waPhoneNumberId: "phone_id_capacity",
        waBusinessAccountId: "waba_id_capacity",
      },
    });
    clientId = client.id;

    await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Capacity Number",
        phoneNumberId: "phone_id_capacity",
        businessAccountId: "waba_id_capacity",
        token: "EAAX_capacity_token",
        isDefault: true,
        qualityRating: "GREEN",
        messagingTier: "TIER_UNLIMITED",
      },
    });

    const tpl = await db.template.create({
      data: {
        clientId,
        name: `capacity_promo_${Date.now()}`,
        category: "MARKETING",
        status: "APPROVED",
        language: "en",
        body: "Capacity test announcement!",
      },
    });
    templateId = tpl.id;
  });

  after(async () => {
    globalThis.fetch = realFetch;
    await db.message.deleteMany({ where: { customer: { clientId } } });
    await db.campaignRun.deleteMany({ where: { campaign: { clientId } } });
    await db.campaign.deleteMany({ where: { clientId } });
    await db.template.deleteMany({ where: { clientId } });
    await db.customer.deleteMany({ where: { clientId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
  });

  test("1. Benchmark: 2,000 recipients (1 chunk of 2,000)", async () => {
    const BATCH = 2000;
    const now = new Date();
    const optInAt = new Date();

    // Create 2,000 customers with valid marketing consent
    const customersData = Array.from({ length: BATCH }, (_, i) => ({
      clientId,
      name: `Cap Buyer 2k-${i}`,
      phone: `+91910000${String(i).padStart(4, "0")}`,
      optInAt,
      optInSource: "Store Buyer",
    }));

    await db.customer.createMany({ data: customersData });

    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Capacity 2K Run",
        templateId,
        scheduleType: "ONCE",
        sendTime: "10:00",
        active: true,
        batchSize: 100,
        intervalMinutes: 10,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    const run = await startRun(campaign, now);

    const durationMs = Math.round(performance.now() - start);
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024);

    assert.equal(run.total, BATCH, "Must queue exactly 2,000 recipients");
    const count = await db.message.count({ where: { runId: run.id } });
    assert.equal(count, BATCH, "Must create exactly 2,000 message records");

    // Verify duplicate count
    const duplicates = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM (
        SELECT "customerId" FROM "Message" WHERE "runId" = ${run.id} GROUP BY "customerId" HAVING count(*) > 1
      ) dupes
    `;
    assert.equal(Number(duplicates[0]?.count || 0), 0, "Zero duplicate messages in 2K run");

    console.log(`[CAPACITY EVIDENCE] 2,000 recipients: duration=${durationMs}ms, memoryDelta=${memDeltaMb}MB, duplicates=0`);
  });

  test("2. Benchmark: 10,000 recipients (5 chunks of 2,000)", async () => {
    const TARGET = 10000;
    const existing = await db.customer.count({ where: { clientId } });
    const needed = TARGET - existing;

    const optInAt = new Date();
    // Insert remaining 8,000 customers in chunks of 2,000 to avoid query param limit
    for (let c = 0; c < needed; c += 2000) {
      const sliceSize = Math.min(2000, needed - c);
      const data = Array.from({ length: sliceSize }, (_, i) => ({
        clientId,
        name: `Cap Buyer 10k-${existing + c + i}`,
        phone: `+91920000${String(existing + c + i).padStart(4, "0")}`,
        optInAt,
        optInSource: "Store Buyer",
      }));
      await db.customer.createMany({ data });
    }

    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Capacity 10K Run",
        templateId,
        scheduleType: "ONCE",
        sendTime: "11:00",
        active: true,
        batchSize: 100,
        intervalMinutes: 10,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    const run = await startRun(campaign, new Date());

    const durationMs = Math.round(performance.now() - start);
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024);

    assert.equal(run.total, TARGET, "Must queue exactly 10,000 recipients");
    const count = await db.message.count({ where: { runId: run.id } });
    assert.equal(count, TARGET, "Must create exactly 10,000 message records");

    const duplicates = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM (
        SELECT "customerId" FROM "Message" WHERE "runId" = ${run.id} GROUP BY "customerId" HAVING count(*) > 1
      ) dupes
    `;
    assert.equal(Number(duplicates[0]?.count || 0), 0, "Zero duplicate messages in 10K run");

    console.log(`[CAPACITY EVIDENCE] 10,000 recipients: duration=${durationMs}ms, memoryDelta=${memDeltaMb}MB, chunks=5, duplicates=0`);
  });

  test("3. Benchmark: 50,000 recipients (25 chunks of 2,000 within 60s transaction)", async () => {
    const TARGET = 50000;
    const existing = await db.customer.count({ where: { clientId } });
    const needed = TARGET - existing;

    const optInAt = new Date();
    // Insert remaining customers in chunks of 5,000
    for (let c = 0; c < needed; c += 5000) {
      const sliceSize = Math.min(5000, needed - c);
      const data = Array.from({ length: sliceSize }, (_, i) => ({
        clientId,
        name: `Cap Buyer 50k-${existing + c + i}`,
        phone: `+91930000${String(existing + c + i).padStart(6, "0")}`,
        optInAt,
        optInSource: "Store Buyer",
      }));
      await db.customer.createMany({ data });
    }

    const campaign = await db.campaign.create({
      data: {
        clientId,
        name: "Capacity 50K Run",
        templateId,
        scheduleType: "ONCE",
        sendTime: "12:00",
        active: true,
        batchSize: 100,
        intervalMinutes: 10,
      },
      include: { template: { select: { name: true, category: true } } },
    });

    const memBefore = process.memoryUsage().heapUsed;
    const start = performance.now();

    const run = await startRun(campaign, new Date());

    const durationMs = Math.round(performance.now() - start);
    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = Math.round((memAfter - memBefore) / 1024 / 1024);

    assert.equal(run.total, TARGET, "Must queue exactly 50,000 recipients");
    const count = await db.message.count({ where: { runId: run.id } });
    assert.equal(count, TARGET, "Must create exactly 50,000 message records");

    // Check transaction safety: execution must finish well within 60,000ms timeout
    assert.ok(durationMs < 60000, `Execution (${durationMs}ms) must complete within 60s transaction timeout`);

    const duplicates = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM (
        SELECT "customerId" FROM "Message" WHERE "runId" = ${run.id} GROUP BY "customerId" HAVING count(*) > 1
      ) dupes
    `;
    assert.equal(Number(duplicates[0]?.count || 0), 0, "Zero duplicate messages in 50K run");

    console.log(`[CAPACITY EVIDENCE] 50,000 recipients: duration=${durationMs}ms, memoryDelta=${memDeltaMb}MB, chunks=25, duplicates=0`);
  });
});
