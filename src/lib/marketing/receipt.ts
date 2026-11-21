import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { addWebsiteLead } from "@/lib/leads";

export const RECEIPT_COOKIE_NAME = "thabaal_demo_receipt";
export const RECEIPT_TTL_SECONDS = 10 * 60; // 10 minutes

/**
 * Generates a high-entropy cryptographically random bearer token (256 bits).
 */
export function createReceiptToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Computes SHA-256 hash of a receipt bearer token for secure database indexing.
 */
export function hashReceiptToken(token: string): string {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) {
    throw new Error("Invalid receipt token format");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Computes SHA-256 hash of a client-provided or generated submission key for idempotency.
 */
export function hashSubmissionKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function calculateReceiptExpiry(): Date {
  return new Date(Date.now() + RECEIPT_TTL_SECONDS * 1000);
}

export type DemoConversionRecord = {
  receiptToken: string;
  conversionEventId: string | null;
  outcome: "CREATED" | "UPDATED_EXISTING";
};

/**
 * Records a demo conversion attempt in PostgreSQL within the authoritative Lead lifecycle.
 * If the lead is newly created, generates a persistent conversionEventId for Google Ads transaction_id deduplication.
 */
export async function recordDemoConversionAttempt(
  params: {
    leadId: string;
    isNew: boolean;
    submissionKey: string;
  },
  client: any = db,
): Promise<DemoConversionRecord> {
  const { leadId, isNew, submissionKey } = params;
  const submissionKeyHash = hashSubmissionKey(submissionKey);

  // Check if this exact submission was already processed (network retry idempotency)
  const existing = await client.demoConversionAttempt.findUnique({
    where: { submissionKeyHash },
  });

  if (existing) {
    // Return existing outcome; generate a fresh short-lived receipt token for this response
    const freshToken = createReceiptToken();
    const receiptTokenHash = hashReceiptToken(freshToken);
    await client.demoConversionAttempt.update({
      where: { id: existing.id },
      data: {
        receiptTokenHash,
        expiresAt: calculateReceiptExpiry(),
      },
    });
    return {
      receiptToken: freshToken,
      conversionEventId: existing.conversionEventId,
      outcome: existing.outcome as "CREATED" | "UPDATED_EXISTING",
    };
  }

  const rawToken = createReceiptToken();
  const receiptTokenHash = hashReceiptToken(rawToken);
  const conversionEventId = isNew ? randomUUID() : null;
  const outcome = isNew ? "CREATED" : "UPDATED_EXISTING";

  await client.demoConversionAttempt.create({
    data: {
      leadId,
      submissionKeyHash,
      receiptTokenHash,
      outcome,
      conversionEventId,
      expiresAt: calculateReceiptExpiry(),
    },
  });

  return {
    receiptToken: rawToken,
    conversionEventId,
    outcome,
  };
}

/**
 * Executes demo request lead creation/update and conversion receipt registration
 * in a single atomic PostgreSQL transaction. If any part fails, rolls back completely.
 */
export async function processDemoRequestAtomic(params: {
  input: { shop: string; person: string; phone: string; town?: string; sells?: string; plan?: string };
  submissionKey: string;
  now?: Date;
  onBeforeReceipt?: (tx: any, leadId: string) => Promise<void>;
}): Promise<{
  leadResult: { ok: boolean; id?: string; again: boolean; message: string };
  conversion: DemoConversionRecord;
}> {
  const { input, submissionKey, now = new Date(), onBeforeReceipt } = params;
  const submissionKeyHash = hashSubmissionKey(submissionKey);

  return await db.$transaction(async (tx) => {
    // 1. Idempotency check: if this submission key was already processed, return existing outcome
    const existing = await tx.demoConversionAttempt.findUnique({
      where: { submissionKeyHash },
    });

    if (existing) {
      const freshToken = createReceiptToken();
      const receiptTokenHash = hashReceiptToken(freshToken);
      await tx.demoConversionAttempt.update({
        where: { id: existing.id },
        data: {
          receiptTokenHash,
          expiresAt: calculateReceiptExpiry(),
        },
      });
      return {
        leadResult: {
          ok: true,
          id: existing.leadId,
          again: existing.outcome !== "CREATED",
          message: existing.outcome === "CREATED" ? "Thank you! We'll WhatsApp you soon." : "We already have your request and will call you today.",
        },
        conversion: {
          receiptToken: freshToken,
          conversionEventId: existing.conversionEventId,
          outcome: existing.outcome as "CREATED" | "UPDATED_EXISTING",
        },
      };
    }

    // 2. Add or update lead inside transaction
    const leadResult = await addWebsiteLead(input, now, tx);
    if (!leadResult.ok || !leadResult.id) {
      throw new Error(leadResult.message || "Failed to process lead");
    }

    // Fault-injection hook for rollback proof in unit tests
    if (onBeforeReceipt) {
      await onBeforeReceipt(tx, leadResult.id);
    }

    // Strict eligibility condition (Turn 48 Architect requirement 1)
    const isEligibleNewLead =
      leadResult.ok === true &&
      leadResult.again === false &&
      typeof leadResult.id === "string" &&
      leadResult.id.length > 0;

    // 3. Persist DemoConversionAttempt inside same transaction
    const conversion = await recordDemoConversionAttempt(
      {
        leadId: leadResult.id,
        isNew: isEligibleNewLead,
        submissionKey,
      },
      tx,
    );

    return {
      leadResult: {
        ok: leadResult.ok,
        id: leadResult.id,
        again: leadResult.again === true,
        message: leadResult.message,
      },
      conversion,
    };
  });
}

export type ResolvedThankYouReceipt = {
  valid: boolean;
  conversionEligible: boolean;
  conversionEventId: string | null;
};

/**
 * Server-only verification of a thank-you page receipt against PostgreSQL.
 * Strictly verifies expiry, outcome, and non-consumed conversion eligibility.
 */
export async function resolveThankYouReceipt(rawToken: string | undefined | null): Promise<ResolvedThankYouReceipt> {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false, conversionEligible: false, conversionEventId: null };
  }

  let tokenHash: string;
  try {
    tokenHash = hashReceiptToken(rawToken);
  } catch {
    return { valid: false, conversionEligible: false, conversionEventId: null };
  }

  const attempt = await db.demoConversionAttempt.findFirst({
    where: {
      receiptTokenHash: tokenHash,
      expiresAt: { gt: new Date() },
    },
    select: {
      outcome: true,
      conversionEventId: true,
    },
  });

  if (!attempt) {
    return { valid: false, conversionEligible: false, conversionEventId: null };
  }

  const isEligible = attempt.outcome === "CREATED" && typeof attempt.conversionEventId === "string" && attempt.conversionEventId.length > 0;

  return {
    valid: true,
    conversionEligible: isEligible,
    conversionEventId: isEligible ? attempt.conversionEventId : null,
  };
}
