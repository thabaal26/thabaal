"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { pushToGoogleSheet } from "@/lib/google-sheets-live";
import { itemsText, itemsWithNames, money, orderRef, type OrderItem } from "@/lib/orders";
import { confirmPayment, sendPaymentRequestFor, updateOrderCard } from "@/lib/payments";
import { getSettings, wahaConfig } from "@/lib/provider";
import { replyWindowEnd } from "@/lib/replies";
import { headerImageFor } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { senderFor } from "@/lib/senders";
import { requireManager, requireOrderAccess } from "@/lib/session";
import { sendText } from "@/lib/waha";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { explainSendError, type SendResult } from "./send-helpers";
import { saveTemplate } from "./templates";

const STATUSES: OrderStatus[] = ["NEW", "CONFIRMED", "PAID", "DISPATCHED", "DELIVERED", "CANCELLED"];

/** Name of the utility template used to tell a customer about a cancellation after their 24-hour window. */
const CANCEL_TEMPLATE = "order_cancelled";

/**
 * Tells the customer their order was cancelled: on the WhatsApp order card when there is one, else a typed
 * message inside the 24-hour window, else the approved order_cancelled template. False if none could go out.
 */
async function tellCancelled(order: Parameters<typeof updateOrderCard>[0] & { customer: { name: string }; client: { name: string } }) {
  const first = order.customer.name.trim().split(/\s+/)[0] || "there";
  const ref = orderRef(order);
  const text = `Hello ${first}, your ${order.client.name} order ${ref} has been cancelled. If you have already paid, we will contact you about the refund. Reply to this message if you have any questions.`;
  if (await updateOrderCard(order, "canceled", text)) return true;
  const settings = await getSettings();
  if (settings.provider !== "META") return false;
  const last = await db.reply.findFirst({ where: { customerId: order.customer.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  const { number, cfg } = await senderFor(order.customer.clientId, last?.senderId);
  let res: { id: string; simulated: boolean };
  let templateName = "Typed reply";
  if (replyWindowEnd(last?.receivedAt)) {
    res = await sendTextMessage(cfg, order.customer.phone, text);
  } else {
    const options = await db.template.findMany({ where: { clientId: order.customer.clientId, name: { in: [CANCEL_TEMPLATE, `thenan_${CANCEL_TEMPLATE}`] }, status: "APPROVED" } });
    const t = options.find((x) => x.headerType === "IMAGE") ?? options.find((x) => x.headerType === "NONE") ?? null;
    if (!t) return false;
    res = await sendTemplateMessage(cfg, {
      to: order.customer.phone,
      templateName: t.name,
      language: t.language,
      headerType: t.headerType,
      headerMediaUrl: await headerImageFor(t),
      headerParams: [],
      bodyParams: [first, ref],
    });
    templateName = t.name;
  }
  await db.message.create({
    data: { customerId: order.customer.id, templateName, body: text, status: "SENT", waMessageId: res.id, simulated: res.simulated, provider: "META", sentAt: new Date(), senderId: number?.id ?? null },
  });
  return true;
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    include: { customer: true, client: { select: { name: true } } },
  });
  if (!order) return { ok: false, message: "Order not found." };
  // Paid outside WhatsApp (UPI to the shop, cash): record it and thank the customer like an online payment.
  if (status === "PAID" && !order.paidAt) {
    await confirmPayment(order.id);
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Marked paid and thanked the customer." };
  }
  await db.order.update({ where: { id: order.id }, data: { status } });
  let told = false;
  if (status === "CANCELLED" && !order.customer.optedOut) told = await tellCancelled(order).catch((e) => (console.error("Could not tell the customer about the cancellation", e), false));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Marked ${status.toLowerCase()}.${told ? " The customer was told on WhatsApp." : ""}` };
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

  const items = await itemsWithNames(order);
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const ref = orderRef(order);
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
    } else if (open && order.paymentRequestedAt && (await updateOrderCard(order, kind === "confirm" ? "processing" : kind === "dispatch" ? "shipped" : "completed", text).catch(() => false))) {
      // Sent on the order card from "Review and pay", which also moves its status; already logged.
      await db.order.update({ where: { id: order.id }, data: { status: nextStatus } });
      revalidatePath("/dashboard", "layout");
      return { ok: true, message: `Order updated on ${c.name}'s WhatsApp order card.` };
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
  const order = await db.order.findFirst({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, select: { id: true } });
  if (!order) return { ok: false, message: "Order not found." };
  const r = await sendPaymentRequestFor(order.id);
  revalidatePath("/dashboard/orders");
  return r;
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
/** While typing a phone in New order: is this an existing customer of the client, or a new one? */
export async function lookupOrderCustomer(rawPhone: string): Promise<{ valid: false } | { valid: true; existing: { id: string; name: string; optedOut: boolean } | null }> {
  const s = await requireOrderAccess();
  if ("denied" in s || !s.clientId) return { valid: false };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { valid: false };
  const existing = await db.customer.findUnique({ where: { clientId_phone: { clientId: s.clientId, phone } }, select: { id: true, name: true, optedOut: true } });
  return { valid: true, existing };
}

export async function createOrder(input: {
  phone: string;
  name: string;
  items: { id?: string; name: string; quantity: number; price: number }[];
  note?: string;
  catalogId?: string | null;
  requestPaymentNow?: boolean;
}): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!s.clientId) return { ok: false, message: "Pick a client in the sidebar first." };
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, message: "Enter a valid phone number." };
  const lines = input.items
    .map((i) => ({
      id: i.id?.trim() || undefined,
      name: i.name.trim(),
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      price: Math.max(0, Number(i.price) || 0),
    }))
    .filter((i) => i.name);
  if (!lines.length) return { ok: false, message: "Add at least one item." };

  const client = await db.client.findUnique({ where: { id: s.clientId }, select: { name: true, paymentConfig: true } });

  // A phone not in this client's customers becomes a new customer, so later orders, replies and
  // campaigns find them. They aren't marked as agreeing to marketing: an order isn't that consent.
  const name = input.name.trim();
  const existing = await db.customer.findUnique({ where: { clientId_phone: { clientId: s.clientId, phone } }, select: { id: true, name: true } });
  if (!existing && !name) return { ok: false, message: "This is a new customer: enter their name so they can be saved." };
  const customer = existing
    ? // Fill in a real name for a customer saved earlier with only their number.
      existing.name === `+${phone}` && name
      ? await db.customer.update({ where: { id: existing.id }, data: { name }, select: { id: true, name: true } })
      : existing
    : await db.customer.create({ data: { clientId: s.clientId, phone, name, tags: ["manual-order"] }, select: { id: true, name: true } });

  const allFromCatalog = Boolean(input.catalogId && lines.every((i) => Boolean(i.id)));
  const items: OrderItem[] = lines.map((i, k) => ({
    id: i.id || `manual-${k + 1}`,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    currency: "INR",
  }));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const order = await db.order.create({
    data: {
      clientId: s.clientId,
      customerId: customer.id,
      catalogId: allFromCatalog ? input.catalogId : null,
      items,
      total,
      note: input.note?.trim() || null,
      internalNote: "Entered by hand",
    },
  });

  pushToGoogleSheet("NEW_ORDER", {
    orderId: orderRef(order),
    phone,
    name: customer.name,
    items: itemsText(items),
    total: order.total,
    status: order.status,
    address: input.note?.trim() || "",
    client: client?.name || "Thabaal",
  });

  let paymentNote = "";
  if (input.requestPaymentNow && total > 0 && client?.paymentConfig) {
    const payRes = await sendPaymentRequestFor(order.id);
    paymentNote = payRes.ok ? " Sent WhatsApp payment request." : ` (${payRes.message})`;
  }

  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message:
      (existing
        ? `Order ${orderRef(order)} added for ${customer.name}.`
        : `Order ${orderRef(order)} added, and ${customer.name} was saved as a new customer.`) + paymentNote,
  };
}

