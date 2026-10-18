"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { APP_ORIGIN } from "@/lib/app-host";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { readPaySettings, SETTLEMENTS, UPI_ID_RE, upiLink, type PaySettings } from "@/lib/pay-settings";
import { textInWindow } from "@/lib/payments";
import { requireManager } from "@/lib/session";
import type { SendResult } from "./send-helpers";

// Payments › Payment settings: saving what customers can pay with, bank details (last 4 digits only) and the
// reminder rules. Managers only. Every switch saves straight away; the fields save with "Save settings".

async function current(clientId: string) {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { paySettings: true, paymentConfig: true } });
  return { settings: readPaySettings(c?.paySettings, c?.paymentConfig), paymentConfig: c?.paymentConfig ?? null };
}

async function store(clientId: string, next: PaySettings, extra: Prisma.ClientUpdateInput = {}) {
  await db.client.update({ where: { id: clientId }, data: { paySettings: next as unknown as Prisma.InputJsonValue, ...extra } });
  revalidatePath("/dashboard", "layout");
}

export type HowPayInput = {
  whatsappPay: boolean;
  paymentConfig: string;
  upiOn: boolean;
  upiId: string;
  upiName: string;
  codOn: boolean;
  codMax: string;
  codAreas: string;
};

/** "How customers pay": the three switches and their fields. */
export async function savePaySettings(input: HowPayInput, changed?: "whatsappPay" | "upiOn" | "codOn"): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const { settings } = await current(s.clientId);

  const config = input.paymentConfig.trim();
  if (config && !/^[\w.-]{1,60}$/.test(config)) return { ok: false, message: "Use the payment configuration name exactly as WhatsApp Manager shows it." };
  if (input.whatsappPay && !config) return { ok: false, message: "Pay inside WhatsApp needs the payment configuration name from WhatsApp Manager › Payment configurations." };

  const upiId = input.upiId.trim();
  const upiName = input.upiName.trim().slice(0, 60);
  if (upiId && !UPI_ID_RE.test(upiId)) return { ok: false, message: "That UPI ID doesn't look right. It is like shopname@okaxis." };
  if (input.upiOn && !upiId) return { ok: false, message: "Enter your UPI ID to turn on the UPI link." };
  if (input.upiOn && !upiName) return { ok: false, message: "Enter the name customers see when they pay." };

  const maxText = input.codMax.trim();
  const codMax = maxText ? Math.round(Number(maxText)) : null;
  if (maxText && (!Number.isFinite(codMax) || (codMax ?? 0) <= 0)) return { ok: false, message: "Highest COD order: enter an amount in rupees, or leave it empty for no limit." };

  await store(s.clientId, { ...settings, whatsappPay: input.whatsappPay, upiOn: input.upiOn, upiId, upiName, codOn: input.codOn, codMax, codAreas: input.codAreas.trim().slice(0, 300) }, { paymentConfig: config || null });
  const msg =
    changed === "whatsappPay"
      ? `Pay inside WhatsApp is ${input.whatsappPay ? "on" : "off"}.`
      : changed === "upiOn"
        ? `UPI link is ${input.upiOn ? "on" : "off"}.`
        : changed === "codOn"
          ? `Cash on delivery is ${input.codOn ? "on" : "off"}.`
          : "Payment settings saved.";
  return { ok: true, message: msg };
}

/** The QR picture sent with UPI links (an upload from /api/upload), or "" to remove it. */
export async function saveUpiQr(url: string): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const u = url.trim();
  if (u && !/^\/api\/upload\//.test(u) && !u.startsWith(`${APP_ORIGIN}/api/upload/`) && !/^https:\/\//.test(u)) return { ok: false, message: "That QR picture link isn't usable. Upload the picture again." };
  const { settings } = await current(s.clientId);
  await store(s.clientId, { ...settings, upiQrUrl: u.slice(0, 500) });
  return { ok: true, message: u ? "QR picture saved. It goes with every UPI link." : "QR picture removed." };
}

