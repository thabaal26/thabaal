import { test } from "node:test";
import assert from "node:assert/strict";
import { canOfferManualFallback } from "../../src/lib/billing-fallback-policy";

test("SaaS AutoPay to Manual One-Time Order Fallback Policy Suite", async (t) => {
  await t.test("1. Allows fallback after confirmed terminal failure", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "FAILED_FINAL",
        mandateStillLive: false,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      true
    );
  });

  await t.test("2. Allows fallback after mandate cancellation", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "CANCELLED",
        mandateStillLive: false,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      true
    );
  });

  await t.test("3. Allows fallback after mandate expiration", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "EXPIRED",
        mandateStillLive: false,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      true
    );
  });

  await t.test("4. Blocks fallback when mandate is pending (prevents double debit)", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "PENDING",
        mandateStillLive: true,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      false
    );
  });

  await t.test("5. Blocks fallback after mandate authorization", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "AUTHENTICATED",
        mandateStillLive: true,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      false
    );
  });

  await t.test("6. Blocks fallback when charge was already captured", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "FAILED_FINAL",
        mandateStillLive: false,
        hasCapturedCharge: true,
        hasEntitlementForPeriod: false,
      }),
      false
    );
  });

  await t.test("7. Blocks fallback when billing period is already granted", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "FAILED_FINAL",
        mandateStillLive: false,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: true,
      }),
      false
    );
  });

  await t.test("8. Blocks fallback when provider state is unknown", () => {
    assert.equal(
      canOfferManualFallback({
        autoPay: "UNKNOWN",
        mandateStillLive: true,
        hasCapturedCharge: false,
        hasEntitlementForPeriod: false,
      }),
      false
    );
  });
});
