import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import {
  getTenantNotificationEmail,
  notifyTenantPaymentSuccess,
  type TenantPaymentSuccessInput,
} from "../../src/lib/razorpay-billing";

describe("Finforte Official Email & Tenant Payment Success Notifications", () => {
  const originalFetch = globalThis.fetch;
  const originalResendKey = process.env.RESEND_API_KEY;
  let dispatchedEmails: Array<{ to: string; subject: string; intro?: string; rows: [string, string][] }> = [];

  const finforteClientId = "c_finforte_001";
  const separateClientId = "c_test_other_tenant_" + Date.now();

  before(async () => {
    process.env.RESEND_API_KEY = "mock_resend_api_key_test";
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.resend.com/emails")) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        dispatchedEmails.push({
          to: Array.isArray(body.to) ? body.to[0] : body.to,
          subject: body.subject,
          intro: body.text,
          rows: [],
        });
        return new Response(JSON.stringify({ id: "mock_resend_email_id_" + Date.now() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };

    // Ensure Finforte client and user exist in the test DB
    await db.client.upsert({
      where: { id: finforteClientId },
      update: {
        name: "Finforte",
        paySettings: {
          officialEmail: "rathandeep@candbindia.com",
          paymentNotificationEmail: "rathandeep@candbindia.com",
        },
      },
      create: {
        id: finforteClientId,
        name: "Finforte",
        paySettings: {
          officialEmail: "rathandeep@candbindia.com",
          paymentNotificationEmail: "rathandeep@candbindia.com",
        },
      },
    });

    await db.user.upsert({
      where: { email: "rathandeep@candbindia.com" },
      update: {
        name: "Rathandeep",
        role: "CLIENT",
        access: "MANAGER",
        clientId: finforteClientId,
      },
      create: {
        email: "rathandeep@candbindia.com",
        name: "Rathandeep",
        role: "CLIENT",
        access: "MANAGER",
        clientId: finforteClientId,
        passwordHash: "$2b$12$mockhashfinforte0000000000000000000000000000000000000000",
      },
    });

    // Create a separate tenant to test strict isolation
    await db.client.create({
      data: {
        id: separateClientId,
        name: "Other Business QA",
      },
    });

    await db.user.create({
      data: {
        email: "other.manager@example.com",
        name: "Other Manager",
        role: "CLIENT",
        access: "MANAGER",
        clientId: separateClientId,
        passwordHash: "$2b$12$mockhashother00000000000000000000000000000000000000000000",
      },
    });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    if (originalResendKey) {
      process.env.RESEND_API_KEY = originalResendKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }

    await db.user.deleteMany({ where: { clientId: separateClientId } }).catch(() => {});
    await db.client.deleteMany({ where: { id: separateClientId } }).catch(() => {});
  });

  beforeEach(() => {
    dispatchedEmails = [];
  });

  test("1. Finforte tenant resolves official email as rathandeep@candbindia.com", async () => {
    const info = await getTenantNotificationEmail(finforteClientId);
    assert.ok(info, "Expected tenant notification info to be found");
    assert.strictEqual(info.email, "rathandeep@candbindia.com", "Email must be normalized lowercase rathandeep@candbindia.com");
    assert.strictEqual(info.clientName, "Finforte");
  });

  test("2. Strict Tenant Isolation: Finforte vs Other Tenants", async () => {
    const finforteInfo = await getTenantNotificationEmail(finforteClientId);
    const otherInfo = await getTenantNotificationEmail(separateClientId);

    assert.ok(finforteInfo);
    assert.strictEqual(finforteInfo.email, "rathandeep@candbindia.com");

    assert.ok(otherInfo);
    assert.notStrictEqual(otherInfo.email, "rathandeep@candbindia.com", "Other tenant must not use Finforte email");
    assert.strictEqual(otherInfo.email, "other.manager@example.com");
  });

  test("3. Payment Success Notification dispatch for Finforte delivers to Rathandeep", async () => {
    const testPaymentId = "pay_finforte_test_" + Date.now();
    const result = await notifyTenantPaymentSuccess({
      clientId: finforteClientId,
      amountPaise: 299900,
      paymentId: testPaymentId,
      reference: "sub_finforte_growth_01",
      purpose: "Subscription Plan Renewal",
      plan: "growth",
      cycle: "m",
    });

    assert.ok(result.ok, `Expected notification ok, got: ${result.error}`);
    assert.strictEqual(dispatchedEmails.length, 1, "Expected exactly 1 email dispatched");
    assert.strictEqual(dispatchedEmails[0].to, "rathandeep@candbindia.com", "Recipient must be rathandeep@candbindia.com");
    assert.ok(dispatchedEmails[0].subject.includes("Finforte"), "Subject must contain client name Finforte");
    assert.ok(dispatchedEmails[0].subject.includes("2,999"), "Subject must contain formatted amount");
  });

  test("4. Webhook Idempotency: Duplicate payment success notification is suppressed", async () => {
    const duplicatePaymentId = "pay_idempotent_test_" + Date.now();
    const input: TenantPaymentSuccessInput = {
      clientId: finforteClientId,
      amountPaise: 499900,
      paymentId: duplicatePaymentId,
      reference: "order_idempotent_01",
      purpose: "Plan Purchase",
      plan: "pro",
      cycle: "m",
    };

    // First delivery
    const firstResult = await notifyTenantPaymentSuccess(input);
    assert.ok(firstResult.ok);
    assert.strictEqual(dispatchedEmails.length, 1, "First attempt should send 1 email");

    // Second delivery (simulating webhook retry or duplicate checkout call)
    const secondResult = await notifyTenantPaymentSuccess(input);
    assert.ok(secondResult.ok);
    assert.strictEqual(secondResult.skipped, true, "Second attempt must be skipped");
    assert.strictEqual(dispatchedEmails.length, 1, "Email count must remain 1 (no duplicate sent)");
  });

  test("5. Other tenant payment success notification routes to that tenant's manager, NOT Finforte", async () => {
    const otherPaymentId = "pay_other_iso_" + Date.now();
    const otherResult = await notifyTenantPaymentSuccess({
      clientId: separateClientId,
      amountPaise: 10000,
      paymentId: otherPaymentId,
      reference: "order_other_w1",
      purpose: "Wallet Recharge",
    });

    assert.ok(otherResult.ok);
    assert.strictEqual(dispatchedEmails.length, 1);
    assert.strictEqual(dispatchedEmails[0].to, "other.manager@example.com");
    assert.notStrictEqual(dispatchedEmails[0].to, "rathandeep@candbindia.com", "Other payment must NEVER go to Finforte");
  });

  test("6. Graceful resilience when email service is unconfigured or returns error", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    const noCrashPaymentId = "pay_nocrash_" + Date.now();
    const res = await notifyTenantPaymentSuccess({
      clientId: finforteClientId,
      amountPaise: 10000,
      paymentId: noCrashPaymentId,
      reference: "order_nocrash_01",
      purpose: "Wallet Recharge",
    });

    // Should return result without throwing an uncaught exception
    assert.strictEqual(res.ok, false);
    assert.ok(res.error?.includes("RESEND_API_KEY"));

    process.env.RESEND_API_KEY = prevKey;
  });
});
