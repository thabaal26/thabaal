import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { categoryOfTemplate, chargeFor, ratesFor, WALLET_CATEGORIES, type WalletCategory } from "./wallet-rates";

/*
 * The Thabaal wallet. Clients on billingMode "wallet" pay Thabaal in advance and Thabaal pays Meta
 * from one account. Every message Meta marks as billable takes its charge from the client's balance,
 * so the wallet follows Meta's own bill. Clients on "direct" billing (the default) are never touched.
 *
 * Campaigns stop when the balance can't cover the next message; order, payment and reply messages are
 * never blocked (a customer's order must not stall), so the balance can dip below zero until the next
 * recharge.
 */

export const isWalletClient = (c: { billingMode?: string | null } | null | undefined) => c?.billingMode === "wallet";

/** Current balance in rupees (approved entries only). */
export async function walletBalance(clientId: string): Promise<number> {
  const r = await db.walletEntry.aggregate({ where: { clientId, status: "DONE" }, _sum: { amount: true } });
  return Math.round((r._sum.amount ?? 0) * 100) / 100;
}

/** Balances for many clients at once. */
export async function walletBalances(clientIds: string[]): Promise<Map<string, number>> {
  if (!clientIds.length) return new Map();
  const rows = await db.walletEntry.groupBy({ by: ["clientId"], where: { clientId: { in: clientIds }, status: "DONE" }, _sum: { amount: true } });
  return new Map(rows.map((r) => [r.clientId, Math.round((r._sum.amount ?? 0) * 100) / 100]));
}

/**
 * Charges one delivered message to its client's wallet, once. Called from the status webhook when
 * Meta reports the message as billable. Does nothing for direct-billing clients.
 */
export async function chargeMessage(messageId: string, category: string | null | undefined) {
  const cat = (WALLET_CATEGORIES as readonly string[]).includes(category ?? "") ? (category as WalletCategory) : null;
  if (!cat) return;
  const msg = await db.message.findUnique({
    where: { id: messageId },
    select: { simulated: true, customer: { select: { clientId: true, client: { select: { billingMode: true, walletRates: true } } } } },
  });
  if (!msg || msg.simulated || !isWalletClient(msg.customer.client)) return;
  const amount = -chargeFor(ratesFor(msg.customer.client.walletRates)[cat]);
  if (!amount) return;
  try {
    await db.walletEntry.create({ data: { clientId: msg.customer.clientId, kind: "MESSAGE", amount, messageId, category: cat } });
  } catch (e) {
    // Meta sends delivered and read for the same message: the second charge is refused by the unique id.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
}

/**
 * For a campaign batch: how many messages of this template the wallet can pay for.
 * Infinity for direct-billing clients.
 */
export async function affordableMessages(clientId: string, templateCategory: string | null | undefined): Promise<number> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { billingMode: true, walletRates: true } });
  if (!isWalletClient(c)) return Infinity;
  const each = chargeFor(ratesFor(c!.walletRates)[categoryOfTemplate(templateCategory)]);
  if (each <= 0) return Infinity;
  return Math.max(0, Math.floor((await walletBalance(clientId)) / each));
}

/** Wallet clients only: true when the balance can pay for one more marketing message. */
export async function canSendMarketing(clientId: string) {
  return (await affordableMessages(clientId, "MARKETING")) > 0;
}

/** Rough cost of sending a template to this many customers, GST included. */
export function estimateCost(walletRates: unknown, templateCategory: string | null | undefined, recipients: number) {
  return Math.round(chargeFor(ratesFor(walletRates)[categoryOfTemplate(templateCategory)]) * recipients * 100) / 100;
}
