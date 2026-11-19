/**
 * Centralized Meta Delivery Failure Policy Engine (CAM-03).
 *
 * Provides authoritative classification, delay calculation, and customer state
 * mutation policies across all 4 delivery paths:
 * 1. Immediate Meta Graph API send error responses
 * 2. Provider delivery status webhooks (FAILED)
 * 3. Scheduled background retry workers
 * 4. Manual resend UI actions
 */

export type ErrorPolicyAction =
  | "DEFER_MARKETING"
  | "HOLD_EXPERIMENT"
  | "SUPPRESS_NON_WHATSAPP"
  | "REVIEW"
  | "MARKETING_OPT_OUT"
  | "BACKOFF"
  | "REPAIR_MEDIA"
  | "NUMBER_RESTRICTED"
  | "SETUP_AUTHENTICATION"
  | "TEMPORARY_RETRY"
  | "OTHER_FAILURE";

export interface MetaDeliveryPolicyResult {
  code: number | null;
  action: ErrorPolicyAction;
  retryAllowed: boolean;
  isUnreachable: boolean;
  suppressMarketing: boolean;
  requiresReview: boolean;
  optedOut?: boolean;
  customerFacingStatus: string;
  minCooldownMs?: number;
  explanation: string;
}

export interface RetryScheduleCalculation {
  delayMs: number;
  nextRetryAt: Date;
  attempt: number;
  capped: boolean;
}

export const BASE_DEFER_MS = 24 * 60 * 60 * 1000; // 24 hours (86,400,000 ms)
export const MAX_DEFER_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (1,209,600,000 ms)
export const MAX_JITTER_MS = 6 * 60 * 60 * 1000; // 6 hours (21,600,000 ms)

/**
 * Calculates exponential backoff schedule with bounded server-side jitter for 131049.
 * Formula: Math.min(24h * 1.5^(attempt - 1) + jitter, 14 days)
 *
 * Guardrail: Does not assume 24h guarantees eligibility; incorporates jitter and exponential delay.
 */
export function calculateDeferredRetry(
  attempt = 1,
  options?: { now?: Date; jitterMs?: number }
): RetryScheduleCalculation {
  const safeAttempt = Math.max(1, attempt);
  const now = options?.now ?? new Date();

  // Exponential factor: 1.0 (attempt 1), 1.5 (attempt 2), 2.25 (attempt 3), etc.
  const multiplier = Math.pow(1.5, safeAttempt - 1);
  const baseDelay = BASE_DEFER_MS * multiplier;

  // Bounded server jitter: 0 to MAX_JITTER_MS (or test-injected jitter)
  const jitter =
    options?.jitterMs !== undefined
      ? Math.max(0, Math.min(options.jitterMs, MAX_JITTER_MS))
      : Math.floor(Math.random() * MAX_JITTER_MS);

  const rawDelay = baseDelay + jitter;
  const capped = rawDelay >= MAX_DEFER_MS;
  const delayMs = Math.min(rawDelay, MAX_DEFER_MS);
  const nextRetryAt = new Date(now.getTime() + delayMs);

  return {
    delayMs,
    nextRetryAt,
    attempt: safeAttempt,
    capped,
  };
}

/**
 * Evaluates whether provider error details explicitly prove that the recipient is not on WhatsApp.
 */
export function isExplicitlyNotOnWhatsApp(details?: string | null): boolean {
  if (!details || typeof details !== "string") return false;
  const normalized = details.toLowerCase();
  return (
    normalized.includes("not on whatsapp") ||
    normalized.includes("not registered") ||
    normalized.includes("unregistered") ||
    normalized.includes("does not exist") ||
    normalized.includes("invalid whatsapp user") ||
    normalized.includes("user is not a valid whatsapp account") ||
    normalized.includes("recipient is not a valid whatsapp user") ||
    normalized.includes("user is not on whatsapp")
  );
}

/**
 * Pure policy function classifying Meta delivery failures into operational actions.
 */
