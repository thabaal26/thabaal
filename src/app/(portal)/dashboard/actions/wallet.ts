"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireManager, requireUser } from "@/lib/session";
import { walletBalance } from "@/lib/wallet";
import { META_RATES, WALLET_CATEGORIES } from "@/lib/wallet-rates";
import type { ActionResult } from "./templates";

const MIN_RECHARGE = 100;
const MAX_RECHARGE = 500_000;
const UTR = /^[A-Za-z0-9]{6,22}$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

function refresh() {
  revalidatePath("/dashboard/wallet");
  revalidatePath("/dashboard", "layout");
}

/** Campaigns that stopped for want of money try again straight away. */
async function wakeWaitingRuns(clientId: string) {
  await db.campaignRun.updateMany({ where: { status: "WAITING_FUNDS", campaign: { clientId } }, data: { nextBatchAt: new Date() } });
}

/** A client says they paid by UPI: the recharge waits for Thabaal to check the money arrived. */
export async function requestRecharge(amount: number, utr: string, note: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const client = await db.client.findUnique({ where: { id: s.clientId }, select: { billingMode: true } });
  if (client?.billingMode !== "wallet") return { ok: false, message: "This account pays Meta directly, so it has no Thabaal wallet." };
  const value = round2(Number(amount));
  if (!(value >= MIN_RECHARGE) || value > MAX_RECHARGE) return { ok: false, message: `Enter an amount from ₹${MIN_RECHARGE} to ₹${MAX_RECHARGE.toLocaleString("en-IN")}.` };
  const ref = utr.trim().replace(/\s+/g, "");
  if (!UTR.test(ref)) return { ok: false, message: "Enter the UPI transaction ID (UTR / reference number) from your payment app." };
  const used = await db.walletEntry.findFirst({ where: { utr: { equals: ref, mode: "insensitive" }, status: { not: "REJECTED" } }, select: { id: true } });
  if (used) return { ok: false, message: "This transaction ID was already submitted." };
  const user = await requireUser();
  await db.walletEntry.create({
    data: { clientId: s.clientId, kind: "RECHARGE", amount: value, status: "PENDING", utr: ref, note: note.trim().slice(0, 200) || null, createdBy: user.name },
  });
  refresh();
  return { ok: true, message: `Recharge of ₹${value.toLocaleString("en-IN")} sent for confirmation. It's added once the payment is checked.` };
}

/** Thabaal confirms (or turns down) a recharge after checking its bank or UPI app. */
export async function decideRecharge(id: string, approve: boolean): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const user = await requireUser();
  const r = await db.walletEntry.updateMany({
    where: { id, kind: "RECHARGE", status: "PENDING" },
    data: { status: approve ? "DONE" : "REJECTED", decidedBy: user.name, decidedAt: new Date() },
  });
  if (!r.count) return { ok: false, message: "This recharge was already handled." };
  const entry = await db.walletEntry.findUnique({ where: { id }, select: { clientId: true, amount: true } });
  if (approve && entry) await wakeWaitingRuns(entry.clientId);
  refresh();
  return { ok: true, message: approve ? `₹${entry?.amount.toLocaleString("en-IN")} added to the wallet.` : "Recharge turned down." };
}

/** Thabaal adds money received another way, refunds, or corrects the balance. */
export async function adjustWallet(clientId: string, kind: "RECHARGE" | "ADJUSTMENT" | "REFUND", amount: number, note: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!["RECHARGE", "ADJUSTMENT", "REFUND"].includes(kind)) return { ok: false, message: "Pick what this is." };
  let value = round2(Number(amount));
  if (!Number.isFinite(value) || value === 0 || Math.abs(value) > MAX_RECHARGE) return { ok: false, message: "Enter the amount in rupees." };
  if (kind === "RECHARGE") value = Math.abs(value);
  if (kind === "REFUND") value = -Math.abs(value); // money paid back to the client leaves the wallet
  if (!note.trim()) return { ok: false, message: "Add a short note so the history explains it." };
  if (!(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return { ok: false, message: "Client not found." };
  const user = await requireUser();
  await db.walletEntry.create({ data: { clientId, kind, amount: value, status: "DONE", note: note.trim().slice(0, 200), createdBy: user.name, decidedBy: user.name, decidedAt: new Date() } });
  if (value > 0) await wakeWaitingRuns(clientId);
  refresh();
  return { ok: true, message: `Saved. Balance is now ₹${(await walletBalance(clientId)).toLocaleString("en-IN")}.` };
}

export type WalletSettingsInput = { billingMode: "direct" | "wallet"; rates: Record<string, string>; lowAlert: string };

/** How a client is billed, their rates and when to warn them. */
export async function saveWalletSettings(clientId: string, input: WalletSettingsInput): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!["direct", "wallet"].includes(input.billingMode)) return { ok: false, message: "Pick how this client is billed." };
  const rates: Record<string, number> = {};
  for (const c of WALLET_CATEGORIES) {
    const raw = (input.rates[c] ?? "").trim();
    if (!raw) continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, message: `Rate for ${c} must be a number of rupees.` };
    if (v !== META_RATES[c]) rates[c] = Math.round(v * 10_000) / 10_000;
  }
  const lowAlert = Number(input.lowAlert);
  if (!Number.isFinite(lowAlert) || lowAlert < 0 || lowAlert > 100_000) return { ok: false, message: "Low-balance warning must be an amount in rupees." };
  await db.client.update({
    where: { id: clientId },
    data: { billingMode: input.billingMode, walletRates: Object.keys(rates).length ? rates : Prisma.DbNull, walletLowAlert: lowAlert },
  });
  refresh();
  return { ok: true, message: input.billingMode === "wallet" ? "Wallet billing on for this client." : "This client pays Meta directly." };
}

export type WalletPaymentInput = { upiId: string; payee: string; gstEnabled: boolean; gstin: string };

/** Where clients pay recharges, and GST details for receipts. */
export async function saveWalletPayment(input: WalletPaymentInput): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const upiId = input.upiId.trim();
  if (upiId && !/^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$/.test(upiId)) return { ok: false, message: "UPI ID looks like name@bank." };
  const gstin = input.gstin.trim().toUpperCase();
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) return { ok: false, message: "GSTIN should be 15 characters, like 33ABCDE1234F1Z5." };
  if (input.gstEnabled && !gstin) return { ok: false, message: "Add the GSTIN before turning GST on." };
  await db.setting.upsert({
    where: { id: 1 },
    update: { walletUpiId: upiId || null, walletPayee: input.payee.trim().slice(0, 60) || null, gstEnabled: input.gstEnabled, gstin: gstin || null },
    create: { id: 1, walletUpiId: upiId || null, walletPayee: input.payee.trim().slice(0, 60) || null, gstEnabled: input.gstEnabled, gstin: gstin || null },
  });
  refresh();
  return { ok: true, message: "Payment details saved." };
}
