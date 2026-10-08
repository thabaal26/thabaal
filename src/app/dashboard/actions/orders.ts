"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { itemsText, money, type OrderItem } from "@/lib/orders";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { renderFor, type VarMap } from "@/lib/template";
import { getSettings, wahaConfig } from "@/lib/provider";
import { replyWindowEnd } from "@/lib/replies";
import { headerImageFor } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { senderFor } from "@/lib/senders";
import { requireManager, requireOrderAccess } from "@/lib/session";
import { sendText } from "@/lib/waha";
import { sendPaymentRequest, sendPaymentTemplate, sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { explainSendError, type SendResult } from "./send-helpers";
import { saveTemplate } from "./templates";

const STATUSES: OrderStatus[] = ["NEW", "CONFIRMED", "PAID", "DISPATCHED", "DELIVERED", "CANCELLED"];

export async function setOrderStatus(id: string, status: OrderStatus): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
  const r = await db.order.updateMany({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, data: { status } });
  if (!r.count) return { ok: false, message: "Order not found." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Marked ${status.toLowerCase()}.` };
}

export async function saveOrderNote(id: string, note: string): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.order.updateMany({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, data: { internalNote: note.trim().slice(0, 1000) || null } });
  if (!r.count) return { ok: false, message: "Order not found." };
  revalidatePath("/dashboard/orders");
  return { ok: true, message: "Note saved." };
}

const TEMPLATE_NAMES = {
  confirm: ["order_confirmation", "thenan_order_confirmation"],
  dispatch: ["order_dispatched", "thenan_order_dispatched"],
  deliver: ["order_delivered", "thenan_order_delivered"],
};

/** Who is bringing the order and how to follow it; all optional. */
export type DispatchDetails = { eta?: string; by?: string; phone?: string; link?: string };

/** One line for the template's {{3}}: Meta rejects line breaks inside template variables. */
function dispatchLine(d: DispatchDetails) {
  const parts = [d.eta?.trim() || "soon"];
  if (d.by?.trim()) parts.push(`with ${d.by.trim()}${d.phone?.trim() ? ` (${d.phone.trim()})` : ""}`);
  else if (d.phone?.trim()) parts.push(`(delivery contact ${d.phone.trim()})`);
  if (d.link?.trim()) parts.push(`- track: ${d.link.trim()}`);
  return parts.join(" ").replace(/\s{2,}/g, " ").slice(0, 300);
}

/**
 * Tells the customer their order is confirmed, dispatched or delivered, then moves the order on.
 * While their 24-hour window is open (an order always opens it) it sends a typed message; later it
 * needs the approved order_confirmation / order_dispatched / order_delivered utility template.
 */
export async function notifyOrder(id: string, kind: "confirm" | "dispatch" | "deliver", details: DispatchDetails = {}): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!order) return { ok: false, message: "Order not found." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };

  const items = order.items as OrderItem[];
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const ref = `#${order.id.slice(-5).toUpperCase()}`;
  const when = dispatchLine(details);
  const contact = [details.by?.trim() && `Delivery by: ${details.by.trim()}`, details.phone?.trim() && `Contact: ${details.phone.trim()}`, details.link?.trim() && `Track: ${details.link.trim()}`]
    .filter(Boolean)
    .join("\n");
  const text =
    kind === "confirm"
      ? `Hello ${first}, thank you for your order with ${order.client.name}.\n\nItems: ${itemsText(items)}\nTotal: ${money(order.total, order.currency)}\n\nWe will confirm your delivery slot shortly.`
      : kind === "dispatch"
        ? `Hello ${first}, your ${order.client.name} order ${ref} is on its way and will reach you by ${details.eta?.trim() || "soon"}.${contact ? `\n\n${contact}` : ""}\n\nFor any help, reply to this message.`
        : `Hello ${first}, your ${order.client.name} order ${ref} has been delivered. Thank you for shopping with us!\n\nIf anything is not right, reply to this message.`;
  const nextStatus = kind === "confirm" ? "CONFIRMED" : kind === "dispatch" ? "DISPATCHED" : "DELIVERED";

  const settings = await getSettings();
  const lastReply = await db.reply.findFirst({ where: { customerId: c.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const open = replyWindowEnd(lastReply?.receivedAt) !== null;
  const { number, cfg } = await senderFor(c.clientId, lastReply?.senderId);

  try {
    let waId: string;
    let simulated = false;
    let templateName = "Typed reply";
    let templateId: string | null = null;
    if (settings.provider === "LOCAL") {
      const w = wahaConfig(settings);
      if (w) waId = await sendText(w, c.phone, text);
      else {
        waId = `demo.${crypto.randomUUID()}`;
        simulated = true;
      }
    } else if (open) {
      ({ id: waId, simulated } = await sendTextMessage(cfg, c.phone, text));
    } else {
      // Prefer the version with a picture once Meta has approved it; the plain one stays as a fallback.
      const options = await db.template.findMany({ where: { clientId: c.clientId, name: { in: TEMPLATE_NAMES[kind] }, status: "APPROVED" } });
      const t = options.find((x) => x.headerType === "IMAGE") ?? options.find((x) => x.headerType === "NONE") ?? null;
      if (!t) {
        // A delivery thank-you is optional: still close the order when there's no way to message.
        if (kind === "deliver") {
          await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
          revalidatePath("/dashboard", "layout");
          return { ok: true, message: "Marked delivered. No message sent: the 24-hour window has closed and order_delivered isn't approved yet." };
        }
        return { ok: false, message: `The customer's 24-hour window has closed, so WhatsApp needs an approved ${TEMPLATE_NAMES[kind][0]} template. Use "Create order templates" at the top of Orders.` };
      }
      const bodyParams = kind === "confirm" ? [first, itemsText(items).slice(0, 300), String(Math.round(order.total))] : kind === "dispatch" ? [first, ref, when] : [first, ref];
      ({ id: waId, simulated } = await sendTemplateMessage(cfg, { to: c.phone, templateName: t.name, language: t.language, headerType: t.headerType, headerMediaUrl: await headerImageFor(t), headerParams: [], bodyParams }));
      templateName = t.name;
      templateId = t.id;
    }
    await db.message.create({
      data: {
        customerId: c.id, templateId, templateName, body: text, status: "SENT", waMessageId: waId, simulated,
        provider: settings.provider, sentAt: new Date(), senderId: settings.provider === "META" ? (number?.id ?? null) : null,
      },
    });
    // Keep the delivery details with the order for later questions.
    const record = kind === "dispatch" && contact ? `Dispatched ${new Date().toLocaleDateString("en-IN")}: ${when}` : null;
    await db.order.update({
      where: { id: order.id },
      data: { status: nextStatus, ...(record && { internalNote: [order.internalNote, record].filter(Boolean).join("\n").slice(0, 1000) }) },
    });
    revalidatePath("/dashboard", "layout");
    const label = kind === "confirm" ? "Confirmation" : kind === "dispatch" ? "Dispatch update" : "Delivery thank-you";
    return { ok: true, message: simulated ? "Simulated message logged (demo mode)." : `${label} sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/**
 * Sends the customer WhatsApp's "Review and pay" message for this order, paid by UPI through the
 * client's payment configuration. Meta's payment webhook marks the order paid.
 */
export async function requestPayment(id: string): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    include: { customer: true, client: { select: { name: true, paymentConfig: true } } },
  });
  if (!order) return { ok: false, message: "Order not found." };
  if (order.status === "PAID" || order.paidAt) return { ok: false, message: "This order is already paid." };
  if (!order.client.paymentConfig) return { ok: false, message: "Set your payment configuration name at the top of Orders first." };
  if (order.total <= 0) return { ok: false, message: "This order has no total. Add prices before asking for payment." };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };

  const settings = await getSettings();
  if (settings.provider !== "META") return { ok: false, message: "Payment requests need the WhatsApp Cloud API." };
  const items = order.items as OrderItem[];
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const ref = `#${order.id.slice(-5).toUpperCase()}`;
  const payment = {
    referenceId: order.id,
    configuration: order.client.paymentConfig,
    items: items.map((i) => ({ id: i.id, name: i.name ?? i.id, quantity: i.quantity, price: i.price })),
    total: order.total,
  };
  const text = `Hello ${first}, here is your ${order.client.name} order ${ref}.\n\nItems: ${itemsText(items)}\nTotal: ${money(order.total, order.currency)}\n\nTap "Review and pay" to pay by UPI.`;

  const lastReply = await db.reply.findFirst({ where: { customerId: c.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const open = replyWindowEnd(lastReply?.receivedAt) !== null;
  const { number, cfg } = await senderFor(c.clientId, lastReply?.senderId);

  try {
    let res: { id: string; simulated: boolean };
    let templateName = "Payment request";
    if (open) {
      res = await sendPaymentRequest(cfg, c.phone, text, payment);
    } else {
      const t = await paymentTemplateFor(c.clientId);
      if (!t)
        return { ok: false, message: `The customer's 24-hour window has closed, so WhatsApp needs an approved template with a "Review and pay" button. Add one from Meta's Template library (approved instantly) or wait for ${PAYMENT_TEMPLATE}, then sync templates.` };
      const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, c);
      res = await sendPaymentTemplate(
        cfg,
        c.phone,
        { name: t.name, language: t.language, bodyParams: r.bodyParams, headerParams: r.headerParams, headerImage: t.headerType === "IMAGE" ? await headerImageFor(t) : null },
        payment,
      );
      templateName = t.name;
    }
    await db.message.create({
      data: {
        customerId: c.id, templateName, body: text, status: "SENT", waMessageId: res.id, simulated: res.simulated,
        provider: "META", sentAt: new Date(), senderId: number?.id ?? null,
      },
    });
    await db.order.update({ where: { id: order.id }, data: { paymentRequestedAt: new Date() } });
    revalidatePath("/dashboard/orders");
    return { ok: true, message: res.simulated ? "Simulated payment request logged (demo mode)." : `Payment request sent to ${c.name}.` };
  } catch (e) {
    const err = explainSendError(e).error;
    return { ok: false, message: err };
  }
}

/** The payment configuration name from WhatsApp Manager → Payment configurations; empty turns payment requests off. */
export async function savePaymentConfig(name: string): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const value = name.trim();
  if (value && !/^[\w.-]{1,60}$/.test(value)) return { ok: false, message: "Use the configuration name exactly as WhatsApp Manager shows it." };
  await db.client.update({ where: { id: s.clientId }, data: { paymentConfig: value || null } });
  revalidatePath("/dashboard/orders");
  return { ok: true, message: value ? `Payment requests on, using "${value}".` : "Payment requests turned off." };
}

/** An order taken by phone, at the shop or on paper, so it can be confirmed and dispatched like a WhatsApp cart. */
export async function createOrder(input: { phone: string; name: string; items: { name: string; quantity: number; price: number }[]; note?: string }): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, message: "Enter a valid phone number." };
  const lines = input.items
    .map((i) => ({ name: i.name.trim(), quantity: Math.max(1, Math.round(Number(i.quantity) || 1)), price: Math.max(0, Number(i.price) || 0) }))
    .filter((i) => i.name);
  if (!lines.length) return { ok: false, message: "Add at least one item." };

  const customer =
    (await db.customer.findUnique({ where: { clientId_phone: { clientId: s.clientId, phone } }, select: { id: true } })) ??
    (await db.customer.create({ data: { clientId: s.clientId, phone, name: input.name.trim() || `+${phone}`, tags: ["manual-order"] }, select: { id: true } }));
  const items: OrderItem[] = lines.map((i, k) => ({ id: `manual-${k + 1}`, name: i.name, quantity: i.quantity, price: i.price, currency: "INR" }));
  const order = await db.order.create({
    data: {
      clientId: s.clientId,
      customerId: customer.id,
      items,
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      note: input.note?.trim() || null,
      internalNote: "Entered by hand",
    },
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Order #${order.id.slice(-5).toUpperCase()} added.` };
}

const ORDER_TEMPLATES: { name: string; body: string; samples: string[] }[] = [
  {
    name: "order_confirmation",
    body: "Hello {{1}}, thank you for your order. Items: {{2}}. Total: Rs {{3}}. We will confirm your delivery slot shortly.",
    samples: ["Priya", "2 x Groundnut oil 1 L", "560"],
  },
  {
    name: "order_dispatched",
    body: "Hello {{1}}, your order {{2}} has been dispatched and will reach you by {{3}}. Reply to this message for any help.",
    samples: ["Priya", "#A1B2C", "today evening with Ravi (98765 43210)"],
  },
  {
    name: "order_delivered",
    body: "Hello {{1}}, your order {{2}} has been delivered. Thank you for shopping with us! Reply to this message if anything is not right.",
    samples: ["Priya", "#A1B2C"],
  },
];

/**
 * Creates the three order update templates (utility, so they can be sent any time after an
 * order) and submits them to Meta. Skips any the client already has.
 */
export async function createOrderTemplates(imageUrl?: string): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  // The picture versions get their own names, so the plain ones keep working while Meta reviews them.
  const image = imageUrl?.trim();
  if (image && !/^https:\/\/\S+\.(jpe?g|png)(\?\S*)?$/i.test(image)) return { ok: false, message: "Use a public https link to a JPG or PNG image." };
  const named = ORDER_TEMPLATES.map((t) => ({ ...t, name: image ? `thenan_${t.name}` : t.name }));
  const existing = await db.template.findMany({ where: { clientId: s.clientId, name: { in: named.map((t) => t.name) } }, select: { name: true } });
  const missing = named.filter((t) => !existing.some((e) => e.name === t.name));
  if (!missing.length) return { ok: true, message: `All three ${image ? "picture " : ""}order templates already exist.` };

  const failed: string[] = [];
  for (const t of missing) {
    const variables = Object.fromEntries(t.samples.map((v, k) => [String(k + 1), { source: "static" as const, value: v }]));
    const r = await saveTemplate(null, {
      name: t.name, language: "en", category: "UTILITY", headerType: image ? "IMAGE" : "NONE", headerText: "", headerMediaUrl: image ?? "",
      body: t.body, footer: "", buttons: [], variables, codeExpiryMins: null, securityNote: false,
    });
    if (!r.ok) failed.push(`${t.name}: ${r.message ?? r.errors?.join(", ")}`);
  }
  revalidatePath("/dashboard", "layout");
  return failed.length
    ? { ok: false, message: `Some templates weren't created. ${failed.join(" · ")}` }
    : { ok: true, message: `Submitted ${missing.map((t) => t.name).join(", ")} to Meta. Approval usually takes minutes.` };
}

/** Refill reminders: send `templateId` this many days after each order; 0 days turns them off. */
export async function saveRefillRule(days: number, templateId: string): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const n = Math.round(Number(days) || 0);
  if (n < 0 || n > 365) return { ok: false, message: "Days must be between 1 and 365, or 0 to turn reminders off." };
  if (n > 0) {
    const t = await db.template.findFirst({ where: { id: templateId, clientId: s.clientId }, select: { id: true } });
    if (!t) return { ok: false, message: "Choose a template." };
  }
  await db.client.update({ where: { id: s.clientId }, data: { refillDays: n || null, refillTemplateId: n ? templateId : null } });
  revalidatePath("/dashboard/orders");
  return { ok: true, message: n ? `Refill reminders on: ${n} days after each order.` : "Refill reminders turned off." };
}

/** Win-back: customers tagged lapsed (no order for `days`) get `templateId` once; no template turns it off. */
export async function saveWinbackRule(days: number, templateId: string): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const n = Math.round(Number(days) || 0);
  if (n < 7 || n > 365) return { ok: false, message: "Lapsed after must be between 7 and 365 days." };
  if (templateId) {
    const t = await db.template.findFirst({ where: { id: templateId, clientId: s.clientId }, select: { id: true } });
    if (!t) return { ok: false, message: "Choose a template." };
  }
  await db.client.update({ where: { id: s.clientId }, data: { lapsedDays: n, winbackTemplateId: templateId || null } });
  revalidatePath("/dashboard/orders");
  return { ok: true, message: templateId ? `Win-back on: customers with no order for ${n} days get one message (up to 200 a day).` : `Win-back off. Customers are still tagged "lapsed" after ${n} days.` };
}
