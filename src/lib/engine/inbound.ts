import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "../db";

// One claim per message Meta delivers. Meta retries a webhook it thinks failed "for up to 7 days", so the same
// message can arrive again; it is handled once. A claim that was never finished (the handler crashed) is taken over
// after STALE_MS, so a lost message still gets its reply on Meta's next try.
// Hardened with atomic CAS lease reservation and fence token verification (WEB-03).

export const STALE_MS = 3 * 60_000;
const KEEP_DAYS = 30;

/**
 * "new" = handle this message now; "duplicate" = it was handled already, or is being handled right now.
 * Implements atomic CAS lease reservation with fence token (WEB-03).
 */
export async function claimInbound(
  id: string,
  clientId: string | null = null,
  now = new Date(),
  kind: string | null = null,
  workerId?: string
): Promise<"new" | "duplicate"> {
  const leaseOwnerId = workerId || randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + STALE_MS);

  try {
    await db.inboundEvent.create({
      data: {
        id,
        clientId,
        kind,
        status: "PROCESSING",
        leaseOwnerId,
        leaseExpiresAt,
        leaseVersion: 1,
        attemptCount: 1,
        receivedAt: now,
      },
    });
    return "new";
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      console.error("Inbound claim failed due to database error:", e);
      // WEB-03: Under unexpected DB errors, do not bypass deduplication
      return "duplicate";
    }

    // Atomic CAS takeover: only if lease has expired or explicitly failed retryably, and was never completed
    const takeover = await db.inboundEvent.updateMany({
      where: {
        id,
        completedAt: null,
        processedAt: null,
        OR: [
          { status: "RETRYABLE_FAILURE" },
          { leaseExpiresAt: { lt: now } },
          { leaseExpiresAt: null },
        ],
      },
      data: {
        status: "PROCESSING",
        leaseOwnerId,
        leaseExpiresAt,
        leaseVersion: { increment: 1 },
        attemptCount: { increment: 1 },
        receivedAt: now,
      },
    });

    return takeover.count > 0 ? "new" : "duplicate";
  }
}

/** Handling failed: note why, and free the claim so Meta's next retry handles the message again at once (WEB-03). */
export async function releaseInbound(id: string, error?: unknown, workerId?: string) {
  const why = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : null;
  const sanitized = why ? why.replace(/\d{10,}/g, "#").slice(0, 500) : null;

  await db.inboundEvent
    .updateMany({
      where: {
        id,
        completedAt: null,
        processedAt: null,
        ...(workerId ? { leaseOwnerId: workerId } : {}),
      },
      data: {
        status: "RETRYABLE_FAILURE",
        leaseExpiresAt: new Date(0),
        lastError: sanitized,
      },
    })
    .catch(() => {});
}

/** The message was handled to the end: fence token ensures only active lease owner marks completed (WEB-03). */
export async function markProcessed(id: string, workerId?: string) {
  const now = new Date();
  await db.inboundEvent.updateMany({
    where: {
      id,
      completedAt: null,
      ...(workerId ? { leaseOwnerId: workerId } : {}),
    },
    data: {
      status: "COMPLETED",
      completedAt: now,
      processedAt: now,
      leaseExpiresAt: null,
    },
  });
}

/** Old claims are only needed while Meta might still retry: keep a month. Called by the scheduler. */
export async function pruneInbound(now = new Date()) {
  const r = await db.inboundEvent.deleteMany({
    where: { receivedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } },
  });
  return r.count;
}
