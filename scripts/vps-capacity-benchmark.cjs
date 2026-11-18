// Synthetic Capacity Benchmark script running directly on the Hostinger VPS
// Database: thabaal_bench (100% isolated database on VPS PostgreSQL)
const { performance } = require('node:perf_hooks');
const fs = require('node:fs');
const { PrismaClient } = require('/srv/thabaal/current/node_modules/@prisma/client');

// Read database URL from shared .env and point to thabaal_bench
const envText = fs.readFileSync('/srv/thabaal/shared/.env', 'utf8');
const match = envText.match(/^DATABASE_URL_UNPOOLED=(.*)$/m);
if (!match) throw new Error('DATABASE_URL_UNPOOLED not found');
const benchDbUrl = match[1].trim().replace(/^["']|["']$/g, '').replace(/\/thabaal(\?.*)?$/, '/thabaal_bench');

const prisma = new PrismaClient({
  datasources: { db: { url: benchDbUrl } },
});

async function runBenchmark() {
  console.log('================================================================================');
  console.log('THABAAL VPS CAPACITY BENCHMARK — HOSTINGER VPS (UBUNTU 22.04, 4 GB RAM, 1 CPU)');
  console.log('Database: thabaal_bench (Isolated) | Chunk Size: 2,000 rows/batch');
  console.log('================================================================================\n');

  let clientId = '';
  let templateId = '';

  try {
    // 1. Setup benchmark tenant
    await prisma.setting.upsert({
      where: { id: 1 },
      update: { provider: 'META' },
      create: { id: 1, provider: 'META' },
    });

    const client = await prisma.client.create({
      data: {
        name: `VPS_Bench_Tenant_${Date.now()}`,
        workspaceMode: 'LIVE_ACTIVE',
        planRequired: false,
        waToken: 'EAAX_vps_bench_token',
        waPhoneNumberId: 'phone_vps_bench',
        waBusinessAccountId: 'waba_vps_bench',
      },
    });
    clientId = client.id;

    await prisma.whatsAppNumber.create({
      data: {
        clientId,
        label: 'VPS Benchmark Number',
        phoneNumberId: 'phone_vps_bench',
        businessAccountId: 'waba_vps_bench',
        token: 'EAAX_vps_bench_token',
        isDefault: true,
        qualityRating: 'GREEN',
        messagingTier: 'TIER_UNLIMITED',
      },
    });

    const tpl = await prisma.template.create({
      data: {
        clientId,
        name: `vps_bench_promo_${Date.now()}`,
        category: 'MARKETING',
        status: 'APPROVED',
        language: 'en',
        body: 'VPS Capacity benchmark announcement message',
      },
    });
    templateId = tpl.id;

    console.log(`[SETUP] Benchmark tenant initialized (clientId=${clientId})`);

    const SCALES = [2000, 10000, 50000, 100000, 200000];
    const results = [];
    let currentCustomerCount = 0;

    for (const scale of SCALES) {
      console.log(`\n--------------------------------------------------------------------------------`);
      console.log(`>>> BENCHMARKING SCALE ON VPS: ${scale.toLocaleString()} RECIPIENTS`);
      console.log(`--------------------------------------------------------------------------------`);

      // Seed synthetic customers up to scale
      const needed = scale - currentCustomerCount;
      if (needed > 0) {
        process.stdout.write(`Seeding ${needed.toLocaleString()} synthetic customers in 5,000-row chunks... `);
        const seedStart = performance.now();
        const SEED_CHUNK = 5000;
        const optInAt = new Date();

        for (let offset = 0; offset < needed; offset += SEED_CHUNK) {
          const chunkSize = Math.min(SEED_CHUNK, needed - offset);
          const chunkData = Array.from({ length: chunkSize }, (_, i) => {
            const idx = currentCustomerCount + offset + i;
            return {
              clientId,
              name: `VPS Synthetic Buyer ${idx}`,
              phone: `+919900${String(idx).padStart(6, '0')}`,
              optInAt,
              optInSource: 'Store Buyer',
            };
          });
          await prisma.customer.createMany({ data: chunkData });
        }
        currentCustomerCount = scale;
        const seedDuration = ((performance.now() - seedStart) / 1000).toFixed(2);
        console.log(`Done in ${seedDuration}s. Total customers: ${scale.toLocaleString()}`);
      }

      // Create campaign
      const campaign = await prisma.campaign.create({
        data: {
          clientId,
          name: `VPS Capacity ${scale.toLocaleString()}`,
          templateId,
          scheduleType: 'ONCE',
          sendTime: '12:00',
          active: true,
          batchSize: 100,
          intervalMinutes: 10,
        },
      });

      if (global.gc) global.gc();

      const memBefore = process.memoryUsage();
      const cpuBefore = process.cpuUsage();
      const benchStart = performance.now();

      // Execute startRun transaction with advisory lock and chunked batching
      const run = await prisma.$transaction(
        async (tx) => {
          // 1. Transaction-scoped advisory lock
          const lock = await tx.$queryRaw`
            SELECT pg_try_advisory_xact_lock(hashtext('camp_dispatch_' || ${campaign.id})::bigint) AS acquired
          `;
          if (!lock[0]?.acquired) {
            throw new Error('Lock acquisition failed');
          }

          // 2. Query eligible customers
          const customers = await tx.customer.findMany({
            where: { clientId, optedOut: false, unreachable: false, deletedAt: null },
            select: { id: true, phone: true },
          });

          // 3. Deduplicate
          const seen = new Set();
          const unique = [];
          for (const c of customers) {
            if (c.phone && !seen.has(c.phone)) {
              seen.add(c.phone);
              unique.push(c);
            }
          }

          // 4. Create CampaignRun
          const scheduledFor = new Date();
          const r = await tx.campaignRun.create({
            data: { campaignId: campaign.id, scheduledFor, total: unique.length, nextBatchAt: new Date() },
          });

          // 5. Chunked insertion into batches of 2,000
          const CHUNK_SIZE = 2000;
          for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
            const chunk = unique.slice(i, i + CHUNK_SIZE);
            await tx.message.createMany({
              data: chunk.map((c) => ({
                runId: r.id,
                customerId: c.id,
                templateId,
                templateName: 'vps_bench_promo',
              })),
            });
          }
          return r;
        },
        { maxWait: 5000, timeout: 60000 }
      );

      const benchEnd = performance.now();
      const memAfter = process.memoryUsage();
      const cpuUsage = process.cpuUsage(cpuBefore);

      const durationMs = Math.round(benchEnd - benchStart);
      const durationSec = Number((durationMs / 1000).toFixed(2));
      const throughputRowsPerSec = Math.round(scale / (durationMs / 1000));
      const memDeltaMb = Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);
      const rssDeltaMb = Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024);
      const heapUsedMb = Math.round(memAfter.heapUsed / 1024 / 1024);
      const cpuUserMs = Math.round(cpuUsage.user / 1000);
      const cpuSysMs = Math.round(cpuUsage.system / 1000);

      // Verify row counts and duplicate detection
      const messageCount = await prisma.message.count({ where: { runId: run.id } });
      const duplicateRows = await prisma.$queryRaw`
        SELECT count(*) FROM (
          SELECT "customerId" FROM "Message" WHERE "runId" = ${run.id} GROUP BY "customerId" HAVING count(*) > 1
        ) dupes
      `;
      const duplicates = Number(duplicateRows[0]?.count || 0);
      const pass = durationMs < 60000 && messageCount === scale && duplicates === 0;

      const res = {
        scale,
        durationMs,
        durationSec,
        throughputRowsPerSec,
        memDeltaMb,
        rssDeltaMb,
        heapUsedMb,
        cpuMs: cpuUserMs + cpuSysMs,
        duplicates,
        status: pass ? 'PASS' : 'FAIL',
      };
      results.push(res);

      console.log(`Scale: ${scale.toLocaleString()} recipients on VPS`);
      console.log(`  Duration: ${durationMs} ms (${durationSec} s) | Throughput: ${throughputRowsPerSec.toLocaleString()} rows/sec`);
      console.log(`  Memory: Heap Delta=${memDeltaMb >= 0 ? '+' : ''}${memDeltaMb}MB (Current: ${heapUsedMb}MB) | RSS Delta=${rssDeltaMb >= 0 ? '+' : ''}${rssDeltaMb}MB`);
      console.log(`  CPU Time: ${(cpuUserMs + cpuSysMs)} ms (User: ${cpuUserMs}ms, System: ${cpuSysMs}ms)`);
      console.log(`  Messages Created: ${messageCount} | Duplicates: ${duplicates}`);
      console.log(`  Status: ${res.status}`);

      // Clean up messages and run to keep thabaal_bench compact
      await prisma.message.deleteMany({ where: { runId: run.id } });
      await prisma.campaignRun.delete({ where: { id: run.id } });
      await prisma.campaign.delete({ where: { id: campaign.id } });
    }

    console.log('\n================================================================================');
    console.log('HOSTINGER VPS (1 CPU, 4 GB RAM) CAPACITY BENCHMARK SUMMARY TABLE');
    console.log('================================================================================');
    console.log('| Scale     | Chunks (2k) | Duration | Throughput      | Heap Delta | RSS Delta | CPU Time | Status |');
    console.log('|-----------|-------------|----------|-----------------|------------|-----------|----------|--------|');
    for (const r of results) {
      const chunks = r.scale / 2000;
      console.log(
        `| ${String(r.scale.toLocaleString()).padEnd(9)} | ` +
        `${String(chunks).padEnd(11)} | ` +
        `${String(r.durationSec + 's').padEnd(8)} | ` +
        `${String(r.throughputRowsPerSec.toLocaleString() + ' rows/s').padEnd(15)} | ` +
        `${String((r.memDeltaMb >= 0 ? '+' : '') + r.memDeltaMb + ' MB').padEnd(10)} | ` +
        `${String((r.rssDeltaMb >= 0 ? '+' : '') + r.rssDeltaMb + ' MB').padEnd(9)} | ` +
        `${String(r.cpuMs + ' ms').padEnd(8)} | ` +
        `${r.status.padEnd(6)} |`
      );
    }
    console.log('================================================================================');

    const res200k = results.find((r) => r.scale === 200000);
    if (res200k) {
      console.log('\nCRITERIA EVALUATION (200,000 Recipients ON HOSTINGER VPS):');
      console.log(`- Transaction Duration: ${res200k.durationSec}s (< 45s threshold, < 60s timeout) => ${res200k.durationSec < 45 ? 'MET' : 'EXCEEDED'}`);
      console.log(`- RSS Memory Delta: ${res200k.rssDeltaMb} MB (< 512 MB threshold) => ${res200k.rssDeltaMb < 512 ? 'MET' : 'EXCEEDED'}`);
      console.log(`- Duplicates: ${res200k.duplicates} (== 0) => ${res200k.duplicates === 0 ? 'MET' : 'FAILED'}`);
    }
  } catch (err) {
    console.error('[VPS BENCHMARK ERROR]', err);
    process.exit(1);
  } finally {
    if (clientId) {
      console.log('\nCleaning up VPS benchmark tenant...');
      await prisma.message.deleteMany({ where: { customer: { clientId } } }).catch(() => {});
      await prisma.campaignRun.deleteMany({ where: { campaign: { clientId } } }).catch(() => {});
      await prisma.campaign.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.template.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.whatsAppNumber.deleteMany({ where: { clientId } }).catch(() => {});
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => {});
      console.log('Cleanup of benchmark tenant complete.');
    }
    await prisma.$disconnect();
  }
}

runBenchmark();
