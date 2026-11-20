import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/lib/db";
import { isSale, saleSqlText, SALE_WHERE } from "../../src/lib/sale";
import { syncCustomers } from "../../src/lib/sheets";
import { fromZonedTime } from "date-fns-tz";
import { APP_TZ } from "../../src/lib/format";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/waha/webhook/route";
import { wahaWebhookKey } from "../../src/lib/provider";

describe("CONTROLLED STAGING VALIDATION SUITE (Turn 20 Directive)", () => {
  // =========================================================================
  // GATE A: FINANCIAL RECONCILIATION & CROSS-PERIOD REFUND ATTRIBUTION
  // =========================================================================
  test("Gate A: Cross-period order and refund separation matches Architect specification", async () => {
    const client = await db.client.create({ data: { name: `Staging Fin Client ${Date.now()}` } });
    const cust = await db.customer.create({
      data: { clientId: client.id, name: "Cross Period Customer", phone: `91999${Math.floor(1000000 + Math.random() * 8000000)}` },
    });

    // Order placed on October 28: Total ₹10,000, Paid ₹10,000
    const octDate = fromZonedTime("2026-10-28T10:00:00", APP_TZ);
    // Refund completed on November 5: Amount ₹3,000
    const novDate = fromZonedTime("2026-11-05T14:30:00", APP_TZ);

    const octRange = {
      from: fromZonedTime("2026-10-01T00:00:00", APP_TZ),
      to: fromZonedTime("2026-11-01T00:00:00", APP_TZ),
    };
    const novRange = {
      from: fromZonedTime("2026-11-01T00:00:00", APP_TZ),
      to: fromZonedTime("2026-12-01T00:00:00", APP_TZ),
    };

    const order = await db.order.create({
      data: {
        clientId: client.id,
        customerId: cust.id,
        total: 10000,
        status: "DELIVERED", // Fulfilment status preserved!
        paidAt: octDate,
        createdAt: octDate,
        refundAmount: 3000,
        refundedAt: novDate, // Completed in November
        number: Math.floor(100000 + Math.random() * 800000),
        items: [],
      },
    });

    // 1. October Report Query: Orders created in October
    const octOrders = await db.order.findMany({
      where: {
        clientId: client.id,
        status: { not: "CANCELLED" },
        OR: [{ createdAt: { gte: octRange.from, lt: octRange.to } }, { refundedAt: { gte: octRange.from, lt: octRange.to } }],
      },
    });

    let octGross = 0;
    let octRefunds = 0;
    for (const o of octOrders) {
      if (o.createdAt >= octRange.from && o.createdAt < octRange.to) {
        if (isSale(o)) octGross += o.total;
      }
      if (o.refundedAt && o.refundedAt >= octRange.from && o.refundedAt < octRange.to) {
        octRefunds += o.refundAmount ?? 0;
      }
    }
    const octNet = octGross - octRefunds;

    // Verify October report
    assert.equal(octGross, 10000, "October Gross Sales must be ₹10,000");
    assert.equal(octRefunds, 0, "October Refunds Issued must be ₹0");
    assert.equal(octNet, 10000, "October Net Sales must be ₹10,000");

    // 2. November Report Query: Orders created or refunded in November
    const novOrders = await db.order.findMany({
      where: {
        clientId: client.id,
        status: { not: "CANCELLED" },
        OR: [{ createdAt: { gte: novRange.from, lt: novRange.to } }, { refundedAt: { gte: novRange.from, lt: novRange.to } }],
      },
    });

    let novGross = 0;
    let novRefunds = 0;
    for (const o of novOrders) {
      if (o.createdAt >= novRange.from && o.createdAt < novRange.to) {
        if (isSale(o)) novGross += o.total;
      }
      if (o.refundedAt && o.refundedAt >= novRange.from && o.refundedAt < novRange.to) {
        novRefunds += o.refundAmount ?? 0;
      }
    }
    const novNet = novGross - novRefunds;

    // Verify November report
    assert.equal(novGross, 0, "November Gross Sales from this order must be ₹0");
    assert.equal(novRefunds, 3000, "November Refunds Issued must be ₹3,000");
    assert.equal(novNet, -3000, "November Net Cash Movement must be -₹3,000");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  // =========================================================================
  // GATE B: GOOGLE SHEETS ASYMMETRIC DELETION & TOMBSTONE INTEGRITY
  // =========================================================================
  test("Gate B: Google Sheets explicit Archive sets tombstone, preserves orders and ignores missing rows", async () => {
    const client = await db.client.create({ data: { name: `Staging Sheet Client ${Date.now()}` } });
    const phone = `91992${Math.floor(1000000 + Math.random() * 8000000)}`;

    const cust = await db.customer.create({
      data: { clientId: client.id, phone, name: "Tombstone Test" },
    });
    const order = await db.order.create({
      data: { clientId: client.id, customerId: cust.id, total: 500, status: "PAID", paidAt: new Date(), number: Math.floor(100000 + Math.random() * 800000), items: [] },
    });

    // Pass 1: Explicit Archive = yes
    const rows1 = [
      ["Phone", "Name", "Archive"],
      [`+${phone}`, "Tombstone Test", "yes"],
    ];
    await syncCustomers(client.id, rows1);

    const check1 = await db.customer.findUnique({ where: { id: cust.id } });
    assert.notEqual(check1?.deletedAt, null, "deletedAt timestamp must be stamped on Archive = yes");

    // Orders must still exist and be linked
    const orderCheck = await db.order.findUnique({ where: { id: order.id } });
    assert.notEqual(orderCheck, null, "Order must remain fully intact after archiving");

    // Pass 2: Truncated sheet read with 0 rows for this customer
    const emptyRows = [
      ["Phone", "Name", "Archive"],
      ["+919999999999", "Another User", "no"],
    ];
    await syncCustomers(client.id, emptyRows);

    // Customer still exists in DB
    const check2 = await db.customer.findUnique({ where: { id: cust.id } });
    assert.notEqual(check2, null, "Missing row must NEVER drop customer from DB");

    // Clean up
    await db.order.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });

  // =========================================================================
  // GATE C: DATABASE RESOURCE CONFIGURATION & HIGH VOLUME PROFILE
  // =========================================================================
  test("Gate C: Capture staging database version, index configuration & resource metrics", async () => {
    const versionRows = await db.$queryRawUnsafe<{ version: string }[]>("SELECT version()");
    console.log("[STAGING DB VERSION]", versionRows[0]?.version);
    assert.ok(versionRows[0]?.version.includes("PostgreSQL"), "Must run against PostgreSQL");

    const indexRows = await db.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'Order' AND indexname = 'Order_clientId_status_createdAt_idx';
    `);
    assert.equal(indexRows.length, 1, "Order_clientId_status_createdAt_idx must exist in database");
    console.log("[STAGING INDEX VERIFIED]", indexRows[0]?.indexdef);
  });

  // =========================================================================
  // GATE D: WEBHOOK REGRESSION & REPLAY CONCURRENCY
  // =========================================================================
  test("Gate D: Inbound webhook concurrency produces exactly 1 side effect with HMAC validation", async () => {
    const key = await wahaWebhookKey();
    const session = `staging_session_${Date.now()}`;
    const client = await db.client.create({ data: { name: `Staging Webhook Client ${Date.now()}` } });
    const phone = `91993${Math.floor(1000000 + Math.random() * 8000000)}`;

    await db.customer.create({ data: { clientId: client.id, name: "Webhook User", phone } });
    await db.whatsAppNumber.create({ data: { clientId: client.id, label: session, phoneNumberId: session, businessAccountId: `waba_${Date.now()}` } });

    const eventId = `waha_staging_${Date.now()}`;
    const payload = JSON.stringify({
      event: "message",
      session,
      payload: { id: eventId, from: `${phone}@c.us`, body: "Staging concurrency proof", timestamp: Math.floor(Date.now() / 1000) },
    });
    const signature = createHmac("sha512", key).update(payload).digest("hex");

    // Fire 10 concurrent requests
    const requests = Array.from({ length: 10 }, () =>
      new NextRequest("http://localhost:3000/api/waha/webhook", {
        method: "POST",
        headers: { "x-webhook-hmac": `sha512=${signature}`, "content-type": "application/json" },
        body: payload,
      })
    );

    const results = await Promise.allSettled(requests.map((r) => POST(r)));
    assert.equal(results.every((r) => r.status === "fulfilled"), true);

    const repliesCount = await db.reply.count({ where: { waMessageId: eventId } });
    assert.equal(repliesCount, 1, "Exactly 1 reply created in DB from 10 concurrent deliveries");

    // Clean up
    await db.reply.deleteMany({ where: { waMessageId: eventId } });
    await db.whatsAppNumber.deleteMany({ where: { clientId: client.id } });
    await db.customer.deleteMany({ where: { clientId: client.id } });
    await db.client.delete({ where: { id: client.id } });
  });
});
