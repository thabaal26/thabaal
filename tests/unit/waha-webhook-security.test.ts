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

  test("3. WEB-04: Valid native HMAC-SHA512 signature in header succeeds with 200 OK", async () => {
    const key = await wahaWebhookKey();
    const payload = JSON.stringify({ event: "message", payload: { fromMe: true, from: "919876543210@c.us", body: "echo" } });
    const signature = createHmac("sha512", key).update(payload).digest("hex");

    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-hmac": `sha512=${signature}`,
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

  test("4. WEB-04: Expired payload body timestamp (> 5 mins) returns 401 Unauthorized", async () => {
    const key = await wahaWebhookKey();
    const expiredTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000); // 10 minutes ago
    const payload = JSON.stringify({
      event: "message",
      payload: {
        fromMe: false,
        from: "919876543210@c.us",
        body: "test",
        timestamp: expiredTimestamp,
      },
    });
    const signature = createHmac("sha512", key).update(payload).digest("hex");

    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-hmac": `sha512=${signature}`,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 401);
  });

  test("5. WEB-01: Explicit WAHA session-to-tenant mapping isolates STOP opt-out strictly to configured tenant", async () => {
    const key = await wahaWebhookKey();
    const sharedPhone = `91984${Math.floor(1000000 + Math.random() * 9000000)}`;
    const sessionA = `waha_session_a_${Date.now()}`;

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

    // Explicitly configure Tenant A's sender number to own sessionA
    await db.whatsAppNumber.create({
      data: {
        clientId: tenantA.id,
        label: sessionA,
        phoneNumberId: `phone_id_${Date.now()}_a`,
        businessAccountId: `waba_id_${Date.now()}_a`,
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

    // Customer replies STOP via WAHA targeting sessionA
    const payload = JSON.stringify({
      event: "message",
      session: sessionA,
      payload: {
        id: `waha_inbound_${Date.now()}`,
        from: `${sharedPhone}@c.us`,
        body: "STOP",
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    const signature = createHmac("sha512", key).update(payload).digest("hex");
    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-hmac": `sha512=${signature}`,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    // Verify Tenant A customer was opted out via explicit session mapping
    const freshA = await db.customer.findUniqueOrThrow({ where: { id: customerA.id } });
    assert.equal(freshA.optedOut, true, "Tenant A customer explicitly mapped to session must be opted out");

    // Verify Tenant B customer was NOT opted out (WEB-01 cross-tenant contamination prevented)
    const freshB = await db.customer.findUniqueOrThrow({ where: { id: customerB.id } });
    assert.equal(freshB.optedOut, false, "Tenant B customer must remain opted in (WEB-01 isolation preserved)");
  });

  test("6. WEB-01: Unmapped WAHA session fails closed without touching any tenant customers", async () => {
    const key = await wahaWebhookKey();
    const phone = `91985${Math.floor(1000000 + Math.random() * 9000000)}`;

    const tenant = await db.client.create({ data: { name: `Tenant Unmapped ${Date.now()}` } });
    const customer = await db.customer.create({
      data: {
        clientId: tenant.id,
        name: "User Unmapped",
        phone,
        optedOut: false,
      },
    });

    // STOP message arrives from an unknown/unmapped WAHA session
    const payload = JSON.stringify({
      event: "message",
      session: "unknown_foreign_session",
      payload: {
        id: `waha_inbound_unknown_${Date.now()}`,
        from: `${phone}@c.us`,
        body: "STOP",
        fromMe: false,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    const signature = createHmac("sha512", key).update(payload).digest("hex");
    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: {
        "x-webhook-hmac": `sha512=${signature}`,
        "content-type": "application/json",
      },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    // Customer must NOT be opted out (fail-closed security)
    const freshCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(freshCustomer.optedOut, false, "Unmapped session must fail closed with zero database mutations");
  });
});
