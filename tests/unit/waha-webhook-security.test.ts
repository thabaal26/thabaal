import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { POST } from "../../src/app/api/waha/webhook/route";
import { wahaWebhookKey } from "../../src/lib/provider";
import { db } from "../../src/lib/db";

describe("WEB-01 & WEB-04: WAHA Webhook Authentication & Tenant Scoping Test Suite", () => {
  test("1. WEB-04: Missing authentication returns 403 Forbidden", async () => {
    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      body: JSON.stringify({ event: "message", payload: { from: "919876543210@c.us", body: "hello" } }),
    });

    const res = await POST(req);
    assert.equal(res.status, 403);
  });

  test("2. WEB-04: Invalid secret header or signature returns 403 Forbidden", async () => {
    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-secret": "wrong-secret-token",
      },
      body: JSON.stringify({ event: "message", payload: { from: "919876543210@c.us", body: "hello" } }),
    });

    const res = await POST(req);
    assert.equal(res.status, 403);
  });

  test("3. WEB-04: Valid HMAC-SHA256 signature in header succeeds with 200 OK", async () => {
    const key = await wahaWebhookKey();
    const payload = JSON.stringify({ event: "message", payload: { fromMe: true, from: "919876543210@c.us", body: "echo" } });
    const signature = createHmac("sha256", key).update(payload).digest("hex");

    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-hmac": `sha256=${signature}`,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.ignored, "fromMe");
  });

  test("4. WEB-04: Expired timestamp (> 5 mins) returns 401 Unauthorized", async () => {
    const key = await wahaWebhookKey();
    const payload = JSON.stringify({ event: "message", payload: { fromMe: true, from: "919876543210@c.us", body: "echo" } });
    const expiredTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-secret": key,
        "x-webhook-timestamp": String(expiredTimestamp),
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  test("5. WEB-01: WAHA STOP scopes opt-out to active interacting tenant only, preserving other tenants", async () => {
    const key = await wahaWebhookKey();
    const sharedPhone = `91984${Math.floor(1000000 + Math.random() * 9000000)}`;

    // Tenant A (SheVest)
    const tenantA = await db.client.create({ data: { name: `Tenant A ${Date.now()}` } });
    const customerA = await db.customer.create({
      data: {
        clientId: tenantA.id,
        name: "User In Tenant A",
        phone: sharedPhone,
        optedOut: false,
      },
    });

    // Tenant B (Thenan Oils)
    const tenantB = await db.client.create({ data: { name: `Tenant B ${Date.now()}` } });
    const customerB = await db.customer.create({
      data: {
        clientId: tenantB.id,
        name: "User In Tenant B",
        phone: sharedPhone,
        optedOut: false,
      },
    });

    // Tenant A sent an outbound message to this customer
    await db.message.create({
      data: {
        customerId: customerA.id,
        templateName: "text_message",
        status: "DELIVERED",
        provider: "LOCAL",
        body: "Tenant A offer message",
        waMessageId: `msg_${Date.now()}_a`,
      },
    });

    // Customer replies STOP via WAHA
    const payload = JSON.stringify({
      event: "message",
      payload: {
        id: `waha_inbound_${Date.now()}`,
        from: `${sharedPhone}@c.us`,
        body: "STOP",
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-secret": key,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    // Verify Tenant A customer was opted out
    const freshA = await db.customer.findUniqueOrThrow({ where: { id: customerA.id } });
    assert.equal(freshA.optedOut, true, "Tenant A customer with active message must be opted out");

    // Verify Tenant B customer was NOT opted out (WEB-01 cross-tenant contamination prevented)
    const freshB = await db.customer.findUniqueOrThrow({ where: { id: customerB.id } });
    assert.equal(freshB.optedOut, false, "Tenant B customer must remain opted in (WEB-01 isolation preserved)");
  });
});
