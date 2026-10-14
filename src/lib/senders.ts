import "server-only";
import type { WhatsAppNumber } from "@prisma/client";
import { db } from "./db";
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
export async function senderFor(clientId: string, senderId?: string | null) {
  const [client, numbers] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { waToken: true } }),
    clientNumbers(clientId),
  ]);
  const number = (senderId && numbers.find((n) => n.id === senderId)) || numbers[0] || null;
  return { number, cfg: numberConfig(number, client?.waToken ?? null) };
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
