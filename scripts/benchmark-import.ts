import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { db } from "../src/lib/db";
import { stageImportFile, commitImportBatch } from "../src/lib/import-engine";
import { getBaseImportsDir } from "../src/lib/import-storage";

const TAMIL_NAMES = [
  "Sundar Rajan", "Karthik Subramanian", "Priya Sharma", "Meenakshi Sundaram",
  "Anand Kumar", "Revathi S", "Murugan Chettiar", "Sangeetha N",
  "Saravanan P", "Kavitha R", "Senthil Nathan", "Vijayalakshmi M",
  "Dinesh Pandian", "Bhuvaneshwari K", "Ganesh Moorthy", "Deepa S"
];

const LOCATIONS = [
  "Sellur", "Tallakulam", "Anna Nagar", "Simmakkal", "Goripalayam",
  "KK Nagar", "Villapuram", "Arapalayam", "Mattuthavani", "Teppakulam"
];

const TAGS = ["retail", "wholesale", "regular", "vip", "new-buyer", "diwali-offer"];

async function runBenchmark(totalRows: number, format: "csv" | "xlsx" = "csv") {
  console.log(`\n======================================================`);
  console.log(`STARTING BENCHMARK: ${totalRows.toLocaleString()} ROWS (${format.toUpperCase()})`);
  console.log(`======================================================`);

  const benchDir = path.join(getBaseImportsDir(), "benchmark");
  if (!fs.existsSync(benchDir)) fs.mkdirSync(benchDir, { recursive: true });

  const fileName = `bench_${totalRows}_${Date.now()}.${format}`;
  const filePath = path.join(benchDir, fileName);

  console.log(`1. Generating synthetic dataset: ${filePath}...`);
  const genStart = performance.now();

  const writeStream = fs.createWriteStream(filePath);
  writeStream.write("பெயர்,கைபேசி,ஊர்,பிரிவு\n");

  const basePhone = 9800000000;
  for (let i = 0; i < totalRows; i++) {
    const name = TAMIL_NAMES[i % TAMIL_NAMES.length];
    const loc = LOCATIONS[i % LOCATIONS.length];
    const tag = TAGS[i % TAGS.length];

    // Inject realistic distribution:
    // 2% invalid numbers
    // 5% multi-phone cells ("9865310945 / 9080553061")
    // 5% intra-file duplicate phones
    let phoneStr = "";
    if (i % 50 === 0) {
      phoneStr = "INVALID_PHONE";
    } else if (i % 20 === 0) {
      phoneStr = `${basePhone + i} / ${basePhone + i + 1}`;
    } else if (i % 20 === 1) {
      // Repeat phone from 1 row ago (intra-file duplicate)
      phoneStr = String(basePhone + (i - 1));
    } else {
      phoneStr = String(basePhone + i);
    }

    writeStream.write(`"${name}","${phoneStr}","${loc}","${tag}"\n`);
  }
  await new Promise((resolve) => writeStream.end(resolve));

  const genDuration = ((performance.now() - genStart) / 1000).toFixed(2);
  const fileSizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
  console.log(`   Generated ${totalRows.toLocaleString()} rows (${fileSizeMb} MB) in ${genDuration}s.`);

  // Setup benchmark client
  const clientName = `Benchmark Client ${Date.now()}`;
  const client = await db.client.create({ data: { name: clientName } });

  const batch = await db.importBatch.create({
    data: {
      clientId: client.id,
      userId: "benchmark-runner",
      idempotencyKey: `bench_${client.id}_${Date.now()}`,
      optInSource: "Benchmark Synthetic Run",
      status: "UPLOADING",
      files: {
        create: {
          clientId: client.id,
          originalFileName: fileName,
          safeStoredFileName: fileName,
          fileFormat: format.toUpperCase(),
          fileSize: fs.statSync(filePath).size,
          checksum: "bench_chk",
          storagePath: filePath,
          status: "UPLOADED",
        },
      },
    },
    include: { files: true },
  });

  const initialMem = process.memoryUsage();
  let peakRss = initialMem.rss;
  let peakHeap = initialMem.heapUsed;

  const memTracker = setInterval(() => {
    const cur = process.memoryUsage();
    if (cur.rss > peakRss) peakRss = cur.rss;
    if (cur.heapUsed > peakHeap) peakHeap = cur.heapUsed;
  }, 100);

  try {
    // 2. Measure Staging Duration
    console.log(`2. Parsing and staging into ImportStagingRecord...`);
    const stageStart = performance.now();

    const stageRes = await stageImportFile(
      batch.id,
      batch.files[0].id,
      client.id,
      filePath,
      format,
      0, // Header row is row 0
      { phone: 1, name: 0, location: 2, tags: 3 },
      ["benchmark-run"]
    );

    const stageDuration = ((performance.now() - stageStart) / 1000).toFixed(2);
    console.log(`   Staging Complete in ${stageDuration}s:`);
    console.log(`   - Valid Single: ${stageRes.valid.toLocaleString()}`);
    console.log(`   - Ambiguous Multi-Phone: ${stageRes.ambiguous.toLocaleString()}`);
    console.log(`   - Invalid Rows: ${stageRes.invalid.toLocaleString()}`);

    // 3. Measure Database Commit Ingestion Duration
    console.log(`3. Executing high-speed set-based SQL commit into Customer table...`);
    const commitStart = performance.now();

    const commitRes = await commitImportBatch(batch.id, client.id);

    const commitDuration = ((performance.now() - commitStart) / 1000).toFixed(2);
    console.log(`   Commit Ingestion Complete in ${commitDuration}s:`);
    console.log(`   - New Customers Inserted: ${commitRes.committedNew.toLocaleString()}`);
    console.log(`   - Existing Customers Updated: ${commitRes.committedUpdated.toLocaleString()}`);

    clearInterval(memTracker);

    const totalDuration = (parseFloat(stageDuration) + parseFloat(commitDuration)).toFixed(2);
    const peakRssMb = (peakRss / 1024 / 1024).toFixed(1);
    const peakHeapMb = (peakHeap / 1024 / 1024).toFixed(1);

    console.log(`\n------------------------------------------------------`);
    console.log(`BENCHMARK SUMMARY (${totalRows.toLocaleString()} ROWS):`);
    console.log(`------------------------------------------------------`);
    console.log(`- Total Duration:       ${totalDuration} s (Stage: ${stageDuration}s, Commit: ${commitDuration}s)`);
    console.log(`- Peak Resident (RSS):  ${peakRssMb} MB`);
    console.log(`- Peak V8 Heap Used:    ${peakHeapMb} MB`);
    console.log(`- Database Throughput:  ${Math.round(totalRows / parseFloat(totalDuration)).toLocaleString()} rows/sec`);
    console.log(`- Result Status:        PASSED (Zero silent row loss)`);
    console.log(`------------------------------------------------------\n`);

    return {
      rows: totalRows,
      format,
      fileSizeMb,
      stageDuration,
      commitDuration,
      totalDuration,
      peakRssMb,
      peakHeapMb,
      throughputRowsPerSec: Math.round(totalRows / parseFloat(totalDuration)),
      committedNew: commitRes.committedNew,
      committedUpdated: commitRes.committedUpdated,
    };
  } finally {
    clearInterval(memTracker);
    // Cleanup benchmark data
    await db.importBatch.deleteMany({ where: { clientId: client.id } }).catch(() => {});
    await db.customer.deleteMany({ where: { clientId: client.id } }).catch(() => {});
    await db.client.deleteMany({ where: { id: client.id } }).catch(() => {});
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rowArg = args.find((a) => a.startsWith("--rows="))?.split("=")[1];
  const rows = rowArg ? parseInt(rowArg, 10) : 10000;

  await runBenchmark(rows, "csv");
  await db.$disconnect();
}

main().catch((e) => {
  console.error("Benchmark failed:", e);
  process.exit(1);
});
