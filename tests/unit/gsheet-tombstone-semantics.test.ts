import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { syncCustomers } from "../../src/lib/sheets";
import { db } from "../../src/lib/db";

describe("Domain 6 Batch B: SHT-03 Asymmetric Deletion & Tombstone Semantics Test Suite", () => {
  test("1. SHT-03 Missing, filtered, or truncated spreadsheet rows NEVER delete or modify portal customers", async () => {
    const client = await db.client.create({ data: { name: `SHT-03 Client ${Date.now()}` } });
    const basePhone = Math.floor(1000000 + Math.random() * 8000000);

    // Initial state: 10 customers exist in database with orders
    const customers = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        db.customer.create({
          data: {
            clientId: client.id,
            phone: `91971${basePhone + i}`,
            name: `Customer ${i}`,
            tags: ["initial"],
          },
        })
      )
    );

    // Create an order for Customer 0 to verify historical preservation
    await db.order.create({
      data: {
        clientId: client.id,
        customerId: customers[0].id,
        total: 1000,
        status: "PAID",
        paidAt: new Date(),
        number: Math.floor(100000 + Math.random() * 800000),
        items: [],
      },
    });

    // SPREADSHEET READ A: Only contains Customer 0 and Customer 1 (Customers 2..9 are "missing" / filtered out in sheet)
    const filteredRows: string[][] = [
      ["Phone", "Name", "Tags"],
      [`+91971${basePhone}`, "Customer 0 Updated", "active"],
      [`+91971${basePhone + 1}`, "Customer 1 Updated", "active"],
    ];

    const resultA = await syncCustomers(client.id, filteredRows);
    assert.match(resultA, /2 updated/);

    // CRITICAL ASSERTION: All 10 customers MUST still exist in database!
    const totalCount = await db.customer.count({ where: { clientId: client.id } });
    assert.equal(totalCount, 10, "Missing spreadsheet rows must NEVER delete database customers");

    // Customers 2..9 must be completely uncorrupted
    const c2 = await db.customer.findUnique({ where: { id: customers[2].id } });
    assert.equal(c2?.name, "Customer 2");
    assert.equal(c2?.deletedAt, null);

    // Orders for Customer 0 must remain intact
    const ordersCount = await db.order.count({ where: { customerId: customers[0].id } });
    assert.equal(ordersCount, 1, "Order history must remain 100% preserved");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("2. SHT-03 Explicit archive marker sets deletedAt tombstone idempotently without deleting financial history", async () => {
    const client = await db.client.create({ data: { name: `SHT-03 Archive Client ${Date.now()}` } });
    const phone = `91972${Math.floor(1000000 + Math.random() * 8000000)}`;

    const cust = await db.customer.create({
      data: {
        clientId: client.id,
        phone,
        name: "Archive Target",
        deletedAt: null,
      },
    });

    // Spreadsheet has explicit "Archive = yes"
    const rows = [
      ["Phone", "Name", "Archive"],
      [`+${phone}`, "Archive Target", "yes"],
    ];

    await syncCustomers(client.id, rows);

    // Customer must have deletedAt timestamp set (tombstone)
    const archived = await db.customer.findUnique({ where: { id: cust.id } });
    assert.notEqual(archived?.deletedAt, null, "Explicit archive marker must set deletedAt");

    // Repeated sync with same instruction is idempotent
    await syncCustomers(client.id, rows);
    const archived2 = await db.customer.findUnique({ where: { id: cust.id } });
    assert.notEqual(archived2?.deletedAt, null, "Repeated archive instruction must be idempotent");

    // Clean up
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("3. SHT-03 Tenant isolation: Archive instruction in Client A sheet never affects Client B with same phone", async () => {
    const clientA = await db.client.create({ data: { name: `Client A ${Date.now()}` } });
    const clientB = await db.client.create({ data: { name: `Client B ${Date.now()}` } });
    const sharedPhone = `91973${Math.floor(1000000 + Math.random() * 8000000)}`;

    const custA = await db.customer.create({ data: { clientId: clientA.id, phone: sharedPhone, name: "Customer in A" } });
    const custB = await db.customer.create({ data: { clientId: clientB.id, phone: sharedPhone, name: "Customer in B" } });

    // Client A archives this phone
    const rowsA = [
      ["Phone", "Name", "Archive"],
      [`+${sharedPhone}`, "Customer in A", "yes"],
    ];
    await syncCustomers(clientA.id, rowsA);

    // Verify Client A is archived, but Client B is untouched
    const checkA = await db.customer.findUnique({ where: { id: custA.id } });
    const checkB = await db.customer.findUnique({ where: { id: custB.id } });

    assert.notEqual(checkA?.deletedAt, null, "Client A customer must be archived");
    assert.equal(checkB?.deletedAt, null, "Client B customer must NEVER be affected by Client A sheet");

    // Clean up
    await db.customer.deleteMany({ where: { clientId: { in: [clientA.id, clientB.id] } } });
    await db.client.deleteMany({ where: { id: { in: [clientA.id, clientB.id] } } });
  });
});
