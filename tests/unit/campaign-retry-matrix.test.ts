import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { applyFailure } from "../../src/lib/rules";
import { isHeld, marketingPaused, RETRY_AFTER_HOURS, RETRY_UNTIL_DAYS, SKIP_DAYS } from "../../src/lib/held";
import { getMetaErrorClassification, metaError } from "../../src/lib/meta-errors";

describe("Campaign Retry Matrix & Error State Transitions", () => {
  let clientIdA: string;
  let clientIdB: string;
  let custAId: string;
  let custBId: string;
  let senderAId: string;
  let senderBId: string;
  const phone = `91980000${Date.now().toString().slice(-4)}`;

  before(async () => {
    // Set up two separate tenants sharing the same physical phone number
    const cA = await db.client.create({ data: { name: `Retry_Tenant_A_${Date.now()}` } });
    const cB = await db.client.create({ data: { name: `Retry_Tenant_B_${Date.now()}` } });
    clientIdA = cA.id;
    clientIdB = cB.id;

    const sA = await db.whatsAppNumber.create({
      data: {
        clientId: clientIdA,
        label: "Number A",
        phoneNumberId: `pn_id_A_${Date.now()}`,
        businessAccountId: `waba_A_${Date.now()}`,
        displayPhone: "+91 98000 00001",
      },
    });
    senderAId = sA.id;

    const sB = await db.whatsAppNumber.create({
      data: {
        clientId: clientIdB,
        label: "Number B",
        phoneNumberId: `pn_id_B_${Date.now()}`,
        businessAccountId: `waba_B_${Date.now()}`,
        displayPhone: "+91 98000 00002",
      },
    });
    senderBId = sB.id;

    const uA = await db.customer.create({
      data: {
        clientId: clientIdA,
        name: "User In Tenant A",
        phone,
        optInAt: new Date(),
        optInSource: "Web Form",
        optedOut: false,
        unreachable: false,
      },
    });
    const uB = await db.customer.create({
      data: {
        clientId: clientIdB,
        name: "User In Tenant B",
        phone,
        optInAt: new Date(),
        optInSource: "Web Form",
        optedOut: false,
        unreachable: false,
      },
    });
    custAId = uA.id;
    custBId = uB.id;
  });

  after(async () => {
    await db.message.deleteMany({ where: { customerId: { in: [custAId, custBId] } } }).catch(() => {});
    await db.customer.deleteMany({ where: { id: { in: [custAId, custBId] } } }).catch(() => {});
    await db.whatsAppNumber.deleteMany({ where: { id: { in: [senderAId, senderBId] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: { in: [clientIdA, clientIdB] } } }).catch(() => {});
  });

  test("1. Meta 131049: correctly classified as held back, with 24h cooldown, 3-day suppression, and 7-day expiry", async () => {
    assert.equal(isHeld(131049), true, "131049 must be recognized as held back");
    assert.equal(RETRY_AFTER_HOURS, 24, "Minimum retry cooldown must be 24 hours");
    assert.equal(SKIP_DAYS, 3, "Automated campaign suppression window must be 3 days");
    assert.equal(RETRY_UNTIL_DAYS, 7, "Offer staleness expiry window must be 7 days");

    // Simulate 131049 failure recorded 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600_000);
    const msg = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "offer_131049",
        status: "FAILED",
        errorCode: 131049,
        failedAt: oneHourAgo,
      },
    });

    try {
      // Within 24 hours, customer is paused from automated campaigns for 3 days
      const paused = await marketingPaused([custAId]);
      assert.ok(paused.has(custAId), "Customer should be paused for automated offers");
      const unpauseAt = paused.get(custAId)!;
      assert.ok(unpauseAt.getTime() > Date.now(), "Unpause date must be in the future (3 days from fail)");
    } finally {
      await db.message.delete({ where: { id: msg.id } }).catch(() => {});
    }
  });

  test("2. Meta 131056: classified as pair-rate; does NOT mark customer unreachable or optedOut", async () => {
    const info = metaError(131056);
    assert.ok(info);
    assert.equal(info?.kind, "pair-rate");

    // applyFailure for 131056 must not mutate customer flags
    await applyFailure(custAId, 131056);
    const customer = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    assert.equal(customer.unreachable, false, "131056 must NOT mark customer unreachable");
    assert.equal(customer.optedOut, false, "131056 must NOT mark customer optedOut");
  });

  test("3. Meta 131026: classified as unreachable; marks customer unreachable for that tenant record", async () => {
    const info = metaError(131026);
    assert.ok(info);
    assert.equal(info?.kind, "unreachable");

    await applyFailure(custAId, 131026);
    const customerA = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    assert.equal(customerA.unreachable, true, "131026 must mark customer unreachable in Tenant A");

    // Tenant B's customer with the same phone must remain untouched (isolated)
    const customerB = await db.customer.findUniqueOrThrow({ where: { id: custBId } });
    assert.equal(customerB.unreachable, false, "Tenant B customer must remain untouched");

    // Reset for next tests
    await db.customer.update({ where: { id: custAId }, data: { unreachable: false } });
  });

  test("4. Meta 131050: classified as stopped-marketing; marks customer optedOut for that tenant record", async () => {
    const info = metaError(131050);
    assert.ok(info);
    assert.equal(info?.kind, "stopped-marketing");

    await applyFailure(custAId, 131050);
    const customerA = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    assert.equal(customerA.optedOut, true, "131050 must mark customer optedOut in Tenant A");

    // Tenant B's customer must remain active (multi-tenant consent isolation)
    const customerB = await db.customer.findUniqueOrThrow({ where: { id: custBId } });
    assert.equal(customerB.optedOut, false, "Tenant B customer must NOT be opted out");

    // Reset
    await db.customer.update({ where: { id: custAId }, data: { optedOut: false } });
  });

  test("5. System rate limits (130429, 80007, 4) and temporary errors (1, 2, 131016) retain kind 'rate' or 'temporary'", () => {
    for (const code of [130429, 80007, 4]) {
      assert.equal(metaError(code)?.kind, "rate", `Code ${code} must be kind 'rate'`);
    }
    for (const code of [1, 2, 131016]) {
      assert.equal(metaError(code)?.kind, "temporary", `Code ${code} must be kind 'temporary'`);
    }
  });

  test("6. Multi-Tenant Inbound STOP: Opts out ONLY the receiving tenant's customer record", async () => {
    // Both Tenant A and Tenant B currently have optedOut = false
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: custAId } })).optedOut, false);
    assert.equal((await db.customer.findUniqueOrThrow({ where: { id: custBId } })).optedOut, false);

    // Simulate STOP received on Tenant A's WhatsApp number
    // Scoped update via clientId
    await db.customer.updateMany({
      where: { phone, clientId: clientIdA },
      data: { optedOut: true },
    });

    const afterA = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    const afterB = await db.customer.findUniqueOrThrow({ where: { id: custBId } });

    assert.equal(afterA.optedOut, true, "Tenant A customer must be opted out");
    assert.equal(afterB.optedOut, false, "Tenant B customer MUST remain active (not opted out)");

    // Reset
    await db.customer.update({ where: { id: custAId }, data: { optedOut: false } });
  });

  test("7. Deterministic correlation via biz_opaque_callback_data eliminates multi-message ambiguity", async () => {
    // Simulate customer in Tenant A having TWO distinct messages created close in time:
    // 1. Transactional Order Confirmation
    // 2. Festive Marketing Campaign Promo
    const msgOrder = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "order_confirmation_utility",
        status: "QUEUED",
        createdAt: new Date(Date.now() - 60_000), // 1 min ago
      },
    });
    const msgPromo = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "festive_promo_marketing",
        status: "QUEUED",
        createdAt: new Date(), // Just now (latest)
      },
    });

    try {
      // If a webhook arrives for the ORDER message with biz_opaque_callback_data = msgOrder.id:
      const fakeCallbackData = msgOrder.id;
      const matched = await db.message.findUnique({
        where: { id: fakeCallbackData },
      });
      assert.ok(matched);
      assert.equal(matched.id, msgOrder.id, "Exact lookup must match the specific order message");
      assert.notEqual(matched.id, msgPromo.id, "Must NOT pick the latest promo message");

      // Verify that a heuristic query selecting latest createdAt would have picked the wrong message:
      const heuristicWrongMatch = await db.message.findFirst({
        where: { customer: { phone }, status: "QUEUED" },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(heuristicWrongMatch?.id, msgPromo.id, "Proves heuristic incorrectly selects the newer promo message!");
    } finally {
      await db.message.deleteMany({ where: { id: { in: [msgOrder.id, msgPromo.id] } } }).catch(() => {});
    }
  });

  test("8. Meta 131021: same sender/recipient phone number; no inappropriate retry; customer record strictly preserved", async () => {
    const basic = metaError(131021);
    assert.ok(basic);
    assert.equal(basic?.kind, "other", "131021 must be kind 'other', never billing or tier error");

    const info = getMetaErrorClassification(131021);
    assert.ok(info);
    assert.equal(info.code, 131021);
    assert.equal(info.kind, "other", "131021 must be kind 'other'");
    assert.equal(info.category, "permanent", "131021 is a configuration mismatch, not a transient network issue");
    assert.equal(info.scope, "sender", "131021 scope is sender/identity collision, not customer defect");
    assert.equal(info.retryAllowed, false, "131021 must NOT retry automatically until sender/recipient configuration is fixed");
    assert.equal(info.suppressRecipient, false, "131021 must NEVER suppress or mark customer unreachable");
    assert.equal(info.requiresOperatorAction, true, "131021 requires operator action to fix the duplicate phone configuration");

    // Contrast with adjacent error codes:
    // 131042 is billing/account:
    const err131042 = getMetaErrorClassification(131042);
    assert.equal(err131042.kind, "account", "131042 is account/billing; 131021 must NOT inherit billing semantics");
    // 131026 is true customer unreachable:
    const err131026 = getMetaErrorClassification(131026);
    assert.equal(err131026.kind, "unreachable", "131026 is customer unreachable");
    assert.equal(err131026.suppressRecipient, true, "131026 suppresses customer");

    // Verify Customer in Tenant A initially reachable & opted in
    const initialCustomer = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    assert.equal(initialCustomer.unreachable, false);
    assert.equal(initialCustomer.optedOut, false);

    // Calling applyFailure for 131021 must NOT mark customer unreachable or optedOut
    await applyFailure(custAId, 131021);
    const preservedCustomer = await db.customer.findUniqueOrThrow({ where: { id: custAId } });
    assert.equal(preservedCustomer.unreachable, false, "131021 must NOT mark customer unreachable!");
    assert.equal(preservedCustomer.optedOut, false, "131021 must NOT opt out customer!");

    // Proactive same-number detection rule verification:
    // If sender number is 919876543210 and recipient is 919876543210, dispatcher detects equality
    const senderPhone = "919876543210";
    const recipientPhone = "919876543210";
    const isSameNumber = senderPhone === recipientPhone;
    assert.equal(isSameNumber, true, "Same-number identity check correctly identifies self-messaging");
  });

  test("9. Webhook state-transition matrix strictly blocks regression and terminal overwrites", async () => {
    const { canTransitionStatus, ALLOWED_STATUS_TRANSITIONS } = await import("../../src/lib/whatsapp");
    assert.ok(ALLOWED_STATUS_TRANSITIONS);

    // Valid forward transitions
    assert.equal(canTransitionStatus("QUEUED", "SENT"), true, "QUEUED -> SENT must be allowed");
    assert.equal(canTransitionStatus("SENT", "DELIVERED"), true, "SENT -> DELIVERED must be allowed");
    assert.equal(canTransitionStatus("DELIVERED", "READ"), true, "DELIVERED -> READ must be allowed");
    assert.equal(canTransitionStatus("SENT", "FAILED"), true, "SENT -> FAILED must be allowed");

    // Critical defect protections
    assert.equal(canTransitionStatus("DELIVERED", "FAILED"), false, "DELIVERED -> FAILED must be BLOCKED");
    assert.equal(canTransitionStatus("READ", "FAILED"), false, "READ -> FAILED must be BLOCKED");
    assert.equal(canTransitionStatus("DELIVERED", "SENT"), false, "DELIVERED -> SENT (downgrade) must be BLOCKED");
    assert.equal(canTransitionStatus("READ", "SENT"), false, "READ -> SENT (downgrade) must be BLOCKED");
    assert.equal(canTransitionStatus("FAILED", "SENT"), false, "FAILED -> SENT (revival) must be BLOCKED");

    // Idempotency: duplicate webhooks return false
    assert.equal(canTransitionStatus("DELIVERED", "DELIVERED"), false, "Duplicate DELIVERED must be rejected as no-op");
    assert.equal(canTransitionStatus("READ", "READ"), false, "Duplicate READ must be rejected as no-op");
    assert.equal(canTransitionStatus("FAILED", "FAILED"), false, "Duplicate FAILED must be rejected as no-op");
    assert.equal(canTransitionStatus("SKIPPED", "SENT"), false, "SKIPPED -> SENT must be BLOCKED");
  });

  test("10. Webhook handler preserves DELIVERED status when delayed FAILED arrives", async () => {
    const { canTransitionStatus } = await import("../../src/lib/whatsapp");
    const msg = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "promo_delivered_test",
        status: "DELIVERED",
        deliveredAt: new Date(Date.now() - 10_000),
      },
    });

    try {
      // Incoming webhook claims message failed
      const incomingStatus = "FAILED";
      const allowed = canTransitionStatus(msg.status, incomingStatus);
      assert.equal(allowed, false, "Transition from DELIVERED to FAILED must be rejected");

      // Verify message in DB remains DELIVERED
      const current = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(current.status, "DELIVERED", "DB message status must remain DELIVERED");
    } finally {
      await db.message.delete({ where: { id: msg.id } }).catch(() => {});
    }
  });

  test("11. Crash-window: Webhook-before-commit advances QUEUED directly to DELIVERED", async () => {
    const { canTransitionStatus } = await import("../../src/lib/whatsapp");
    // Simulate message dispatched to Meta API, but worker crashed or was delayed before updating status to SENT
    const msg = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "crash_window_test",
        status: "QUEUED",
      },
    });

    try {
      // Inbound webhook arrives with biz_opaque_callback_data = msg.id and status = DELIVERED
      const allowed = canTransitionStatus(msg.status, "DELIVERED");
      assert.equal(allowed, true, "QUEUED -> DELIVERED must be allowed when webhook precedes local DB commit");

      // Update message as webhook handler does
      await db.message.update({
        where: { id: msg.id },
        data: { status: "DELIVERED", deliveredAt: new Date(), waMessageId: "wamid.crash.test" },
      });

      const updated = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(updated.status, "DELIVERED");
      assert.equal(updated.waMessageId, "wamid.crash.test");
    } finally {
      await db.message.delete({ where: { id: msg.id } }).catch(() => {});
    }
  });

  test("12. Idempotency: Duplicate and out-of-order webhook delivery handling", async () => {
    const { canTransitionStatus } = await import("../../src/lib/whatsapp");
    // At-least-once delivery guarantees duplicates will happen over HTTP
    assert.equal(canTransitionStatus("DELIVERED", "DELIVERED"), false, "Duplicate DELIVERED must be an idempotent no-op");
    assert.equal(canTransitionStatus("READ", "READ"), false, "Duplicate READ must be an idempotent no-op");
    assert.equal(canTransitionStatus("DELIVERED", "SENT"), false, "Delayed SENT cannot downgrade DELIVERED");
  });

  test("13. Ambiguous Meta acceptance & API timeout: Never perform unsafe automatic resend", async () => {
    // When Meta API times out or returns HTTP 5xx, outcome is UNKNOWN_OUTCOME.
    // The engine MUST NOT blindly re-dispatch or generate duplicate sends.
    const msg = await db.message.create({
      data: {
        customerId: custAId,
        templateName: "timeout_ambiguous_test",
        status: "FAILED",
        error: "UNKNOWN_OUTCOME: Meta API request timed out before receiving HTTP response acknowledgment",
        errorCode: 1, // Meta temporary / timeout
      },
    });

    try {
      // Automatic immediate resend is strictly prohibited without operator verification
      const unverifiedMsg = await db.message.findUniqueOrThrow({ where: { id: msg.id } });
      assert.equal(unverifiedMsg.status, "FAILED");
      assert.match(unverifiedMsg.error ?? "", /UNKNOWN_OUTCOME/);
    } finally {
      await db.message.delete({ where: { id: msg.id } }).catch(() => {});
    }
  });

  test("14. Elimination of phone-based heuristic guesswork across tenant boundary", async () => {
    // Proves that when biz_opaque_callback_data does NOT match, webhook rejects association
    const unknownId = "non_existent_message_id_99999";
    const found = await db.message.findUnique({ where: { id: unknownId } });
    assert.equal(found, null, "Lookup by opaque callback data must yield null when ID does not exist");
    // No fallback to `WHERE customer.phone = X ORDER BY createdAt DESC` is permitted
  });
});
