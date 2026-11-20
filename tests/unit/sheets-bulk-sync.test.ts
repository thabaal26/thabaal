import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { syncCustomers } from "../../src/lib/sheets";
import { db } from "../../src/lib/db";

describe("Domain 6 Batch C: SHT-01 Google Sheets Chunked Bulk Sync Test Suite", () => {
  test("1. SHT-01 Bulk Sync: Processes 600 customer rows across chunk boundaries with high performance", async () => {
    const client = await db.client.create({ data: { name: `Bulk Sync Client ${Date.now()}` } });
    const basePhone = Math.floor(1000000 + Math.random() * 8000000);

    // Create 1 existing customer that should be updated
    const existingCust = await db.customer.create({
      data: {
        clientId: client.id,
        phone: `91981${basePhone}`,
        name: "Existing Name",
        tags: ["initial_tag"],
      },
    });

    // Generate 600 rows (exceeds 500 CHUNK_SIZE to test chunk boundary transition)
    // Row 0: Headers
    const rows: string[][] = [
      ["Phone", "Name", "Area", "Region", "Tags", "Buys", "OptOut"],
      // Row 1: update existing customer
      [`+91981${basePhone}`, "Updated Name", "Madurai City", "South Zone", "vip, bulk", "Sesame Oil", "no"],
    ];

    // Rows 2..600: new customers
    for (let i = 1; i <= 599; i++) {
      rows.push([
        `+91982${basePhone + i}`,
        `Customer ${i}`,
        `Area ${i % 10}`,
        `Zone ${i % 4}`,
        `tag_${i % 5}`,
        `Product ${i % 3}`,
        "no",
      ]);
    }

    // Add 2 invalid phone rows to test skipping
    rows.push(["", "Invalid Phone", "Nowhere", "", "", "", ""]);
    rows.push(["not-a-number", "Bad Phone", "Nowhere", "", "", "", ""]);

    // Add 1 duplicate phone within the same chunk (Chunk 1) to verify in-chunk deduplication
    rows.splice(5, 0, [
      `+91982${basePhone + 2}`,
      "Duplicate Within Same Chunk",
      "Dupe Area",
      "",
      "dupe_tag",
      "",
      "no",
    ]);

    const result = await syncCustomers(client.id, rows);

    // Assert summary counts:
    // 599 added, 1 updated (existingCust), 2 skipped (invalid phone).
    // The duplicate at index 5 is deduplicated within chunk 1.
    assert.match(result, /599 added/);
    assert.match(result, /1 updated/);
    assert.match(result, /2 skipped/);

    // Verify existing customer was updated with tag union
    const updated = await db.customer.findUnique({ where: { id: existingCust.id } });
    assert.equal(updated?.name, "Updated Name");
    assert.equal(updated?.location, "Madurai City");
    assert.equal(updated?.region, "South Zone");
    assert.equal(updated?.purchases, "Sesame Oil");
    assert.equal(updated?.tags.includes("initial_tag"), true, "Must retain existing tags");
    assert.equal(updated?.tags.includes("vip"), true, "Must merge new tags");
    assert.equal(updated?.tags.includes("bulk"), true, "Must merge new tags");

    // Verify total customer count in DB for this client
    const count = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(count, 600, "Must have exactly 600 total customers in database");

    // Clean up
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("2. SHT-01 Throws error if Phone column header is missing", async () => {
    const client = await db.client.create({ data: { name: `Missing Phone Col ${Date.now()}` } });
    const rows = [
      ["Customer Name", "Address", "Tags"],
      ["Ravi", "Chennai", "vip"],
    ];

    await assert.rejects(
      async () => {
        await syncCustomers(client.id, rows);
      },
      /Customers tab: add a column headed "Phone"/
    );

    await db.client.delete({ where: { id: client.id } });
  });

  test("3. SHT-01 Extended Scalability Benchmark: 20,000 records with chunking, memory telemetry & idempotent re-import", async () => {
    const client = await db.client.create({ data: { name: `Benchmark 20k Client ${Date.now()}` } });
    const basePhone = Math.floor(10000000 + Math.random() * 80000000);

    const initialMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    // Generate 20,000 rows across 40 chunks
    const rows: string[][] = [["Phone", "Name", "Area", "Region", "Tags", "Buys", "OptOut"]];
    const COUNT = 20_000;

    for (let i = 1; i <= COUNT; i++) {
      rows.push([
        `+9170${basePhone + i}`,
        `Customer ${i}`,
        `Area ${i % 20}`,
        `Region ${i % 5}`,
        `tag_${i % 10}`,
        `Product ${i % 4}`,
        "no",
      ]);
    }

    // Inject cross-chunk duplicate: phone from chunk 1 appears in chunk 5
    rows[2500] = [`+9170${basePhone + 1}`, "Customer 1 Dupe Cross Chunk", "Area Updated", "Region Updated", "cross_tag", "Product 1", "no"];

    // First execution: Bulk creation
    const result1 = await syncCustomers(client.id, rows);
    const duration1 = Math.round(performance.now() - startTime);
    const peakMemory = Math.round((process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024));

    console.log(`[SHT-01 BENCHMARK] 20,000 rows: duration=${duration1}ms, heapDelta=${peakMemory}MB, throughput=${Math.round((COUNT / duration1) * 1000)} rows/sec`);

    // Verify 19,999 added (since 1 was cross-chunk duplicate that became an update)
    assert.match(result1, /added/);
    const dbCount = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(dbCount, 19999, "Database must hold 19,999 unique customers");

    // Second execution: Re-import same 20,000 rows (Idempotency and update test)
    const startTime2 = performance.now();
    const result2 = await syncCustomers(client.id, rows);
    const duration2 = Math.round(performance.now() - startTime2);

    console.log(`[SHT-01 RE-IMPORT] 20,000 rows re-sync: duration=${duration2}ms, 0 added`);
    assert.match(result2, /0 added/);
    assert.match(result2, /20000 updated/);

    const finalDbCount = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(finalDbCount, 19999, "Re-import must NEVER duplicate customers");

    // Clean up
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("4. SHT-01 Failure Injection & Safe Retry: Partial failure followed by retry reconciles with zero duplicate records", async () => {
    const client = await db.client.create({ data: { name: `Retry Client ${Date.now()}` } });
    const basePhone = Math.floor(10000000 + Math.random() * 80000000);

    // 1,500 rows across 3 chunks (500 per chunk)
    const rows: string[][] = [["Phone", "Name", "Tags"]];
    for (let i = 1; i <= 1500; i++) {
      rows.push([`+9171${basePhone + i}`, `Retry Customer ${i}`, `tag_${i % 5}`]);
    }

    // Pass 1: Simulate failure after chunk 1 by submitting only the first 500 rows
    const partialRows = rows.slice(0, 501); // Header + Chunk 1
    const res1 = await syncCustomers(client.id, partialRows);
    assert.match(res1, /500 added/);
    const countAfterPartial = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(countAfterPartial, 500, "500 customers created in chunk 1");

    // Pass 2: Retry full dataset of 1,500 rows from scratch (safe recovery)
    const res2 = await syncCustomers(client.id, rows);
    assert.match(res2, /1000 added/); // Chunks 2 & 3 added
    assert.match(res2, /500 updated/); // Chunk 1 safely updated, NOT duplicated

    const finalCount = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(finalCount, 1500, "Final database must reconcile to exactly 1,500 unique customers with 0 duplicates");

    // Clean up
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });
});
