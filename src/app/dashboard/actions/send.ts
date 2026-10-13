"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pushToGoogleSheet } from "@/lib/google-sheets-live";
import { fmtDate } from "@/lib/format";
import { allowance } from "@/lib/limits";
import { deliver, getSettings, readiness, templateSendable, wahaConfig } from "@/lib/provider";
import { applyFailure, quietUntil, recentlyMarketed } from "@/lib/rules";
import { senderFor } from "@/lib/senders";
import { getScope, owned, requireManager } from "@/lib/session";
import { sendImage, sendText, WahaError } from "@/lib/waha";
import { sendMediaMessage, sendTextMessage } from "@/lib/whatsapp";
import { normalizePhone } from "@/lib/phone";
import { explainSendError, type SendResult } from "./send-helpers";

const WINDOW_MS = 24 * 3_600_000;

/**
 * Sends one approved template to one customer now. Opt-outs and numbers that can't
 * receive WhatsApp are never overridden; quiet hours and the gap between marketing
 * messages ask for confirmation (`force`) instead.
 */
export async function sendToCustomer(
  customerId: string,
  templateId: string,
  senderId: string | null,
  force = false,
  otpCode?: string,
): Promise<SendResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const customer = await db.customer.findFirst({ where: { id: customerId, ...owned(s) }, include: { client: true } });
  if (!customer) return { ok: false, message: "Customer not found." };
  if (customer.optedOut) return { ok: false, message: "This customer opted out of messages. Opt them back in first." };
  if (customer.unreachable) return { ok: false, message: "WhatsApp says this number can't receive messages." };

  const t = await db.template.findFirst({ where: { id: templateId, clientId: customer.clientId } });
  if (!t) return { ok: false, message: "Template not found." };
  const settings = await getSettings();
  if (!templateSendable(settings, t)) return { ok: false, message: "Only templates approved by Meta can be sent." };

  const { number, cfg } = await senderFor(customer.clientId, senderId);
  // Meta only sends a template from numbers in the account that approved it.
  if (settings.provider === "META" && t.businessAccountId && number && t.businessAccountId !== number.businessAccountId)
    return { ok: false, message: "That template belongs to a different WhatsApp account. Pick a number from the same account." };
  const ready = await readiness(settings, cfg);
  if (!ready.ok) return { ok: false, message: ready.reason ?? "The WhatsApp connection is not ready." };

  if (number?.displayPhone && normalizePhone(number.displayPhone) === customer.phone) {
    return { ok: false, message: `Meta doesn't allow sending a message to the sending number itself (${number.displayPhone}). Please choose another recipient.` };
  }

  if (settings.provider === "META" && number && cfg.live) {
    if (number.qualityRating === "RED") return { ok: false, message: "This number's quality rating is red, so sending is paused to protect it." };
    const a = await allowance(number);
    if (!a.unlimited && a.left <= 0) return { ok: false, message: "This number reached its 24-hour messaging limit. Try again later or use another number." };
  }

  if (t.category === "MARKETING" && !force) {
    const resume = quietUntil(customer.client);
    if (resume) return { ok: false, soft: true, message: `It's quiet hours (marketing is held until ${fmtDate(resume, "h:mm a")}). Send anyway?` };
    const last = (await recentlyMarketed([customer.id], customer.client.marketingGapHours)).get(customer.id);
    if (last) return { ok: false, soft: true, message: `${customer.name} already got an offer on ${fmtDate(last, "d MMM, h:mm a")}. Send another anyway?` };
  }

  try {
    const res = await deliver(settings, t, customer, cfg, otpCode);
    await db.message.create({
      data: {
        customerId: customer.id, templateId: t.id, templateName: t.name, body: res.text, status: "SENT",
        waMessageId: res.id, simulated: res.simulated, provider: res.provider, sentAt: new Date(),
        senderId: res.provider === "META" ? (number?.id ?? null) : null,
        pricingCategory: t.category.toLowerCase(),
        billable: true,
      },
    });
    pushToGoogleSheet("CAMPAIGN_STATUS", {
      campaign: t.name,
      phone: customer.phone,
      status: "SENT",
      waMessageId: res.id,
      client: customer.client.name || "Thabaal",
    });
    revalidatePath(`/dashboard/customers/${customer.id}`);
    revalidatePath("/dashboard/messages");
    return { ok: true, message: res.simulated ? "Simulated send logged (demo mode)." : `Sent to ${customer.name}${number?.displayPhone ? ` from ${number.displayPhone}` : ""}.` };
  } catch (e) {
    const { code, error } = explainSendError(e);
    await db.message.create({
      data: { customerId: customer.id, templateId: t.id, templateName: t.name, status: "FAILED", provider: settings.provider, errorCode: code, error, failedAt: new Date(), pricingCategory: t.category.toLowerCase(), billable: false },
    });
    await applyFailure(customer.id, code);
    pushToGoogleSheet("CAMPAIGN_STATUS", {
      campaign: t.name,
      phone: customer.phone,
      status: "FAILED",
      waMessageId: "",
      client: customer.client.name || "Thabaal",
    });
    revalidatePath(`/dashboard/customers/${customer.id}`);
    return { ok: false, message: error };
  }
}

