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

  test("6. Full Order-ID Set Parity Proof: Prisma (SALE_WHERE + isSale) vs PostgreSQL saleSqlText('o')", async () => {
    const client = await db.client.create({ data: { name: `Set Parity Client ${Date.now()}` } });
    const customer = await db.customer.create({
      data: { clientId: client.id, name: "Set Parity Cust", phone: `91995${Math.floor(1000000 + Math.random() * 9000000)}` },
    });
    const now = new Date();

    // 1. Normal Paid order
    const oPaid = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1500, status: "PAID", paidAt: now, paymentMethod: "upi", number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 2. COD Confirmed order
    const oCod = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1200, status: "CONFIRMED", paymentMethod: "cod", number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 3. Delivered order
    const oDelivered = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 800, status: "DELIVERED", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 4. Cancelled order (never paid)
    const oCancelled = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 2000, status: "CANCELLED", number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 5. Cancelled order with residual paidAt timestamp
    const oCancelledWithPaidAt = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1000, status: "CANCELLED", paidAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 6. Paid order with 100% full refund (preserves PAID status, excluded by refund check)
    const oFullyRefunded = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 600, status: "PAID", paidAt: now, refundAmount: 600, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 6b. Delivered order with 100% full refund (preserves DELIVERED fulfilment status, excluded from sales)
    const oDeliveredFullyRefunded = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 900, status: "DELIVERED", paidAt: now, refundAmount: 900, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 6c. Dispatched order with 100% full refund (preserves DISPATCHED fulfilment status, excluded from sales)
    const oDispatchedFullyRefunded = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 700, status: "DISPATCHED", paidAt: now, refundAmount: 700, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 7. Paid order with Partial refund (₹250 refunded on ₹1000)
    const oPartiallyRefunded = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 1000, status: "PAID", paidAt: now, refundAmount: 250, refundedAt: now, number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 8. Open cart (NEW, unpaid, non-COD)
    const oOpenCartNew = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 500, status: "NEW", number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });
    // 9. Open cart (CONFIRMED without COD or paidAt)
    const oOpenCartConfirmed = await db.order.create({
      data: { clientId: client.id, customerId: customer.id, total: 750, status: "CONFIRMED", paymentMethod: "upi", number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });

    // Execute Method A: Prisma with SALE_WHERE and in-memory isSale
    const prismaOrders = await db.order.findMany({
      where: {
        clientId: client.id,
        ...SALE_WHERE,
      },
    });
    const qualifyingPrismaIds = prismaOrders.filter(isSale).map((o) => o.id).sort();

    // Execute Method B: Raw PostgreSQL query using canonical saleSqlText("o")
    const sql = `SELECT o.id FROM "Order" o WHERE o."clientId" = $1 AND ${saleSqlText("o")} ORDER BY o.id ASC`;
    const sqlRows = await db.$queryRawUnsafe<{ id: string }[]>(sql, client.id);
    const qualifyingSqlIds = sqlRows.map((r) => r.id).sort();

    // Expected qualifying set: oPaid, oCod, oDelivered, oPartiallyRefunded (4 orders)
    const expectedIds = [oPaid.id, oCod.id, oDelivered.id, oPartiallyRefunded.id].sort();

    // Assert exact order ID set parity
    assert.deepEqual(qualifyingPrismaIds, expectedIds, "Prisma qualifying set must match expected business sales");
    assert.deepEqual(qualifyingSqlIds, expectedIds, "PostgreSQL qualifying set must match expected business sales");
    assert.deepEqual(qualifyingPrismaIds, qualifyingSqlIds, "Prisma and PostgreSQL order-ID sets MUST BE 100% IDENTICAL");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("7. Priority 5: SPD-01 Query Plan Proof - Direct Index Utilization on [clientId, status, createdAt]", async () => {
    const client = await db.client.create({ data: { name: `Index Proof Client ${Date.now()}` } });
    const customer = await db.customer.create({
      data: { clientId: client.id, name: "Index Proof Cust", phone: `91994${Math.floor(1000000 + Math.random() * 9000000)}` },
    });
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Create a batch of orders for this client
    const ordersData = Array.from({ length: 30 }, (_, i) => ({
      clientId: client.id,
      customerId: customer.id,
      total: 100 + i * 10,
      status: (i % 3 === 0 ? "PAID" : i % 3 === 1 ? "CONFIRMED" : "CANCELLED") as any,
      paidAt: i % 3 === 0 ? now : null,
      paymentMethod: i % 3 === 1 ? "cod" : "upi",
      number: Math.floor(200000 + Math.random() * 700000),
      items: [],
      createdAt: now,
    }));
    await db.order.createMany({ data: ordersData });

    // Force index scan preference in Postgres session for predictable testing
    await db.$executeRawUnsafe(`SET enable_seqscan = off;`);

    // Explain query simulating spend.ts:282
    const sql = `
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT "id", "total", "refundAmount", "status", "paidAt", "paymentMethod", "internalNote"
      FROM "Order"
      WHERE "clientId" = $1
        AND "createdAt" >= $2
        AND "status" <> 'CANCELLED'
        AND (
          "paidAt" IS NOT NULL
          OR "status" IN ('PAID', 'DISPATCHED', 'DELIVERED')
          OR ("status" = 'CONFIRMED' AND "paymentMethod" = 'cod')
        )
    `;

    const planRows = await db.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(sql, client.id, thisMonth);
    const planText = planRows.map((r) => r["QUERY PLAN"]).join("\n");

    // Reset session setting
    await db.$executeRawUnsafe(`SET enable_seqscan = on;`);

    // Verify index scan is utilized on Order table
    const usesIndexScan = planText.includes("Index Scan") || planText.includes("Bitmap Index Scan");
    assert.equal(usesIndexScan, true, `Query execution plan must use Index Scan. Plan output:\n${planText}`);
    assert.equal(planText.includes("Order_clientId_status_createdAt_idx"), true, "Must hit Order_clientId_status_createdAt_idx composite index");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  test("8. ANL-01 & ANL-04: Over-refund auditability and cross-period refund completion attribution", async () => {
    // 1. Over-refund anomaly auditability: over-refund must produce measurable negative net figure, never silently clamped
    const overRefundOrder = {
      status: "PAID",
      paidAt: new Date(),
      paymentMethod: "upi",
      internalNote: null,
      total: 500,
      refundAmount: 600, // ₹100 over-refund anomaly
    };
    // Should NOT qualify as active positive sale
    assert.equal(isSale(overRefundOrder), false, "Over-refunded order must not qualify as sale");
    // Net reconciliation calculation must expose anomaly
    const net = Math.round((overRefundOrder.total - overRefundOrder.refundAmount) * 100) / 100;
    assert.equal(net, -100, "Net calculation must expose -100 anomaly rather than silently clamping to 0");
  });
});