/** Updates an existing order's items, quantities, prices, or customer note (common for every order). */
export async function updateOrderItems(
  id: string,
  input: {
    items: { id?: string; name: string; quantity: number; price: number }[];
    note?: string | null;
    catalogId?: string | null;
  },
): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    select: { id: true, number: true, catalogId: true },
  });
  if (!order) return { ok: false, message: "Order not found." };

  const lines = input.items
    .map((i) => ({
      id: i.id?.trim() || undefined,
      name: i.name.trim(),
      quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
      price: Math.max(0, Number(i.price) || 0),
    }))
    .filter((i) => i.name);
  if (!lines.length) return { ok: false, message: "An order must have at least one item." };

  const allFromCatalog = Boolean((input.catalogId ?? order.catalogId) && lines.every((i) => Boolean(i.id && !i.id.startsWith("manual-"))));
  const items: OrderItem[] = lines.map((i, k) => ({
    id: i.id || `manual-${k + 1}`,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    currency: "INR",
  }));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  await db.order.update({
    where: { id: order.id },
    data: {
      items,
      total,
      catalogId: allFromCatalog ? (input.catalogId ?? order.catalogId) : null,
      ...(input.note !== undefined && { note: input.note?.trim() || null }),
    },
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Updated ${orderRef(order)} items and total (${money(total, "INR")}).` };
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
  {
    name: "order_cancelled",
    body: "Hello {{1}}, your order {{2}} has been cancelled. If you have already paid, we will contact you about the refund. Reply to this message if you have any questions.",
    samples: ["Priya", "#RG-1001"],
  },
];

/**
 * Creates the four order update templates (confirmation, dispatched, delivered, cancelled)
 * and submits them to Meta. Skips any the client already has.
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
  if (!missing.length) return { ok: true, message: `All ${image ? "picture " : ""}order templates already exist.` };

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

/** Creates the `payment_request` utility template with an ORDER_DETAILS ("Review and pay") button and submits it to Meta. */
export async function createPaymentTemplate(): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const existing = await db.template.findFirst({ where: { clientId: s.clientId, name: "payment_request" }, select: { id: true, status: true } });
  if (existing) {
    return { ok: true, message: `Template "payment_request" already exists (${existing.status.toLowerCase()}).` };
  }
  const r = await saveTemplate(null, {
    name: "payment_request",
    language: "en",
    category: "UTILITY",
    headerType: "NONE",
    headerText: "",
    headerMediaUrl: "",
    body: "Hello {{1}}, thank you for your order with us. Tap Review and pay below to complete your payment by UPI.",
    footer: "",
    buttons: [{ type: "ORDER_DETAILS", text: "Review and pay" }],
    variables: { "1": { source: "first_name" } },
    codeExpiryMins: null,
    securityNote: false,
  });
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/templates");
  if (!r.ok) {
    return { ok: false, message: r.message ?? r.errors?.join(" · ") ?? "Could not create payment_request template." };
  }
  return { ok: true, message: 'Submitted "payment_request" (with Review and pay button) to Meta for approval.' };
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
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/orders");
  return { ok: true, message: templateId ? `Win-back on: customers with no order for ${n} days get one message (up to 200 a day).` : `Win-back off. Customers are still tagged "lapsed" after ${n} days.` };
}

