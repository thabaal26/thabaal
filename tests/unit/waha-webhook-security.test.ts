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

  test("7. WEB-01: Conflicting duplicate session mapping across tenants strictly fails closed with 409", async () => {
    const key = await wahaWebhookKey();
    const collisionSession = `collision_session_${Date.now()}`;
    const client1 = await db.client.create({ data: { name: `Client 1 ${Date.now()}` } });
    const client2 = await db.client.create({ data: { name: `Client 2 ${Date.now()}` } });

    // Both clients inadvertently register the same WAHA session name
    await db.whatsAppNumber.create({ data: { clientId: client1.id, label: collisionSession, phoneNumberId: `p1_${Date.now()}`, businessAccountId: `waba1_${Date.now()}` } });
    await db.whatsAppNumber.create({ data: { clientId: client2.id, label: collisionSession, phoneNumberId: `p2_${Date.now()}`, businessAccountId: `waba2_${Date.now()}` } });

    const payload = JSON.stringify({
      event: "message",
      session: collisionSession,
      payload: { id: `msg_collision_${Date.now()}`, from: "919999999999@c.us", body: "Hello", timestamp: Math.floor(Date.now() / 1000) },
    });
    const signature = createHmac("sha512", key).update(payload).digest("hex");
    const req = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: { "x-webhook-hmac": `sha512=${signature}`, "content-type": "application/json" },
      body: payload,
    });

    const res = await POST(req);
    assert.equal(res.status, 409, "Conflicting session mappings across tenants must return 409 Conflict");
  });

  test("8. WEB-04: Replay attack with same valid signed body within 5-min window is safely deduplicated", async () => {
    const key = await wahaWebhookKey();
    const session = `replay_session_${Date.now()}`;
    const client = await db.client.create({ data: { name: `Replay Client ${Date.now()}` } });
    const phone = `91987${Math.floor(1000000 + Math.random() * 9000000)}`;

    const customer = await db.customer.create({
      data: { clientId: client.id, name: "Replay Test User", phone, optedOut: false },
    });
    const number = await db.whatsAppNumber.create({
      data: { clientId: client.id, label: session, phoneNumberId: session, businessAccountId: `waba_${Date.now()}` },
    });

    const eventId = `waha_event_${Date.now()}`;
    const payload = JSON.stringify({
      event: "message",
      session,
      payload: {
        id: eventId,
        from: `${phone}@c.us`,
        body: "Hello first time",
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    const signature = createHmac("sha512", key).update(payload).digest("hex");

    // 1st delivery (legitimate)
    const req1 = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: { "x-webhook-hmac": `sha512=${signature}`, "content-type": "application/json" },
      body: payload,
    });
    const res1 = await POST(req1);
    assert.equal(res1.status, 200);

    const repliesCount1 = await db.reply.count({ where: { waMessageId: eventId } });
    assert.equal(repliesCount1, 1, "Exactly 1 reply must be created for initial delivery");

    // 2nd delivery (replay within 5 minutes)
    const req2 = new NextRequest("http://localhost:3000/api/waha/webhook", {
      method: "POST",
      headers: { "x-webhook-hmac": `sha512=${signature}`, "content-type": "application/json" },
      body: payload,
    });
    const res2 = await POST(req2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.duplicate, true, "Replay must be recognized as duplicate");

    const repliesCount2 = await db.reply.count({ where: { waMessageId: eventId } });
    assert.equal(repliesCount2, 1, "Zero duplicate replies created during replay attack");
  });

  test("9. WEB-04 Concurrency: 10 concurrent duplicate deliveries via Promise.allSettled create exactly 1 side effect", async () => {
    const key = await wahaWebhookKey();
    const session = `concurrent_session_${Date.now()}`;
    const client = await db.client.create({ data: { name: `Concurrent Client ${Date.now()}` } });
    const phone = `91986${Math.floor(1000000 + Math.random() * 9000000)}`;

    await db.customer.create({
      data: { clientId: client.id, name: "Concurrent User", phone, optedOut: false },
    });
    await db.whatsAppNumber.create({
      data: { clientId: client.id, label: session, phoneNumberId: session, businessAccountId: `waba_${Date.now()}` },
    });

    const eventId = `waha_concurrent_${Date.now()}`;
    const payload = JSON.stringify({
      event: "message",
      session,
      payload: {
        id: eventId,
        from: `${phone}@c.us`,
        body: "Concurrent message storm",
        timestamp: Math.floor(Date.now() / 1000),
      },
    });
    const signature = createHmac("sha512", key).update(payload).digest("hex");

    // Fire 10 concurrent deliveries with the exact same eventId
    const requests = Array.from({ length: 10 }, () =>
      new NextRequest("http://localhost:3000/api/waha/webhook", {
        method: "POST",
        headers: { "x-webhook-hmac": `sha512=${signature}`, "content-type": "application/json" },
        body: payload,
      })
    );

    const results = await Promise.allSettled(requests.map((r) => POST(r)));

    // Every single promise must resolve cleanly without crashing (fulfilled)
    assert.equal(results.every((r) => r.status === "fulfilled"), true, "All 10 concurrent requests must settle cleanly");

    // Exactly 1 Reply record exists in the database
    const repliesCount = await db.reply.count({ where: { waMessageId: eventId } });
    assert.equal(repliesCount, 1, "Exactly 1 reply must be created despite 10 competing deliveries");
  });
});