export function classifyMetaDeliveryError(
  code: number | null | undefined,
  details?: string | null
): MetaDeliveryPolicyResult {
  const numCode = code !== null && code !== undefined ? Number(code) : null;

  switch (numCode) {
    case 131049:
      return {
        code: 131049,
        action: "DEFER_MARKETING",
        retryAllowed: true,
        isUnreachable: false,
        suppressMarketing: true,
        requiresReview: false,
        minCooldownMs: BASE_DEFER_MS,
        customerFacingStatus: "Temporarily held by Meta (frequency limit)",
        explanation:
          "Meta held this offer back to protect the recipient from message fatigue. Deferred with backoff + jitter.",
      };

    case 130472:
      return {
        code: 130472,
        action: "HOLD_EXPERIMENT",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: true,
        requiresReview: false,
        optedOut: false,
        customerFacingStatus: "Meta marketing experiment limitation",
        explanation:
          "User is part of an ongoing Meta marketing experiment preventing delivery. Automatic retries held; separate from opt-out.",
      };

    case 131026: {
      const explicitNotOnWA = isExplicitlyNotOnWhatsApp(details);
      if (explicitNotOnWA) {
        return {
          code: 131026,
          action: "SUPPRESS_NON_WHATSAPP",
          retryAllowed: false,
          isUnreachable: true,
          suppressMarketing: true,
          requiresReview: false,
          customerFacingStatus: "Not registered on WhatsApp",
          explanation:
            "Provider explicitly confirmed recipient is not registered on WhatsApp. Customer marked unreachable.",
        };
      }
      return {
        code: 131026,
        action: "REVIEW",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: true,
        customerFacingStatus: "Undeliverable (requires operator review)",
        explanation:
          "Delivery failed without explicit confirmation of non-registration (e.g. app version or transient issue). Not marked unreachable; flagged for review.",
      };
    }

    case 131050:
      return {
        code: 131050,
        action: "MARKETING_OPT_OUT",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: true,
        requiresReview: false,
        optedOut: true,
        customerFacingStatus: "Opted out of marketing",
        explanation:
          "Customer opted out of marketing messages from this business. Marketing sends suppressed.",
      };

    case 130429:
    case 80007:
    case 4:
      return {
        code: numCode,
        action: "BACKOFF",
        retryAllowed: true,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: false,
        customerFacingStatus: "Rate limited by Meta",
        explanation:
          "Meta API rate limit reached. Re-routed to shared provider backoff queue.",
      };

    case 131053:
      return {
        code: 131053,
        action: "REPAIR_MEDIA",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: true,
        customerFacingStatus: "Media download failed",
        explanation:
          "Meta could not download media header asset. Flagged for operator review; template content preserved.",
      };

    case 131048:
    case 368:
    case 131031:
      return {
        code: numCode,
        action: "NUMBER_RESTRICTED",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: true,
        customerFacingStatus: "WhatsApp sender number restricted",
        explanation:
          "WhatsApp sender number is restricted or locked by Meta. Pauses campaign to prevent further quality downgrade.",
      };

    case 0:
    case 3:
    case 10:
    case 190:
    case 200:
    case 131005:
      return {
        code: numCode,
        action: "SETUP_AUTHENTICATION",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: true,
        customerFacingStatus: "Meta authentication or permission failure",
        explanation:
          "Access token or app permissions are invalid or expired. Requires admin token refresh in Settings.",
      };

    case 1:
    case 2:
    case 131016:
    case 131057:
    case 133004:
      return {
        code: numCode,
        action: "TEMPORARY_RETRY",
        retryAllowed: true,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: false,
        customerFacingStatus: "Meta temporarily unavailable",
        explanation:
          "WhatsApp service or servers temporarily unavailable. Retried on subsequent dispatch cycles.",
      };

    default:
      return {
        code: numCode,
        action: "OTHER_FAILURE",
        retryAllowed: false,
        isUnreachable: false,
        suppressMarketing: false,
        requiresReview: false,
        customerFacingStatus: "Delivery failure",
        explanation: details || "Unclassified failure.",
      };
  }
}
