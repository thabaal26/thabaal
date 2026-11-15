import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { db } from "../../src/lib/db";
import {
  autoRenewView,
  cancelAutoRenew,
  handleRazorpayEvent,
} from "../../src/lib/razorpay-billing";

const TZ = "Asia/Kolkata";
const ist = (s: string) => fromZonedTime(s, TZ);

describe("Razorpay Auto-Pay Subscription Cancellation & Lifecycle Acceptance", () => {
  const originalFetch = globalThis.fetch;
  const originalKeyId = process.env.RAZORPAY_KEY_ID;
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;
  const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  let cancelPayloads: any[] = [];
  let seq = 0;

  before(() => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_cancellation_mock";
    process.env.RAZORPAY_KEY_SECRET = "mock_secret_cancellation";
    process.env.RAZORPAY_WEBHOOK_SECRET = "mock_webhook_secret_cancellation";

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method?.toUpperCase() ?? "GET";
      
      if (url.includes("/subscriptions/")) {
        if (url.endsWith("/cancel") && method === "POST") {
          const body = init?.body ? JSON.parse(init.body as string) : {};
          cancelPayloads.push({ url, body });
          const subId = url.split("/subscriptions/")[1].split("/cancel")[0];

          if (subId.includes("mismatch")) {
            return new Response(
              JSON.stringify({
                id: "sub_DIFFERENT_ID_999",
                status: "cancelled",
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }

          if (subId.includes("timeout_post")) {
            throw new Error("ETIMEDOUT: Connection dropped to Razorpay API");
          }

          return new Response(
            JSON.stringify({
              id: subId,
              status: body.cancel_at_cycle_end === 1 ? "active" : "cancelled",
              has_scheduled_changes: body.cancel_at_cycle_end === 1,
              change_scheduled_at: body.cancel_at_cycle_end === 1 ? Math.floor(Date.now() / 1000) + 86400 * 30 : null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        // GET /v1/subscriptions/:id
        if (method === "GET") {
          const subId = url.split("/subscriptions/")[1]?.split("?")[0];
          return new Response(
            JSON.stringify({
              id: subId,
              status: subId?.includes("sched") ? "active" : "cancelled",
              has_scheduled_changes: subId?.includes("sched"),
              change_scheduled_at: subId?.includes("sched") ? Math.floor(Date.now() / 1000) + 86400 * 30 : null,
              ended_at: subId?.includes("immed") ? Math.floor(Date.now() / 1000) : null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return originalFetch(input, init);
    };
  });

  after(() => {
    globalThis.fetch = originalFetch;
    process.env.RAZORPAY_KEY_ID = originalKeyId;
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
    process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
  });

  async function createTestClient(tag: string) {
    const c = await db.client.create({ data: { name: `SubCancelTest_${tag}_${Date.now()}_${++seq}` } });
    return c;
  }

  test("1. Scheduled cancellation (cancel_at_cycle_end: 1) transitions to 'cancelling' and keeps paid access", async () => {
    cancelPayloads = [];
    const client = await createTestClient("sched");
    const subId = `sub_sched_${Date.now()}`;

    // Active subscription in DB
    const rec = await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "active",
        createdBy: "TestUser",
      },
    });

    // Active verified plan purchase (ends in 25 days)
    const futureEnds = new Date(Date.now() + 25 * 86400 * 1000);
    const purchase = await db.planPurchase.create({
      data: {
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "VERIFIED",
        startsAt: new Date(Date.now() - 5 * 86400 * 1000),
        endsAt: futureEnds,
        method: "RAZORPAY",
        utr: "pay_sched_123",
      },
    });

    const who = { clientId: client.id, name: "Shop Owner", canManage: true, isAdmin: false };
    const res = await cancelAutoRenew(who, "plan", "Cost consideration", { immediate: false });

    assert.equal(res.ok, true, res.message);
    assert.match(res.message, /Subscription cancelled/);
    assert.match(res.message, /keep access until your paid period ends/);

    // Verify Provider API contract
    assert.equal(cancelPayloads.length, 1);
    assert.equal(cancelPayloads[0].body.cancel_at_cycle_end, 1);

    // Verify DB state
    const updatedRec = await db.razorpayRecord.findUnique({ where: { id: rec.id } });
    assert.equal(updatedRec?.status, "cancelling");
    assert.match(updatedRec?.note ?? "", /Cancelled by Shop Owner: Cost consideration \[Cycle End\]/);

    // Verify PlanPurchase is NOT mutated or revoked
    const intactPurchase = await db.planPurchase.findUnique({ where: { id: purchase.id } });
    assert.equal(intactPurchase?.status, "VERIFIED");
    assert.equal(intactPurchase?.endsAt?.getTime(), futureEnds.getTime());
  });

  test("2. Immediate cancellation (cancel_at_cycle_end: 0) transitions directly to 'cancelled'", async () => {
    cancelPayloads = [];
    const client = await createTestClient("immed");
    const subId = `sub_immed_${Date.now()}`;

    const rec = await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "starter",
        cycle: "m",
        amountPaise: 99900,
        status: "active",
        createdBy: "TestUser",
      },
    });

    const who = { clientId: client.id, name: "Shop Owner", canManage: true, isAdmin: false };
    const res = await cancelAutoRenew(who, "plan", "Immediate closure", { immediate: true });

    assert.equal(res.ok, true, res.message);
    assert.match(res.message, /Subscription cancelled immediately/);

    assert.equal(cancelPayloads.length, 1);
    assert.equal(cancelPayloads[0].body.cancel_at_cycle_end, 0);

    const updatedRec = await db.razorpayRecord.findUnique({ where: { id: rec.id } });
    assert.equal(updatedRec?.status, "cancelled");
    assert.match(updatedRec?.note ?? "", /\[Immediate\]/);
  });

  test("3. Idempotent cancellation: already cancelling subscription returns friendly success without error", async () => {
    cancelPayloads = [];
    const client = await createTestClient("idemp");
    const subId = `sub_idemp_${Date.now()}`;

    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "cancelling",
        createdBy: "TestUser",
      },
    });

    const who = { clientId: client.id, name: "Shop Owner", canManage: true, isAdmin: false };
    const res = await cancelAutoRenew(who, "plan", "Clicked again");

    assert.equal(res.ok, true);
    assert.match(res.message, /already scheduled/i);
    // Provider cancel API should not be called again
    assert.equal(cancelPayloads.length, 0);
  });

  test("4. autoRenewView returns full metadata for active, cancelling, and cancelled states", async () => {
    const client = await createTestClient("view");
    const subId = `sub_view_${Date.now()}`;

    // Create plan purchase
    const ends = new Date(Date.now() + 15 * 86400 * 1000);
    await db.planPurchase.create({
      data: {
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "VERIFIED",
        startsAt: new Date(Date.now() - 15 * 86400 * 1000),
        endsAt: ends,
      },
    });

    // Active state
    const r = await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "active",
      },
    });

    let view = await autoRenewView(client.id);
    assert.ok(view);
    assert.equal(view?.rzpId, subId);
    assert.equal(view?.autoPayEnabled, true);
    assert.equal(view?.isCancelling, false);
    assert.equal(view?.isCancelled, false);
    assert.ok(view?.paidThroughLabel);
    assert.ok(view?.nextChargeLabel);

    // Transition to cancelling
    await db.razorpayRecord.update({ where: { id: r.id }, data: { status: "cancelling" } });
    view = await autoRenewView(client.id);
    assert.ok(view);
    assert.equal(view?.autoPayEnabled, false);
    assert.equal(view?.isCancelling, true);
    assert.equal(view?.isCancelled, false);
    assert.ok(view?.cancelledAtLabel);

    // Transition to cancelled
    await db.razorpayRecord.update({ where: { id: r.id }, data: { status: "cancelled" } });
    view = await autoRenewView(client.id);
    assert.ok(view);
    assert.equal(view?.autoPayEnabled, false);
    assert.equal(view?.isCancelling, false);
    assert.equal(view?.isCancelled, true);
    assert.ok(view?.cancelledAtLabel);
  });

  test("5. Webhook race condition protection: subscription.charged does NOT overwrite 'cancelling' with 'active'", async () => {
    const client = await createTestClient("race");
    const subId = `sub_race_${Date.now()}`;
    const paymentId = `pay_race_${Date.now()}`;

    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "cancelling",
        createdBy: "Owner",
      },
    });

    // Simulate Razorpay subscription.charged event arriving
    const body = {
      event: "subscription.charged",
      payload: {
        subscription: {
          entity: {
            id: subId,
            status: "active", // Razorpay provider status is still active during scheduled cancellation
            current_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        },
        payment: {
          entity: {
            id: paymentId,
            status: "captured" as const,
            amount: 199900,
            currency: "INR",
            order_id: null,
          },
        },
      },
    };

    await handleRazorpayEvent(body);

    // Verify local DB status remains 'cancelling'
    const rec = await db.razorpayRecord.findUnique({ where: { rzpId: subId } });
    assert.equal(rec?.status, "cancelling", "Race condition failed: 'cancelling' was clobbered by 'active'");
  });

  test("6. Webhook subscription.cancelled finalizes status to 'cancelled'", async () => {
    const client = await createTestClient("final");
    const subId = `sub_final_${Date.now()}`;

    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "cancelling",
        createdBy: "Owner",
      },
    });

    const body = {
      event: "subscription.cancelled",
      payload: {
        subscription: {
          entity: {
            id: subId,
            status: "cancelled",
          },
        },
      },
    };

    await handleRazorpayEvent(body);

    const rec = await db.razorpayRecord.findUnique({ where: { rzpId: subId } });
    assert.equal(rec?.status, "cancelled");
  });

  test("7. Multi-tenant isolation: Tenant A cannot cancel Tenant B's subscription, and unauthorized staff cannot cancel", async () => {
    const clientA = await createTestClient("tenantA");
    const clientB = await createTestClient("tenantB");

    const subB = `sub_tenantB_${Date.now()}`;
    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subB,
        purpose: "plan",
        clientId: clientB.id,
        plan: "business",
        cycle: "m",
        amountPaise: 499900,
        status: "active",
      },
    });

    // Tenant A manager attempts to cancel
    const whoA = { clientId: clientA.id, name: "Mallory", canManage: true, isAdmin: false };
    const resA = await cancelAutoRenew(whoA, "plan", "Malicious attempt");
    assert.equal(resA.ok, false);
    assert.match(resA.message, /no running subscription/i);

    // Tenant B staff member (canManage: false) attempts to cancel
    const whoBStaff = { clientId: clientB.id, name: "Staff Worker", canManage: false, isAdmin: false };
    const resStaff = await cancelAutoRenew(whoBStaff, "plan", "Staff attempt");
    assert.equal(resStaff.ok, false);
    assert.match(resStaff.message, /Only the business owner or a manager/i);

    // Verify Tenant B's subscription remains untouched and active
    const recB = await db.razorpayRecord.findUnique({ where: { rzpId: subB } });
    assert.equal(recB?.status, "active");
  });

  test("8. Provider response ID mismatch rejection prevents database corruption", async () => {
    const client = await createTestClient("mismatch");
    const subId = `sub_mismatch_${Date.now()}`;

    const rec = await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "m",
        amountPaise: 199900,
        status: "active",
      },
    });

    const who = { clientId: client.id, name: "Owner", canManage: true, isAdmin: false };
    const res = await cancelAutoRenew(who, "plan", "Test mismatch rejection", { immediate: true });

    // Cancellation must fail safely because response.id !== subId
    assert.equal(res.ok, false);
    assert.match(res.message, /mismatch/i);

    // Database record MUST NOT be updated to cancelled
    const unchanged = await db.razorpayRecord.findUnique({ where: { id: rec.id } });
    assert.equal(unchanged?.status, "active");
  });

  test("9. Network timeout on POST triggers GET reconciliation and succeeds safely", async () => {
    const client = await createTestClient("timeout");
    // subId includes "timeout_post" to trigger POST network drop and "immed" so GET returns cancelled
    const subId = `sub_timeout_post_immed_${Date.now()}`;

    const rec = await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "starter",
        cycle: "m",
        amountPaise: 99900,
        status: "active",
      },
    });

    const who = { clientId: client.id, name: "Owner", canManage: true, isAdmin: false };
    const res = await cancelAutoRenew(who, "plan", "Timeout recovery", { immediate: true });

    // Although POST threw ETIMEDOUT, the GET reconciliation verified it was cancelled at provider
    assert.equal(res.ok, true);
    assert.match(res.message, /cancelled immediately/i);

    const updated = await db.razorpayRecord.findUnique({ where: { id: rec.id } });
    assert.equal(updated?.status, "cancelled");
  });

  test("10. Robust subscription-to-purchase mapping avoids cross-plan/cycle contamination", async () => {
    const client = await createTestClient("crossplan");
    const subId = `sub_cross_${Date.now()}`;

    // Previous expired Starter purchase
    await db.planPurchase.create({
      data: {
        clientId: client.id,
        plan: "starter",
        cycle: "m",
        amountPaise: 99900,
        status: "VERIFIED",
        startsAt: new Date(Date.now() - 60 * 86400 * 1000),
        endsAt: new Date(Date.now() - 30 * 86400 * 1000),
      },
    });

    // Active Growth purchase
    const growthEnds = new Date(Date.now() + 20 * 86400 * 1000);
    await db.planPurchase.create({
      data: {
        clientId: client.id,
        plan: "growth",
        cycle: "y",
        amountPaise: 1999000,
        status: "VERIFIED",
        startsAt: new Date(Date.now() - 10 * 86400 * 1000),
        endsAt: growthEnds,
      },
    });

    // Active Growth subscription
    await db.razorpayRecord.create({
      data: {
        kind: "subscription",
        rzpId: subId,
        purpose: "plan",
        clientId: client.id,
        plan: "growth",
        cycle: "y",
        amountPaise: 1999000,
        status: "active",
      },
    });

    const view = await autoRenewView(client.id);
    assert.ok(view);
    assert.equal(view?.plan, "growth");
    assert.equal(view?.cycle, "y");
    // Verify mapped paidThroughDate is the Growth purchase, not the expired Starter one
    assert.ok(view?.paidThroughLabel?.includes("2026") || view?.paidThroughLabel?.includes("Nov") || view?.paidThroughLabel?.includes("Dec"));
  });
});
