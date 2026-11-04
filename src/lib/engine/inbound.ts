import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";

// One claim per message Meta delivers. Meta retries a webhook it thinks failed "for up to 7 days", so the same
// message can arrive again; it is handled once. A claim that was never finished (the handler crashed) is taken over
// after STALE_MS, so a lost message still gets its reply on Meta's next try.

export const STALE_MS = 3 * 60_000;
const KEEP_DAYS = 30;

/**
 * "new" = handle this message now; "duplicate" = it was handled already, or is being handled right now. If the claim
 * itself can't be written, the message is handled anyway (as before claims existed): a reply is never lost to it.
 */
export async function claimInbound(id: string, clientId: string | null = null, now = new Date(), kind: string | null = null): Promise<"new" | "duplicate"> {
  try {
    await db.inboundEvent.create({ data: { id, clientId, kind, receivedAt: now } });
    return "new";
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      console.error("Inbound claim failed; handling the message anyway", e);
      return "new";
    }
    const takeover = await db.inboundEvent.updateMany({ where: { id, processedAt: null, receivedAt: { lt: new Date(now.getTime() - STALE_MS) } }, data: { receivedAt: now } });
    return takeover.count ? "new" : "duplicate";
  }
}

/** Handling failed: note why, and free the claim so Meta's next retry handles the message again at once. */
export async function releaseInbound(id: string, error?: unknown) {
  const why = error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : null;
  await db.inboundEvent
    .updateMany({ where: { id, processedAt: null }, data: { receivedAt: new Date(0), ...(why && { lastError: why.replace(/\d{10,}/g, "#").slice(0, 500) }) } })
    .catch(() => {});
}

/** The message was handled to the end. */
export async function markProcessed(id: string) {
  await db.inboundEvent.updateMany({ where: { id, processedAt: null }, data: { processedAt: new Date() } });
}

/** Old claims are only needed while Meta might still retry: keep a month. Called by the scheduler. */
export async function pruneInbound(now = new Date()) {
  const r = await db.inboundEvent.deleteMany({ where: { receivedAt: { lt: new Date(now.getTime() - KEEP_DAYS * 86_400_000) } } });
  return r.count;
}
