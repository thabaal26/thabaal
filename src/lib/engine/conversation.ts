import "server-only";
import { db } from "../db";

// Staff control over automatic replies for one customer's chat. Today's behaviour stays: after staff type in Chats,
// automatic replies keep quiet for the business's staffPauseMinutes (default 2 hours). On top of that, staff can
// pause them (for a while, or until resumed) and resume them, which also ends the quiet time after a typed reply.

/** Messages staff typed in Chats (or sent from an order). */
export const STAFF_LABELS = ["Typed reply", "Media reply"];
/** "Until someone resumes": a date far enough away. */
export const PAUSE_FOREVER = new Date("2999-01-01T00:00:00Z");

export type ChatAutomation = { paused: boolean; until: Date | null; by: string | null; reason: "paused" | "staff-typing" | null };

/** Are automatic replies off for this customer now, and why. */
export async function chatAutomation(customerId: string, now = new Date()): Promise<ChatAutomation> {
  // One query: the pause settings and staff's newest typed message (the quiet time below needs only the newest one).
  const c = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      client: { select: { staffPauseMinutes: true } },
      conversation: { select: { pausedUntil: true, pausedBy: true, resumedAt: true } },
      messages: { where: { templateName: { in: STAFF_LABELS } }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    },
  });
  const conv = c?.conversation;
  if (conv?.pausedUntil && conv.pausedUntil > now) return { paused: true, until: conv.pausedUntil.getTime() >= PAUSE_FOREVER.getTime() ? null : conv.pausedUntil, by: conv.pausedBy, reason: "paused" };
  const minutes = c?.client.staffPauseMinutes ?? 120;
  const windowStart = new Date(now.getTime() - minutes * 60_000);
  const since = conv?.resumedAt && conv.resumedAt > windowStart ? conv.resumedAt : windowStart;
  const newest = c?.messages[0];
  const typed = newest && newest.createdAt > since ? newest : null;
  return typed ? { paused: true, until: new Date(typed.createdAt.getTime() + minutes * 60_000), by: null, reason: "staff-typing" } : { paused: false, until: null, by: null, reason: null };
}

/** Pause automatic replies for this customer: for some minutes, or until resumed (null). */
export async function pauseChat(clientId: string, customerId: string, minutes: number | null, by: string, now = new Date()) {
  const pausedUntil = minutes == null ? PAUSE_FOREVER : new Date(now.getTime() + minutes * 60_000);
  await db.conversation.upsert({
    where: { customerId },
    create: { clientId, customerId, pausedUntil, pausedBy: by },
    update: { pausedUntil, pausedBy: by },
  });
  return pausedUntil;
}

/** Automatic replies on again now, also right after a staff reply. */
export async function resumeChat(clientId: string, customerId: string, now = new Date()) {
  await db.conversation.upsert({
    where: { customerId },
    create: { clientId, customerId, resumedAt: now },
    update: { pausedUntil: null, pausedBy: null, resumedAt: now },
  });
}
