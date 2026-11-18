import { performance } from "node:perf_hooks";
import { db } from "../src/lib/db";
import { startRun } from "../src/lib/dispatcher";

interface BenchmarkResult {
  scale: number;
  durationMs: number;
  durationSec: number;
  throughputRowsPerSec: number;
  memDeltaMb: number;
  rssDeltaMb: number;
  heapUsedMb: number;
  duplicates: number;
  status: "PASS" | "FAIL";
}

async function main() {
  console.log("================================================================================");
  console.log("THABAAL CAMPAIGN ENGINE — SYNTHETIC 200K CAPACITY BENCHMARK");
  console.log("Evaluating chunked insertion (2,000 rows/batch), transaction timing & memory");
  console.log("================================================================================\n");

  // Mock global fetch to prevent actual Meta Graph API calls during dispatcher runs
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ messages: [{ id: `wamid.bench_${Date.now()}` }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  let clientId = "";
  let templateId = "";

  try {
    // 1. Setup isolated benchmark tenant
    await db.setting.upsert({
      where: { id: 1 },
      update: { provider: "META" },
      create: { id: 1, provider: "META" },
    });

    const client = await db.client.create({
      data: {
        name: `Bench200k_Tenant_${Date.now()}`,
        workspaceMode: "LIVE_ACTIVE",
        planRequired: false,
        waToken: "EAAX_bench_token",
        waPhoneNumberId: "phone_id_bench",
        waBusinessAccountId: "waba_id_bench",
      },
    });
    clientId = client.id;

    await db.whatsAppNumber.create({
      data: {
        clientId,
        label: "Benchmark Number",
        phoneNumberId: "phone_id_bench",
        businessAccountId: "waba_id_bench",
        token: "EAAX_bench_token",
        isDefault: true,
        qualityRating: "GREEN",
        messagingTier: "TIER_UNLIMITED",
      },
    });

    const tpl = await db.template.create({
      data: {
        clientId,
        name: `bench_promo_${Date.now()}`,
        category: "MARKETING",
        status: "APPROVED",
        language: "en",
        body: "Exclusive Thabaal capacity benchmark test announcement!",
      },
    });
    templateId = tpl.id;

    console.log(`[SETUP] Benchmark tenant initialized (clientId=${clientId}, templateId=${templateId})`);

    const SCALES = [2000, 10000, 50000, 100000, 200000];
    const results: BenchmarkResult[] = [];

    let currentCustomerCount = 0;

    for (const scale of SCALES) {
      console.log(`\n--------------------------------------------------------------------------------`);
      console.log(`>>> BENCHMARKING SCALE: ${scale.toLocaleString()} RECIPIENTS`);
      console.log(`--------------------------------------------------------------------------------`);

      // Seed additional customers up to the target scale
      const needed = scale - currentCustomerCount;
      if (needed > 0) {
        console.log(`Seeding ${needed.toLocaleString()} synthetic customers in 5,000-row chunks...`);
        const seedStart = performance.now();
        const SEED_CHUNK = 5000;
        const optInAt = new Date();

        for (let offset = 0; offset < needed; offset += SEED_CHUNK) {
          const chunkSize = Math.min(SEED_CHUNK, needed - offset);
          const chunkData = Array.from({ length: chunkSize }, (_, i) => {
            const idx = currentCustomerCount + offset + i;
            return {
              clientId,
              name: `Benchmark Buyer ${idx}`,
              phone: `+919800${String(idx).padStart(6, "0")}`,
              optInAt,
              optInSource: "Store Buyer",
            };
          });
          await db.customer.createMany({ data: chunkData });
        }
        currentCustomerCount = scale;
        const seedDuration = ((performance.now() - seedStart) / 1000).toFixed(2);
        console.log(`Seeded ${needed.toLocaleString()} customers in ${seedDuration}s. Total customers: ${scale.toLocaleString()}`);
      }

      // Create campaign for this scale
      const campaign = await db.campaign.create({
        data: {
          clientId,
          name: `Capacity Run ${scale.toLocaleString()}`,
          templateId,
          scheduleType: "ONCE",
          sendTime: "12:00",
          active: true,
          batchSize: 100,
          intervalMinutes: 10,
        },
        include: { template: { select: { name: true, category: true } } },
      });

      if (global.gc) {
        global.gc();
      }

      const memBefore = process.memoryUsage();
      const benchStart = performance.now();

      // Execute startRun
      const run = await startRun(campaign, new Date());

      const benchEnd = performance.now();
      const memAfter = process.memoryUsage();

      const durationMs = Math.round(benchEnd - benchStart);
      const durationSec = Number((durationMs / 1000).toFixed(2));
      const throughputRowsPerSec = Math.round(scale / (durationMs / 1000));
      const memDeltaMb = Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);
      const rssDeltaMb = Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024);
      const heapUsedMb = Math.round(memAfter.heapUsed / 1024 / 1024);

      // Verify row counts
      const messageCount = await db.message.count({ where: { runId: run.id } });
      const duplicateRows = await db.$queryRaw<{ count: bigint }[]>`
        SELECT count(*) FROM (
          SELECT "customerId" FROM "Message" WHERE "runId" = ${run.id} GROUP BY "customerId" HAVING count(*) > 1
        ) dupes
      `;
      const duplicates = Number(duplicateRows[0]?.count || 0);

      const pass = durationMs < 60000 && messageCount === scale && duplicates === 0;

      const result: BenchmarkResult = {
        scale,
        durationMs,
        durationSec,
        throughputRowsPerSec,
        memDeltaMb,
        rssDeltaMb,
        heapUsedMb,
        duplicates,
        status: pass ? "PASS" : "FAIL",
      };
      results.push(result);

      console.log(`Scale: ${scale.toLocaleString()} recipients`);
      console.log(`  Duration: ${durationMs} ms (${durationSec} s)`);
      console.log(`  Throughput: ${throughputRowsPerSec.toLocaleString()} rows/sec`);
      console.log(`  Heap Delta: ${memDeltaMb >= 0 ? "+" : ""}${memDeltaMb} MB (Current Heap: ${heapUsedMb} MB)`);
      console.log(`  RSS Delta: ${rssDeltaMb >= 0 ? "+" : ""}${rssDeltaMb} MB`);
      console.log(`  Run Total: ${run.total} | Messages Created: ${messageCount} | Duplicates: ${duplicates}`);
      console.log(`  Status: ${result.status}`);

      // Clean up messages and campaign run to keep database compact for next scale
      await db.message.deleteMany({ where: { runId: run.id } });
      await db.campaignRun.delete({ where: { id: run.id } });
      await db.campaign.delete({ where: { id: campaign.id } });
    }

    console.log("\n================================================================================");
    console.log("FINAL BENCHMARK SUMMARY TABLE");
    console.log("================================================================================");
    console.log("| Scale     | Chunks (2k) | Duration | Throughput      | Heap Delta | RSS Delta | Status |");
    console.log("|-----------|-------------|----------|-----------------|------------|-----------|--------|");
    for (const r of results) {
      const chunks = r.scale / 2000;
      console.log(
        `| ${String(r.scale.toLocaleString()).padEnd(9)} | ` +
        `${String(chunks).padEnd(11)} | ` +
        `${String(r.durationSec + "s").padEnd(8)} | ` +
        `${String(r.throughputRowsPerSec.toLocaleString() + " rows/s").padEnd(15)} | ` +
        `${String((r.memDeltaMb >= 0 ? "+" : "") + r.memDeltaMb + " MB").padEnd(10)} | ` +
        `${String((r.rssDeltaMb >= 0 ? "+" : "") + r.rssDeltaMb + " MB").padEnd(9)} | ` +
        `${r.status.padEnd(6)} |`
      );
    }
    console.log("================================================================================");

    // Assert criteria
    const result200k = results.find((r) => r.scale === 200000);
    if (result200k) {
      console.log("\nCRITERIA EVALUATION (200,000 Recipients):");
      console.log(`- Transaction Duration: ${result200k.durationSec}s (< 45s threshold) => ${result200k.durationSec < 45 ? "MET" : "EXCEEDED"}`);
      console.log(`- Memory Delta: ${result200k.rssDeltaMb} MB (< 512 MB threshold) => ${result200k.rssDeltaMb < 512 ? "MET" : "EXCEEDED"}`);
      console.log(`- Duplicates: ${result200k.duplicates} (== 0) => ${result200k.duplicates === 0 ? "MET" : "FAILED"}`);
    }

  } catch (err) {
    console.error("[BENCHMARK FAILED]", err);
    process.exit(1);
  } finally {
    globalThis.fetch = originalFetch;
    if (clientId) {
      console.log("\nCleaning up benchmark tenant...");
      await db.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
      await db.campaignRun.deleteMany({ where: { campaign: { clientId } } }).catch(() => {});
      await db.campaign.deleteMany({ where: { clientId } }).catch(() => {});
      await db.template.deleteMany({ where: { clientId } }).catch(() => {});
      await db.customer.deleteMany({ where: { clientId } }).catch(() => {});
      await db.whatsAppNumber.deleteMany({ where: { clientId } }).catch(() => {});
      await db.client.deleteMany({ where: { id: clientId } }).catch(() => {});
      console.log("Cleanup complete.");
    }
    await db.$disconnect();
  }
}

main();
