/**
 * Pure policy engine for SaaS Subscription to One-Time Order fallback.
 * Governs when a tenant can safely fall back to a manual one-time order (startPlanOrder)
 * after an auto-renew or UPI AutoPay mandate failure.
 *
 * Core Financial Invariant:
 * A pending, authenticating, or already-charged mandate must NEVER trigger a manual
 * order fallback, preventing accidental double billing.
 */

export type AutoPayState =
  | "NOT_STARTED"
  | "PENDING"
  | "AUTHENTICATED"
  | "ACTIVE"
  | "FAILED_FINAL"
  | "CANCELLED"
  | "EXPIRED"
  | "UNKNOWN";

export type ManualPaymentState =
  | "NOT_STARTED"
  | "ORDER_CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FAILED";

export interface FallbackEvaluationInput {
  autoPay: AutoPayState;
  mandateStillLive: boolean;
  hasCapturedCharge: boolean;
  hasEntitlementForPeriod: boolean;
}

/**
 * Evaluates whether a tenant experiencing AutoPay friction is eligible to
 * fall back to a manual one-time order (startPlanOrder).
 */
export function canOfferManualFallback(input: FallbackEvaluationInput): boolean {
  // Fallback is only permissible upon confirmed terminal failure states
  const terminalFailure =
    input.autoPay === "FAILED_FINAL" ||
    input.autoPay === "CANCELLED" ||
    input.autoPay === "EXPIRED";

  return (
    terminalFailure &&
    !input.mandateStillLive &&
    !input.hasCapturedCharge &&
    !input.hasEntitlementForPeriod
  );
}
