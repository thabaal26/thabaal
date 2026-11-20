import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { isSale, isOpenCart, saleSqlText, SALE_WHERE } from "../../src/lib/sale";
import { db } from "../../src/lib/db";

describe("Domain 6 Batch A: Financial Parity & Accounting Integrity Test Suite", () => {
  test("1. TypeScript isSale strictly rejects CANCELLED orders even if paidAt is set", () => {
    const cancelledPaid = {
      status: "CANCELLED",
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
      total: 1000,
      refundAmount: null,
    };
    assert.equal(isSale(cancelledPaid), false, "Cancelled order must never be a sale");
  });

  test("2. TypeScript isSale strictly rejects 100% fully refunded orders", () => {
    const fullyRefunded = {
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
      total: 500,
      refundAmount: 500,
    };
    assert.equal(isSale(fullyRefunded), false, "100% fully refunded order must not be a sale");
  });

  test("3. TypeScript isSale accepts partially refunded orders as qualifying sales", () => {
    const partiallyRefunded = {
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
      total: 1000,
      refundAmount: 200,
    };
    assert.equal(isSale(partiallyRefunded), true, "Partially refunded order is still a qualifying sale");
  });

  test("4. saleSqlText matches TypeScript rules: excludes CANCELLED and 100% full refunds in PostgreSQL", async () => {
    const client = await db.client.create({ data: { name: `Parity Client ${Date.now()}` } });
    const customer = await db.customer.create({
      data: { clientId: client.id, name: "Parity Test Cust", phone: `91998${Math.floor(1000000 + Math.random() * 9000000)}` },
    });

    const now = new Date();
    // 1. Valid paid sale
    const o1 = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1000, status: "PAID", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 2. Paid but CANCELLED order
    const o2 = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 800, status: "CANCELLED", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 3. Paid but 100% FULLY REFUNDED order
    const o3 = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 600, status: "PAID", paidAt: now, refundAmount: 600, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 4. Paid with PARTIAL REFUND (e.g. ₹200 refund on ₹500)
    const o4 = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 500, status: "PAID", paidAt: now, refundAmount: 200, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });

    // Run Raw SQL using saleSqlText("o")
    const sql = `SELECT o.id, o.total, o."refundAmount" FROM "Order" o WHERE o."clientId" = $1 AND ${saleSqlText("o")}`;
    const rows = await db.$queryRawUnsafe<{ id: string; total: number; refundAmount: number | null }[]>(sql, client.id);

    const ids = new Set(rows.map((r) => r.id));
    assert.equal(ids.has(o1.id), true, "Valid paid order must match SQL");
    assert.equal(ids.has(o2.id), false, "Cancelled order must NOT match SQL even if paidAt was set");
    assert.equal(ids.has(o3.id), false, "100% fully refunded order must NOT match SQL");
    assert.equal(ids.has(o4.id), true, "Partially refunded order must match SQL");
    assert.equal(rows.length, 2, "Only qualifying sales (o1, o4) should match");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("5. SALE_WHERE Prisma filter excludes CANCELLED orders directly without manual wrapper", async () => {
    const client = await db.client.create({ data: { name: `Prisma Parity Client ${Date.now()}` } });
    const customer = await db.customer.create({
      data: { clientId: client.id, name: "Prisma Cust", phone: `91997${Math.floor(1000000 + Math.random() * 9000000)}` },
    });

    const now = new Date();
    const active = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1000, status: "PAID", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    const cancelled = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1200, status: "CANCELLED", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });

    // Query using direct ...SALE_WHERE (testing ANL-03 resolution)
    const matches = await db.order.findMany({
      where: {
        clientId: client.id,
        ...SALE_WHERE,
      },
    });

    const matchIds = matches.map((m) => m.id);
    assert.equal(matchIds.includes(active.id), true, "Active sale matches SALE_WHERE");
    assert.equal(matchIds.includes(cancelled.id), false, "Cancelled order strictly excluded by direct SALE_WHERE");
    assert.equal(matches.length, 1);

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });
});