/**
 * A typed reply (or image/document attachment) to a customer who wrote to us in the last 24 hours
 * (the only time WhatsApp allows free text/media). Client logins may do this for their own customers.
 */
export async function replyToCustomer(
  customerId: string,
  text: string,
  mediaUrl?: string | null,
): Promise<SendResult> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login can view but not change anything." };
  const body = text.trim();
  const cleanMedia = mediaUrl?.trim() || null;
  if (!body && !cleanMedia) return { ok: false, message: "Type a message or attach an image first." };
  if (body.length > 4000) return { ok: false, message: "Keep the message under 4000 characters." };
  if (cleanMedia && !/^https:\/\/\S+$/i.test(cleanMedia)) {
    return { ok: false, message: "Media attachment must be a public https:// link." };
  }
  const customer = await db.customer.findFirst({ where: { id: customerId, ...owned(scope) } });
  if (!customer) return { ok: false, message: "Customer not found." };
  if (customer.optedOut) return { ok: false, message: "This customer opted out of messages." };

  const settings = await getSettings();
  const last = await db.reply.findFirst({ where: { customerId: customer.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const local = settings.provider === "LOCAL";
  if (!local && (!last || Date.now() - last.receivedAt.getTime() > WINDOW_MS))
    return { ok: false, message: "WhatsApp only allows typed messages within 24 hours of the customer's last message. Send a template instead." };

  // Answer from the number they wrote to, so the chat stays in one thread for them.
  const { number, cfg } = await senderFor(customer.clientId, last?.senderId);
  const loggedBody = cleanMedia ? (body ? `${body}\n[Media: ${cleanMedia}]` : `[Media: ${cleanMedia}]`) : body;
  try {
    let id: string;
    let simulated = false;
    if (local) {
      const w = wahaConfig(settings);
      if (w) {
        id = cleanMedia ? await sendImage(w, customer.phone, cleanMedia, body) : await sendText(w, customer.phone, body);
      } else {
        id = `demo.${crypto.randomUUID()}`;
        simulated = true;
      }
    } else if (cleanMedia) {
      ({ id, simulated } = await sendMediaMessage(cfg, customer.phone, cleanMedia, body || undefined));
    } else {
      ({ id, simulated } = await sendTextMessage(cfg, customer.phone, body));
    }
    await db.message.create({
      data: {
        customerId: customer.id,
        templateName: cleanMedia ? "Media reply" : "Typed reply",
        body: loggedBody,
        status: "SENT",
        waMessageId: id,
        simulated,
        provider: settings.provider,
        sentAt: new Date(),
        senderId: !local ? (number?.id ?? null) : null,
        pricingCategory: "service",
        billable: false,
      },
    });
    revalidatePath(`/dashboard/customers/${customer.id}`);
    revalidatePath("/dashboard/messages");
    revalidatePath("/dashboard/replies");
    return { ok: true, message: simulated ? "Simulated reply logged (demo mode)." : "Reply sent." };
  } catch (e) {
    const { code, error } = explainSendError(e);
    await db.message.create({
      data: {
        customerId: customer.id,
        templateName: cleanMedia ? "Media reply" : "Typed reply",
        body: loggedBody,
        status: "FAILED",
        provider: settings.provider,
        errorCode: code,
        error,
        failedAt: new Date(),
      },
    });
    return { ok: false, message: e instanceof WahaError ? e.message : error };
  }
}
