import "server-only";
import type { WhatsAppNumber } from "@prisma/client";
import { db } from "./db";
import { memo } from "./request-memo";
import { waConfig } from "./whatsapp";

// Which WhatsApp number a client sends from, and the credentials for it.

/** A client's numbers, default first. */
export function clientNumbers(clientId: string) {
  return db.whatsAppNumber.findMany({ where: { clientId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
}

/**
 * Credentials for one number; its own token wins over the client's shared one. No number, or no token for it,
 * means not connected: never the deployment's own number, which belongs to another business.
 */
export function numberConfig(n: Pick<WhatsAppNumber, "token" | "phoneNumberId" | "businessAccountId"> | null | undefined, clientToken: string | null) {
  return waConfig(n ? { token: n.token ?? clientToken, phoneNumberId: n.phoneNumberId, businessAccountId: n.businessAccountId } : null);
}

/** The number to send from: the chosen one, else the client's default. Without one the config is not connected. */
export function senderFor(clientId: string, senderId?: string | null) {
  return memo(`sender:${clientId}:${senderId ?? ""}`, async () => {
    const [client, numbers] = await Promise.all([
      db.client.findUnique({ where: { id: clientId }, select: { waToken: true } }),
      clientNumbers(clientId),
    ]);
    const number = (senderId && numbers.find((n) => n.id === senderId)) || numbers[0] || null;
    return { number, cfg: numberConfig(number, client?.waToken ?? null) };
  });
}

/**
 * A number in the given WhatsApp Business Account (the default one when it's there), for
 * template work and test sends. No account means the client isn't connected yet.
 */
export async function senderForAccount(clientId: string, businessAccountId: string | null) {
  if (!businessAccountId) return { number: null, cfg: waConfig(null) };
  const [client, number] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { waToken: true } }),
    db.whatsAppNumber.findFirst({ where: { clientId, businessAccountId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  return { number, cfg: numberConfig(number, client?.waToken ?? null) };
}

/** Each WhatsApp Business Account a client has numbers in, with credentials for it. */
export async function clientAccounts(clientId: string) {
  const [client, numbers] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { waToken: true } }),
    clientNumbers(clientId),
  ]);
  const seen = new Map<string, { businessAccountId: string; labels: string[]; cfg: ReturnType<typeof waConfig> }>();
  for (const n of numbers) {
    const acc = seen.get(n.businessAccountId);
    if (acc) acc.labels.push(n.label);
    else seen.set(n.businessAccountId, { businessAccountId: n.businessAccountId, labels: [n.label], cfg: numberConfig(n, client?.waToken ?? null) });
  }
  return [...seen.values()];
}

/** How a number appears in lists: "Main · +91 98765 43210". */
/**
 * Prisma filter for templates this client can actually send: those in a WhatsApp Business Account one of
 * its numbers belongs to. Hides templates synced from other accounts, such as Meta's test account samples.
 */
export async function sendableTemplates(clientId: string) {
  const numbers = await db.whatsAppNumber.findMany({ where: { clientId }, select: { businessAccountId: true } });
  if (!numbers.length) return {};
  return { OR: [{ businessAccountId: null }, { businessAccountId: { in: [...new Set(numbers.map((n) => n.businessAccountId))] } }] };
}

export const numberLabel = (n: { label: string; displayPhone: string | null }) => (n.displayPhone ? `${n.label} · ${n.displayPhone}` : n.label);

export type QualityRating = "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | "NA";

export class SenderHealthError extends Error {
  constructor(message: string, public readonly qualityRating?: string | null, public readonly status?: string | null) {
    super(message);
    this.name = "SenderHealthError";
  }
}

/**
 * Asserts that a sender number is healthy enough for outbound dispatches.
 *
 * For MARKETING campaigns:
 * - Strictly requires GREEN rating.
 * - Blocks YELLOW (Medium Quality Warning), RED (Low Quality), FLAGGED, RESTRICTED, BANNED, DISABLED.
 * - Fails closed on UNKNOWN, NA, or missing credentials.
 *
 * For UTILITY / Transactional messages:
 * - Allowed even if RED/YELLOW, unless number is BANNED, DISABLED, or disconnected.
 */
export async function assertSenderHealthy(
  clientId: string,
  senderId?: string | null,
  category: string = "MARKETING"
) {
  const { number } = await senderFor(clientId, senderId);
  if (!number) return;

  const rawRating = number.qualityRating;
  const rating = (rawRating || "GREEN").toUpperCase();
  const isMarketing = category === "MARKETING";

  // Check linked WhatsApp connection status if present
  if (number.connectionId) {
    const conn = await db.whatsAppConnection.findUnique({
      where: { id: number.connectionId },
      select: { status: true },
    });
    const cStatus = conn?.status ? String(conn.status).toUpperCase() : null;
    if (cStatus && (cStatus === "DISCONNECTED" || cStatus === "NEEDS_REAUTH" || cStatus === "ERROR" || cStatus === "DRAFT")) {
      throw new SenderHealthError(
        `WhatsApp sender connection status is ${cStatus}. Reconnect in Settings first.`,
        rating,
        cStatus
      );
    }
  }

  if (!isMarketing) {
    // Utility / Transactional messages: only blocked if banned or disabled
    if (rating === "BANNED" || rating === "DISABLED") {
      throw new SenderHealthError(
        `Transactional dispatch blocked: Number status is ${rating}. The account is disabled by Meta.`,
        rating
      );
    }
    return;
  }

  // Marketing dispatch checks: strictly require GREEN rating and block low quality/restricted states
  if (rating === "RED") {
    throw new SenderHealthError(
      "Marketing dispatch blocked: Number quality is RED (Low Quality). Promotional sending is paused to protect your WhatsApp account from a permanent ban.",
      rating
    );
  }
  if (rating === "YELLOW") {
    throw new SenderHealthError(
      "Marketing dispatch blocked: Number quality is YELLOW (Medium Quality Warning). Bulk promotional sending is paused to prevent your number from downgrading to RED.",
      rating
    );
  }
  if (rating === "FLAGGED" || rating === "RESTRICTED" || rating === "BANNED" || rating === "DISABLED" || rating === "RATE_LIMITED") {
    throw new SenderHealthError(
      `Marketing dispatch blocked: Number status is ${rating}. WhatsApp has restricted promotional outbound messaging for this account.`,
      rating
    );
  }
  if (rating === "UNKNOWN" || rating === "NA") {
    throw new SenderHealthError(
      "Marketing dispatch blocked: Number health is UNKNOWN. Sync number status from Meta first.",
      rating
    );
  }
  if (rating && rating !== "GREEN") {
    throw new SenderHealthError(
      `Marketing dispatch blocked: Number quality must be GREEN (actual: ${rating}).`,
      rating
    );
  }
}

