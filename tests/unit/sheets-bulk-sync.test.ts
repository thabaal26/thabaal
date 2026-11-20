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
});
