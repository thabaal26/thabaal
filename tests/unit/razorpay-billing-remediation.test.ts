import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import {
  confirmOrderCheckout,
  recordCheckoutOutcome,
  startPlanOrder,
  startPlanSubscription,
} from "../../src/lib/razorpay-billing";

describe("Razorpay Billing Remediation: Safe Reuse, Fail-Safe One-Time Orders & Contact Protection", () => {
  const originalFetch = globalThis.fetch;
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;

  let createdSubs: any[] = [];
  let createdOrders: any[] = [];
  let subGetResponses: Record<string, any> = {};
  let orderGetResponses: Record<string, any> = {};
  let testClientId: string = "";
  let testClient2Id: string = "";
  let seq = 0;

  before(async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_remediation_mock";
    process.env.RAZORPAY_KEY_SECRET = "mock_secret_remediation";

    // Create test clients
    const c1 = await db.client.create({
      data: { name: `Remediation Test ${Date.now()}` },
    });
    testClientId = c1.id;

    const c2 = await db.client.create({
      data: { name: `Remediation Test Other ${Date.now()}` },
    });
    testClient2Id = c2.id;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method?.toUpperCase() ?? "GET";

      if (url.includes("/customers")) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const id = `cust_rem_${++seq}`;
        return new Response(
          JSON.stringify({
            id,
            entity: "customer",
            name: body.name || "Test Customer",
            contact: body.contact,
            email: body.email,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.includes("/subscriptions")) {
        if (method === "POST") {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const id = `sub_rem_${++seq}_${Date.now()}`;
          const sub = {
            id,
            status: "created",
            plan_id: body.plan_id,
            total_count: body.total_count,
            quantity: 1,
            customer_notify: 1,
            customer_id: body.customer_id,
            notes: body.notes,
            auth_attempts: 0,
            short_url: `https://rzp.io/rzp/${id}`,
          };
          createdSubs.push(sub);
          subGetResponses[id] = sub;
          return new Response(JSON.stringify(sub), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (method === "GET") {
          const subId = url.split("/subscriptions/")[1]?.split("?")[0];
          const resp = subGetResponses[subId] || { id: subId, status: "created", auth_attempts: 0, total_count: 12 };
          return new Response(JSON.stringify(resp), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      if (url.includes("/orders")) {
        if (method === "POST") {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const id = `order_rem_${++seq}_${Date.now()}`;
          const ord = {
            id,
            entity: "order",
            amount: body.amount,
            currency: body.currency,
            status: "created",
            attempts: 0,
            notes: body.notes,
          };
          createdOrders.push(ord);
          orderGetResponses[id] = ord;
          return new Response(JSON.stringify(ord), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (method === "GET") {
          const orderId = url.split("/orders/")[1]?.split("?")[0];
          const resp = orderGetResponses[orderId] || { id: orderId, status: "created", attempts: 0 };
          return new Response(JSON.stringify(resp), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }

      if (url.includes("/plans")) {
        if (method === "GET") {
          return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
        if (method === "POST") {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          const id = `plan_rem_${++seq}`;
          return new Response(JSON.stringify({ id, item: { name: body.item.name, amount: body.item.amount } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (url.includes("/payments/")) {
        const payId = url.split("/payments/")[1]?.split("?")[0];
        return new Response(
          JSON.stringify({
            id: payId,
            status: "captured",
            amount: 299900,
            currency: "INR",
            method: "upi",
            order_id: payId.replace("pay_", "order_"),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    process.env.RAZORPAY_KEY_ID = originalKeyId;
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
    if (testClientId) await db.client.deleteMany({ where: { id: testClientId } }).catch(() => {});
    if (testClient2Id) await db.client.deleteMany({ where: { id: testClient2Id } }).catch(() => {});
  });

  test("1. Pristine subscription within 5 minutes is safely reused", async () => {
    const actor = { clientId: testClientId, name: "Manager", canManage: true, isAdmin: false };
    const s1 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s1.ok, true);
    assert.equal(s1.kind, "subscription");

    // Second call within 5 mins with pristine status should reuse s1
    const s2 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s2.ok, true);
    assert.equal(s2.id, s1.id, "Expected pristine subscription to be reused");
  });

  test("2. Subscription with auth_attempts > 0 is NOT reused and creates a fresh subscription", async () => {
    const actor = { clientId: testClientId, name: "Manager", canManage: true, isAdmin: false };
    const s1 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s1.ok, true);

    // Simulate provider reporting an authentication attempt happened
    subGetResponses[s1.id] = {
      id: s1.id,
      status: "created",
      auth_attempts: 1, // Non-zero attempts!
      total_count: 12,
    };

    // Subsequent call must NOT reuse s1
    const s2 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s2.ok, true);
    assert.notEqual(s2.id, s1.id, "Attempted subscription must NOT be reused");
  });

  test("3. Subscription marked with note (cancelled/closed checkout) is NOT reused", async () => {
    const actor = { clientId: testClientId, name: "Manager", canManage: true, isAdmin: false };
    const s1 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s1.ok, true);

    // Record checkout outcome as closed
    await recordCheckoutOutcome(s1.id, "closed");

    // Check DB record has the note
    const rec = await db.razorpayRecord.findUnique({ where: { rzpId: s1.id } });
    assert.ok(rec?.note?.includes("Checkout closed"));

    // Next call must produce a fresh subscription
    const s2 = await startPlanSubscription(actor, "growth", "m");
    assert.equal(s2.ok, true);
    assert.notEqual(s2.id, s1.id, "Closed/failed checkout must NOT be reused");
  });

  test("4. Subscription from a different tenant or plan cannot be reused", async () => {
    const actor1 = { clientId: testClientId, name: "Manager 1", canManage: true, isAdmin: false };
    const actor2 = { clientId: testClient2Id, name: "Manager 2", canManage: true, isAdmin: false };

    const s1 = await startPlanSubscription(actor1, "growth", "m");
    assert.equal(s1.ok, true);

    const s2 = await startPlanSubscription(actor2, "growth", "m");
    assert.equal(s2.ok, true);
    assert.notEqual(s2.id, s1.id, "Different tenant must never reuse another tenant's subscription");

    const s3 = await startPlanSubscription(actor1, "starter", "m");
    assert.equal(s3.ok, true);
    assert.notEqual(s3.id, s1.id, "Different plan must never reuse another plan's subscription");
  });

  test("5. One-time plan order creation via startPlanOrder works cleanly", async () => {
    const actor = { clientId: testClientId, name: "Manager", canManage: true, isAdmin: false };
    const ord = await startPlanOrder(actor, "growth", "m");
    assert.equal(ord.ok, true);
    assert.equal(ord.kind, "order");
    assert.equal(ord.amountPaise, 299900);
    assert.match(ord.label, /Growth/);

    const dbRec = await db.razorpayRecord.findUnique({ where: { rzpId: ord.id } });
    assert.equal(dbRec?.kind, "order");
    assert.equal(dbRec?.purpose, "plan");
    assert.equal(dbRec?.amountPaise, 299900);
  });

  test("6. Passes GPay contact details, creates/links Razorpay customer, and sets customer_id", async () => {
    const actor = { clientId: testClientId, name: "Manager", canManage: true, isAdmin: false };
    const contact = { name: "Rathandeep", mobile: "9876543210", email: "rathandeep@candbindia.com" };
    const s = await startPlanSubscription(actor, "business", "m", contact);
    assert.equal(s.ok, true);
    assert.equal(s.kind, "subscription");

    // Verify subscription was created with customer_id from mock customer endpoint
    const created = createdSubs.find((sub) => sub.id === s.id);
    assert.ok(created?.customer_id?.startsWith("cust_rem_"), "Expected subscription to link customer_id");
    assert.equal(created?.notes?.gpay_mobile, "9876543210");

    // Also test one-time order with contact
    const ord = await startPlanOrder(actor, "business", "m", contact);
    assert.equal(ord.ok, true);
    assert.equal(ord.kind, "order");
    const createdOrd = createdOrders.find((o) => o.id === ord.id);
    assert.equal(createdOrd?.notes?.gpay_mobile, "9876543210");
  });
});