/** Bank account shown to managers: bank name, the account's last 4 digits (nothing more is kept) and settlement. */
export async function saveBankDetails(input: { bankName: string; last4: string; settlement: string }): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const bankName = input.bankName.trim().slice(0, 80);
  const last4 = input.last4.replace(/\D/g, "");
  if (!bankName) return { ok: false, message: "Enter the bank name and branch." };
  if (!/^\d{4}$/.test(last4)) return { ok: false, message: "Enter only the last 4 digits of the account number." };
  const settlement = SETTLEMENTS.some((x) => x.id === input.settlement) ? input.settlement : SETTLEMENTS[0].id;
  const { settings } = await current(s.clientId);
  await store(s.clientId, { ...settings, bankName, bankLast4: last4, settlement });
  return { ok: true, message: "Bank details saved." };
}

/** Reminder rules: the 1-day reminder, the last 3-day reminder (then expired) and the receipt when paid. */
export async function saveReminderRule(key: "remind1" | "remind3" | "receipt", on: boolean): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!["remind1", "remind3", "receipt"].includes(key)) return { ok: false, message: "Unknown setting." };
  const { settings } = await current(s.clientId);
  await store(s.clientId, { ...settings, [key]: Boolean(on) });
  const label = key === "remind1" ? "Reminder after 1 day" : key === "remind3" ? "Last reminder after 3 days" : "Receipt when paid";
  return { ok: true, message: `${label} is ${on ? "on" : "off"}.` };
}

/**
 * "Send a test link": a ₹1 UPI link (and QR) to the business's own WhatsApp number from Settings › Business details,
 * so the owner can check it opens their UPI app. WhatsApp only allows it after that number messaged the shop today.
 */
export async function sendUpiTestLink(input: { upiId: string; upiName: string }): Promise<SendResult & { link?: string }> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const upiId = input.upiId.trim();
  if (!UPI_ID_RE.test(upiId)) return { ok: false, message: "Enter a valid UPI ID first (like shopname@okaxis)." };
  const { settings } = await current(s.clientId);
  const link = upiLink({ upiId, upiName: input.upiName.trim() }, 1, "Test payment");
  const client = await db.client.findUnique({ where: { id: s.clientId }, select: { supportPhone: true, name: true } });
  const phone = normalizePhone(client?.supportPhone ?? "");
  if (!phone) return { ok: false, message: "Add your business WhatsApp number in Settings › Business details to receive the test link.", link };
  const me = await db.customer.findUnique({ where: { clientId_phone: { clientId: s.clientId, phone } }, select: { id: true, clientId: true, phone: true, optedOut: true } });
  const text = `Test UPI link from ${client?.name ?? "your shop"}: tap to pay ₹1 to ${upiId}${input.upiName.trim() ? ` (${input.upiName.trim()})` : ""}.\n${link}${settings.upiQrUrl ? "\n\nYour QR picture is not attached to this test." : ""}`;
  const sent = me ? await textInWindow(me, text, "UPI test link").catch(() => false) : false;
  if (!sent) return { ok: false, message: `Send any WhatsApp message to your shop from +${phone} first (WhatsApp allows replies for 24 hours), then tap "Send a test link" again.`, link };
  return { ok: true, message: `Test link sent to +${phone}.`, link };
}

/** Campaigns › Automations: the "Pay inside WhatsApp" switch alone (needs the payment configuration name). */
export async function setWhatsappPay(on: boolean): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const { settings, paymentConfig } = await current(s.clientId);
  if (on && !paymentConfig) return { ok: false, message: "Add the payment configuration name in Payments › Payment settings first." };
  await store(s.clientId, { ...settings, whatsappPay: Boolean(on) });
  return { ok: true, message: `Pay inside WhatsApp is ${on ? "on" : "off"}.` };
}
