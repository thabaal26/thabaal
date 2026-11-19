import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { db } from "../../src/lib/db";
import { applyFailure } from "../../src/lib/rules";
import {
  classifyMetaDeliveryError,
  calculateDeferredRetry,
  isExplicitlyNotOnWhatsApp,
  BASE_DEFER_MS,
  MAX_DEFER_MS,
  MAX_JITTER_MS,
} from "../../src/lib/whatsapp/error-policy";

describe("CAM-03: Meta Delivery Failure Intelligence & Error Policy Test Suite", () => {
  test("1. Meta 131049: Classified as DEFER_MARKETING with retryAllowed=true and isUnreachable=false", () => {
    const policy = classifyMetaDeliveryError(131049, "Message failed frequency fatigue limit");
    assert.equal(policy.action, "DEFER_MARKETING");
    assert.equal(policy.retryAllowed, true);
    assert.equal(policy.suppressMarketing, true);
    assert.equal(policy.isUnreachable, false);
    assert.equal(policy.requiresReview, false);
    assert.equal(policy.minCooldownMs, BASE_DEFER_MS);
  });

  test("2. Meta 131049: Delay calculation starts at >= 24h + jitter (attempt 1)", () => {
    const fixedNow = new Date("2026-11-20T10:00:00Z");
    const sched = calculateDeferredRetry(1, { now: fixedNow, jitterMs: 3600000 }); // 1 hour jitter
    assert.equal(sched.attempt, 1);
    assert.equal(sched.delayMs, BASE_DEFER_MS + 3600000);
    assert.equal(sched.nextRetryAt.toISOString(), new Date(fixedNow.getTime() + BASE_DEFER_MS + 3600000).toISOString());
    assert.equal(sched.capped, false);
  });

  test("3. Meta 131049: Multi-attempt exponential backoff scales by 1.5^(attempt - 1)", () => {
    const fixedNow = new Date("2026-11-20T10:00:00Z");
    const schedAttempt2 = calculateDeferredRetry(2, { now: fixedNow, jitterMs: 0 });
    // Attempt 2: 24h * 1.5 = 36h
    assert.equal(schedAttempt2.attempt, 2);
    assert.equal(schedAttempt2.delayMs, 36 * 3600 * 1000);

    const schedAttempt3 = calculateDeferredRetry(3, { now: fixedNow, jitterMs: 0 });
    // Attempt 3: 24h * 2.25 = 54h
    assert.equal(schedAttempt3.attempt, 3);
    assert.equal(schedAttempt3.delayMs, 54 * 3600 * 1000);
  });

  test("4. Meta 131049: Extreme retry attempt is strictly capped at 14 days maximum", () => {
    const fixedNow = new Date("2026-11-20T10:00:00Z");
    const schedExtreme = calculateDeferredRetry(15, { now: fixedNow, jitterMs: MAX_JITTER_MS });
    assert.equal(schedExtreme.delayMs, MAX_DEFER_MS);
    assert.equal(schedExtreme.capped, true);
    assert.equal(schedExtreme.nextRetryAt.getTime(), fixedNow.getTime() + MAX_DEFER_MS);
  });

  test("5. Meta 130472: Classified as HOLD_EXPERIMENT (no retry, separate from customer opt-out)", () => {
    const policy = classifyMetaDeliveryError(130472, "User is in experimental test group");
    assert.equal(policy.action, "HOLD_EXPERIMENT");
    assert.equal(policy.retryAllowed, false);
    assert.equal(policy.suppressMarketing, true);
    assert.equal(policy.isUnreachable, false);
    assert.equal(policy.optedOut, false);
  });

  test("5b. Meta 130472: applyFailure strictly preserves customer.optedOut=false", async () => {
    const client = await db.client.create({ data: { name: "Test Client 130472" } });
    const customer = await db.customer.create({
      data: { name: "Test User 130472", phone: "919999111222", clientId: client.id, optedOut: false },
    });
    const policy = await applyFailure(customer.id, 130472, "User in Meta experiment");
    const updated = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(updated.optedOut, false, "Customer optedOut must remain false on 130472 experiment hold");
    assert.equal(policy?.retryAllowed, false, "Retry must be disallowed for 130472");
  });

  test("6. Meta 131026: Details explicitly confirming 'not on WhatsApp' -> SUPPRESS_NON_WHATSAPP (isUnreachable=true)", () => {
    assert.equal(isExplicitlyNotOnWhatsApp("The recipient is not registered on WhatsApp"), true);
    assert.equal(isExplicitlyNotOnWhatsApp("Invalid WhatsApp user: does not exist"), true);
    assert.equal(isExplicitlyNotOnWhatsApp("Receiver is not on WhatsApp"), true);

    const policy = classifyMetaDeliveryError(131026, "The receiver is not on WhatsApp");
    assert.equal(policy.action, "SUPPRESS_NON_WHATSAPP");
    assert.equal(policy.isUnreachable, true);
    assert.equal(policy.retryAllowed, false);
    assert.equal(policy.requiresReview, false);
  });

  test("7. Meta 131026: Ambiguous/transient details route to REVIEW without marking unreachable", () => {
    assert.equal(isExplicitlyNotOnWhatsApp("Message undeliverable"), false);
    assert.equal(isExplicitlyNotOnWhatsApp("User has blocked the sender"), false);
    assert.equal(isExplicitlyNotOnWhatsApp("Incompatible app version"), false);
    assert.equal(isExplicitlyNotOnWhatsApp(""), false);
    assert.equal(isExplicitlyNotOnWhatsApp(null), false);

    const policy = classifyMetaDeliveryError(131026, "Message undeliverable");
    assert.equal(policy.action, "REVIEW");
    assert.equal(policy.isUnreachable, false);
    assert.equal(policy.retryAllowed, false);
    assert.equal(policy.requiresReview, true);
  });

  test("8. Meta 131050: Classified as MARKETING_OPT_OUT (optedOut=true, suppressMarketing=true)", () => {
    const policy = classifyMetaDeliveryError(131050, "Customer unsubscribed from marketing messages");
    assert.equal(policy.action, "MARKETING_OPT_OUT");
    assert.equal(policy.retryAllowed, false);
    assert.equal(policy.optedOut, true);
    assert.equal(policy.suppressMarketing, true);
    assert.equal(policy.isUnreachable, false);
  });

  test("9. Meta 130429 & rate limits: Classified as BACKOFF (retryAllowed=true, isUnreachable=false)", () => {
    const policy130429 = classifyMetaDeliveryError(130429, "Rate limit exceeded for sender phone");
    assert.equal(policy130429.action, "BACKOFF");
    assert.equal(policy130429.retryAllowed, true);
    assert.equal(policy130429.isUnreachable, false);

    const policy80007 = classifyMetaDeliveryError(80007, "API rate limit reached");
    assert.equal(policy80007.action, "BACKOFF");
    assert.equal(policy80007.retryAllowed, true);
  });

  test("10. Meta 131053: Classified as REPAIR_MEDIA (requires operator review, does not mutate template)", () => {
    const policy = classifyMetaDeliveryError(131053, "Media download error: server returned 404");
    assert.equal(policy.action, "REPAIR_MEDIA");
    assert.equal(policy.retryAllowed, false);
    assert.equal(policy.requiresReview, true);
    assert.equal(policy.isUnreachable, false);
  });

  test("11. applyFailure integration: Explicit 'not on WhatsApp' detail marks customer.unreachable=true", async () => {
    const client = await db.client.create({
      data: { name: "Test Client ErrPol1", waPhoneNumberId: "111222333" },
    });
    const customer = await db.customer.create({
      data: {
        name: "Test Unregistered User",
        phone: "919999888877",
        clientId: client.id,
        unreachable: false,
      },
    });

    await applyFailure(customer.id, 131026, "Recipient phone is not on WhatsApp");
    const updated = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(updated.unreachable, true, "Customer must be marked unreachable when explicitly not on WhatsApp");
  });

  test("12. applyFailure integration: Ambiguous 131026 detail preserves customer.unreachable=false", async () => {
    const client = await db.client.create({
      data: { name: "Test Client ErrPol2", waPhoneNumberId: "444555666" },
    });
    const customer = await db.customer.create({
      data: {
        name: "Test Ambiguous User",
        phone: "919999888866",
        clientId: client.id,
        unreachable: false,
      },
    });

    await applyFailure(customer.id, 131026, "Message undeliverable");
    const updated = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    assert.equal(updated.unreachable, false, "Customer must NOT be marked unreachable for ambiguous 131026 failures");
  });
});
