"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { findAddressesInReplies, parseAddressText } from "@/lib/address";
import { db } from "@/lib/db";
import { pushOrderToSheet } from "@/lib/google-sheets-live";
import { DEFAULT_SHIPPING_FEE, getOrderPricing, itemsText, itemsWithNames, money, nextOrderRef, orderRef, syncCustomerOrderedProducts, type OrderItem } from "@/lib/orders";
import { confirmPayment, sendPaymentRequestFor, updateOrderCard } from "@/lib/payments";
import { codBlocked } from "@/lib/pay-settings";
import { paySettingsFor } from "@/lib/pay-settings-server";
import { utrOf } from "@/lib/payment-events";
import { dueOf, methodOf, receivedOf } from "@/lib/payment-state";
import { autoRedeemPoints, keptPointsDiscount, setOrderPoints } from "@/lib/loyalty-redeem";
import { pointsDiscount } from "@/lib/order-pricing";
import { getSettings, wahaConfig } from "@/lib/provider";
import { replyWindowEnd } from "@/lib/replies";
import { headerImageFor } from "@/lib/media";
import { normalizePhone } from "@/lib/phone";
import { isTemplatePicture, orderTemplateNames, picturePrefixFor } from "@/lib/order-templates";
import { cleanValues, readFields, readValues } from "@/lib/custom-fields";
import { senderFor } from "@/lib/senders";
import { requireManager, requireOrderAccess } from "@/lib/session";
import { FLOW_KEYS, ORDER_FLOWS, stepBlocked, type OrderFlowKey } from "@/lib/order-flow";
import { sendText } from "@/lib/waha";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { explainSendError, type SendResult } from "./send-helpers";
import { saveTemplate } from "./templates";

/** The client's home city as set (null = Madurai), for reading regions out of addresses. */
async function homeCityFor(clientId: string | null | undefined) {
  if (!clientId) return null;
  return (await db.client.findUnique({ where: { id: clientId }, select: { homeCity: true } }))?.homeCity ?? null;
}

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
    const options = await db.template.findMany({ where: { clientId: order.customer.clientId, name: { in: orderTemplateNames(CANCEL_TEMPLATE) }, status: "APPROVED" } });
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
    await confirmPayment(order.id, null, { source: "staff", method: methodOf(order) ?? "upi" });
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Marked paid and thanked the customer." };
  }
  // Order steps: confirmed only once payment is verified (or COD confirmed); dispatch and finish only after that.
  if (status === "CONFIRMED" || status === "DISPATCHED" || status === "DELIVERED") {
    const blocked = stepBlocked(order, status);
    if (blocked) return { ok: false, message: blocked };
  }
  // Reopening starts the order over, so it isn't still shown as packed.
  await db.order.update({ where: { id: order.id }, data: { status, ...(status === "NEW" ? { packedAt: null } : {}) } });
  pushOrderToSheet(order.id, "ORDER_UPDATE");
  let told = false;
  if (status === "CANCELLED" && !order.customer.optedOut) told = await tellCancelled(order).catch((e) => (console.error("Could not tell the customer about the cancellation", e), false));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Marked ${status.toLowerCase()}.${told ? " The customer was told on WhatsApp." : ""}` };
}

/** The "Packed" step: marks the order packed (or takes it back). The status stays as it is until dispatch. */
export async function setOrderPacked(id: string, packed: boolean): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (packed) {
    const o = await db.order.findFirst({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) } });
    if (!o) return { ok: false, message: "Order not found." };
    const blocked = stepBlocked(o, "PACKED");
    if (blocked) return { ok: false, message: blocked };
  }
  const r = await db.order.updateMany({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}), status: { in: ["NEW", "CONFIRMED", "PAID"] } },
    data: { packedAt: packed ? new Date() : null },
  });
  if (!r.count) return { ok: false, message: "This order can't be marked packed now." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: packed ? "Marked packed." : "No longer marked packed." };
}

/** Settings → Order steps: the stages this client's orders go through. */
export async function saveOrderFlow(flow: string): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!FLOW_KEYS.includes(flow as OrderFlowKey)) return { ok: false, message: "Pick one of the order steps." };
  await db.client.update({ where: { id: s.clientId }, data: { orderFlow: flow } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Order steps saved: ${ORDER_FLOWS[flow as OrderFlowKey].label}.` };
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
  confirm: orderTemplateNames("order_confirmation"),
  dispatch: orderTemplateNames("order_dispatched"),
  deliver: orderTemplateNames("order_delivered"),
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
  // Order steps: no confirmation before the payment is verified (cash on delivery excepted), and no dispatch or
  // delivery before the order is confirmed.
  const blocked = stepBlocked(order, kind === "confirm" ? "CONFIRMED" : kind === "dispatch" ? "DISPATCHED" : "DELIVERED");
  if (blocked) return { ok: false, message: blocked };
  const c = order.customer;
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };

  const items = await itemsWithNames(order);
  const pricing = getOrderPricing(items, order.total, { applyDefaultWhenEqual: true, discount: pointsDiscount(order) });
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const ref = orderRef(order);
  const when = dispatchLine(details);
  const pointsLine = pricing.discount > 0 ? `\nLoyalty points (${order.pointsRedeemed}): -${money(pricing.discount, order.currency)}` : "";
  const contact = [details.by?.trim() && `Delivery by: ${details.by.trim()}`, details.phone?.trim() && `Contact: ${details.phone.trim()}`, details.link?.trim() && `Track: ${details.link.trim()}`]
    .filter(Boolean)
    .join("\n");
  const confirmPricingText =
    pricing.shipping > 0 || pricing.discount > 0
      ? `Items: ${itemsText(items)} (${money(pricing.subtotal, order.currency)})${pricing.shipping > 0 ? `\nShipping: ${money(pricing.shipping, order.currency)}` : ""}${pointsLine}\nTotal: ${money(pricing.total, order.currency)}`
      : `Items: ${itemsText(items)}\nTotal: ${money(pricing.total, order.currency)}`;
  // Where the money stands, so the customer knows whether to pay, keep cash ready, or nothing at all.
  const due = dueOf(order);
  const cod = methodOf(order) === "cod" && due > 0;
  const payLine =
    kind === "confirm"
      ? order.paidAt
        ? `Payment received: ${money(receivedOf(order), order.currency)}. Thank you!`
        : cod
          ? `Payment: cash on delivery. Please keep ${money(due, order.currency)} ready when it arrives.`
          : receivedOf(order) > 0
            ? `Received ${money(receivedOf(order), order.currency)}; ${money(due, order.currency)} still to pay.`
            : ""
      : kind === "dispatch"
        ? cod
          ? `Cash on delivery: please keep ${money(due, order.currency)} ready.`
          : !order.paidAt && due > 0 && order.paymentMethod !== "cod"
            ? `Amount to pay: ${money(due, order.currency)}.`
            : ""
        : order.paidAt && (order.paymentMethod === "cod" || order.paymentMethod === "cash")
          ? `We received ${money(receivedOf(order), order.currency)} in cash. Thank you!`
          : "";
  const text =
    kind === "confirm"
      ? `Hello ${first}, your ${order.client.name} order ${ref} is confirmed.\n\n${confirmPricingText}${payLine ? `\n${payLine}` : ""}\n\nWe will message you with the next update.`
      : kind === "dispatch"
        ? `Hello ${first}, your ${order.client.name} order ${ref} is on its way and will reach you by ${details.eta?.trim() || "soon"}.${contact ? `\n\n${contact}` : ""}${payLine ? `\n\n${payLine}` : ""}\n\nFor any help, reply to this message.`
        : `Hello ${first}, your ${order.client.name} order ${ref} has been delivered.${payLine ? ` ${payLine}` : ""} Thank you for shopping with us!\n\nIf anything is not right, reply to this message.`;
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
      pushOrderToSheet(order.id, "ORDER_UPDATE");
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
          pushOrderToSheet(order.id, "ORDER_UPDATE");
          revalidatePath("/dashboard", "layout");
          return { ok: true, message: "Marked delivered. No message sent: the 24-hour window has closed and order_delivered isn't approved yet." };
        }
        return { ok: false, message: `The customer's 24-hour window has closed, so WhatsApp needs an approved ${TEMPLATE_NAMES[kind][0]} template. Use "Create order templates" at the top of Orders.` };
      }
      const codNote = cod ? ` - cash on delivery, please keep Rs ${Math.round(due)} ready` : "";
      const bodyParams =
        kind === "confirm"
          ? [first, `${itemsText(items).slice(0, 240)}${pricing.shipping > 0 ? ` (+ Rs ${pricing.shipping} shipping)` : ""}${cod ? " - cash on delivery" : ""}`, String(Math.round(pricing.total))]
          : kind === "dispatch"
            ? [first, ref, `${when}${codNote}`.slice(0, 300)]
            : [first, ref];
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
    pushOrderToSheet(order.id, "ORDER_UPDATE");
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

/** Uses the customer's loyalty points on this unpaid order: `rupees` off (₹25 steps), "max", or 0 to remove them. */
export async function setOrderPointsAction(id: string, rupees: number | "max"): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, select: { id: true } });
  if (!order) return { ok: false, message: "Order not found." };
  if (rupees !== "max" && (!Number.isFinite(rupees) || rupees < 0)) return { ok: false, message: "Pick an amount." };
  const r = await setOrderPoints(order.id, rupees);
  if (r.ok) {
    pushOrderToSheet(order.id, "ORDER_UPDATE", rupees === 0 ? "Loyalty points removed" : "Loyalty points used");
    revalidatePath("/dashboard", "layout");
  }
  return { ok: r.ok, message: r.message };
}

/** Order & Payment Settings: use customers' loyalty points automatically on new orders, or only by hand. */
export async function saveLoyaltyAutoRedeem(on: boolean): Promise<SendResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  await db.client.update({ where: { id: s.clientId }, data: { loyaltyAutoRedeem: Boolean(on) } });
  revalidatePath("/dashboard/orders");
  return {
    ok: true,
    message: on
      ? "Automatic points on: new orders use the customer's points before payment is asked."
      : "Automatic points off: use points by hand on each order.",
  };
}

/** The payment configuration name from WhatsApp Manager → Payment configurations; empty turns payment requests off. */
export async function savePaymentConfig(name: string): Promise<SendResult> {
  const s = await requireManager(true, { evenIfLocked: true });
  if ("denied" in s) return { ok: false, message: s.denied };
  const value = name.trim();
  if (value && !/^[\w.-]{1,60}$/.test(value)) return { ok: false, message: "Use the configuration name exactly as WhatsApp Manager shows it." };
  await db.client.update({ where: { id: s.clientId }, data: { paymentConfig: value || null } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: value ? `Payment requests on, using "${value}".` : "Payment requests turned off." };
}

export type ChatAddressCandidate = {
  text: string;
  fullAddress: string;
  area: string | null;
  region: string;
  pincode: string | null;
  receivedAt: string;
};

/** An order taken by phone, at the shop or on paper, so it can be confirmed and dispatched like a WhatsApp cart. */
/** While typing a phone in New order: is this an existing customer of the client, or a new one? Also returns saved address and any address found in their WhatsApp chat. */
export async function lookupOrderCustomer(rawPhone: string): Promise<
  | { valid: false }
  | {
      valid: true;
      existing: {
        id: string;
        name: string;
        optedOut: boolean;
        location: string | null;
        locationRaw: string | null;
        region: string | null;
        chatAddresses: ChatAddressCandidate[];
      } | null;
    }
> {
  const s = await requireOrderAccess();
  if ("denied" in s || !s.clientId) return { valid: false };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { valid: false };
  const existing = await db.customer.findUnique({
    where: { clientId_phone: { clientId: s.clientId, phone } },
    select: {
      id: true,
      name: true,
      optedOut: true,
      location: true,
      locationRaw: true,
      region: true,
      replies: {
        orderBy: { receivedAt: "desc" },
        take: 25,
        select: { text: true, receivedAt: true },
      },
      orders: {
        where: { note: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { note: true, createdAt: true },
      },
    },
  });
  if (!existing) return { valid: true, existing: null };

  const combinedMessages = [
    ...existing.replies,
    ...existing.orders
      .filter((o) => o.note?.trim())
      .map((o) => ({ text: o.note!, receivedAt: o.createdAt })),
  ];
  const detected = findAddressesInReplies(combinedMessages, await homeCityFor(s.clientId)).slice(0, 4).map((c) => ({
    text: c.text,
    fullAddress: c.fullAddress,
    area: c.area,
    region: c.region,
    pincode: c.pincode,
    receivedAt: c.receivedAt.toISOString(),
  }));

  return {
    valid: true,
    existing: {
      id: existing.id,
      name: existing.name,
      optedOut: existing.optedOut,
      location: existing.location,
      locationRaw: existing.locationRaw,
      region: existing.region,
      chatAddresses: detected,
    },
  };
}

/** Fetches address suggestions from a customer's recent WhatsApp chat replies and past orders. */
export async function getCustomerAddressSuggestions(customerId: string): Promise<{
  ok: boolean;
  location: string | null;
  locationRaw: string | null;
  region: string | null;
  chatAddresses: ChatAddressCandidate[];
  recentChatMessages: { text: string; receivedAt: string }[];
}> {
  const s = await requireOrderAccess();
  if ("denied" in s) {
    return { ok: false, location: null, locationRaw: null, region: null, chatAddresses: [], recentChatMessages: [] };
  }
  const cust = await db.customer.findFirst({
    where: { id: customerId, ...(s.clientId ? { clientId: s.clientId } : {}) },
    select: {
      clientId: true,
      location: true,
      locationRaw: true,
      region: true,
      replies: {
        orderBy: { receivedAt: "desc" },
        take: 30,
        select: { text: true, receivedAt: true, kind: true },
      },
      orders: {
        where: { note: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { note: true, createdAt: true },
      },
    },
  });
  if (!cust) {
    return { ok: false, location: null, locationRaw: null, region: null, chatAddresses: [], recentChatMessages: [] };
  }

  const combined = [
    ...cust.replies.map((r) => ({ text: r.text, receivedAt: r.receivedAt })),
    ...cust.orders
      .filter((o) => o.note?.trim())
      .map((o) => ({ text: o.note!, receivedAt: o.createdAt })),
  ];
  const chatAddresses = findAddressesInReplies(combined, await homeCityFor(cust.clientId))
    .slice(0, 5)
    .map((c) => ({
      text: c.text,
      fullAddress: c.fullAddress,
      area: c.area,
      region: c.region,
      pincode: c.pincode,
      receivedAt: c.receivedAt.toISOString(),
    }));

  const recentChatMessages = cust.replies
    .filter((r) => r.kind === "text" || /^Location:/i.test(r.text))
    .slice(0, 6)
    .map((r) => ({ text: r.text, receivedAt: r.receivedAt.toISOString() }));

  return {
    ok: true,
    location: cust.location,
    locationRaw: cust.locationRaw,
    region: cust.region,
    chatAddresses,
    recentChatMessages,
  };
}

/**
 * Adds or updates the delivery address on an order AND keeps the customer's address in sync:
 * - If the customer has no saved address yet, always saves it to the Customer profile.
 * - If the customer already has a saved address and `syncToCustomer` is true (default), updates the Customer profile too.
 * - Optionally fills any other open orders for this customer that still have no address.
 */
export async function saveOrderAddress(
  orderId: string,
  input: {
    address: string;
    area?: string;
    syncToCustomer?: boolean;
    syncOtherActiveOrders?: boolean;
  },
): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({
    where: { id: orderId, ...(s.clientId ? { clientId: s.clientId } : {}) },
    include: {
      customer: {
        select: { id: true, name: true, phone: true, location: true, locationRaw: true, region: true },
      },
      client: { select: { name: true } },
    },
  });
  if (!order) return { ok: false, message: "Order not found." };

  const cleanAddr = input.address.trim().slice(0, 500);
  const parsed = parseAddressText(cleanAddr, await homeCityFor(order.clientId));
  const resolvedArea =
    input.area?.trim().slice(0, 120) ||
    parsed.area ||
    order.customer.location ||
    null;
  const resolvedRegion =
    parsed.region !== "Not sure"
      ? parsed.region
      : order.customer.region || "Not sure";

  // 1. Update this order's delivery address / note
  await db.order.update({
    where: { id: order.id },
    data: { note: cleanAddr || null },
  });
  pushOrderToSheet(order.id, "ORDER_UPDATE", "Address updated");

  // 2. Two-way sync with Customer profile:
  // Always save if customer has no address yet, OR when staff leaves "Update customer's saved address" checked.
  const customerHasNoAddress =
    !order.customer.location?.trim() && !order.customer.locationRaw?.trim();
  const shouldSyncCustomer =
    Boolean(cleanAddr || resolvedArea) &&
    (customerHasNoAddress || input.syncToCustomer !== false);

  if (shouldSyncCustomer) {
    await db.customer.update({
      where: { id: order.customer.id },
      data: {
        ...(cleanAddr ? { locationRaw: cleanAddr } : {}),
        ...(resolvedArea ? { location: resolvedArea } : {}),
        ...(resolvedRegion ? { region: resolvedRegion } : {}),
      },
    });
  }

  // 3. Also fill other active orders for the same customer that are missing an address
  if (cleanAddr && (customerHasNoAddress || input.syncOtherActiveOrders !== false)) {
    await db.order.updateMany({
      where: {
        customerId: order.customer.id,
        id: { not: order.id },
        status: { in: ["NEW", "CONFIRMED", "PAID"] },
        OR: [{ note: null }, { note: "" }],
      },
      data: { note: cleanAddr },
    });
  }

  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: shouldSyncCustomer
      ? `Updated delivery address for ${orderRef(order)} and saved to ${order.customer.name}'s profile${resolvedArea ? ` (${resolvedArea})` : ""}.`
      : `Updated delivery address for ${orderRef(order)} only.`,
  };
}

export async function createOrder(input: {
  phone: string;
  name: string;
  items: { id?: string; name: string; quantity: number; price: number }[];
  shippingFee?: number;
  address?: string;
  area?: string;
  syncCustomerAddress?: boolean;
  note?: string;
  catalogId?: string | null;
  requestPaymentNow?: boolean;
  /** How this order is paid: send the WhatsApp UPI request now, cash on delivery, already paid (cash / UPI), or decide later. */
  paymentMode?: "request" | "cod" | "paid_cash" | "paid_upi" | "later";
  /** For an already-paid order: the UPI reference, if any. */
  paymentRef?: string;
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

  const pay = await paySettingsFor(s.clientId);

  // Parse delivery address and area
  const rawAddr = (input.address?.trim() || input.note?.trim() || "").slice(0, 500);
  const parsedAddr = parseAddressText(rawAddr, await homeCityFor(s.clientId));
  const resolvedArea = input.area?.trim().slice(0, 120) || parsedAddr.area || null;
  const resolvedRegion = parsedAddr.region !== "Not sure" ? parsedAddr.region : null;
  const combinedOrderNote = [input.address?.trim(), input.note?.trim()]
    .filter((v, idx, arr) => Boolean(v) && arr.indexOf(v) === idx)
    .join(" · ")
    .slice(0, 500) || null;

  // A phone not in this client's customers becomes a new customer, so later orders, replies and
  // campaigns find them. They aren't marked as agreeing to marketing: an order isn't that consent.
  const name = input.name.trim();
  const existing = await db.customer.findUnique({
    where: { clientId_phone: { clientId: s.clientId, phone } },
    select: { id: true, name: true, location: true, locationRaw: true, region: true },
  });
  if (!existing && !name) return { ok: false, message: "This is a new customer: enter their name so they can be saved." };
  // Payment settings › Cash on delivery: on, under the limit and in an allowed area (checked before anything is saved).
  if (input.paymentMode === "cod") {
    const fee = input.shippingFee !== undefined ? Math.max(0, Number(input.shippingFee) || 0) : DEFAULT_SHIPPING_FEE;
    const estimate = getOrderPricing(lines.map((i, k) => ({ id: i.id || `m${k}`, name: i.name, quantity: i.quantity, price: i.price, currency: "INR" })), null, { customShippingFee: fee }).total;
    const blocked = codBlocked(pay.settings, estimate, existing ? { ...existing, ...(resolvedRegion && { region: resolvedRegion }), ...(rawAddr && { locationRaw: rawAddr }) } : { region: resolvedRegion, location: resolvedArea, locationRaw: rawAddr });
    if (blocked) return { ok: false, message: blocked };
  }

  let customer: { id: string; name: string };
  if (existing) {
    const customerHasNoAddress = !existing.location?.trim() && !existing.locationRaw?.trim();
    const shouldSyncAddr = (rawAddr || resolvedArea) && (customerHasNoAddress || input.syncCustomerAddress !== false);
    const shouldUpdateName = existing.name === `+${phone}` && Boolean(name);

    if (shouldSyncAddr || shouldUpdateName) {
      customer = await db.customer.update({
        where: { id: existing.id },
        data: {
          ...(shouldUpdateName ? { name } : {}),
          ...(shouldSyncAddr && rawAddr ? { locationRaw: rawAddr } : {}),
          ...(shouldSyncAddr && resolvedArea ? { location: resolvedArea } : {}),
          ...(shouldSyncAddr && resolvedRegion ? { region: resolvedRegion } : {}),
        },
        select: { id: true, name: true },
      });
    } else {
      customer = existing;
    }
  } else {
    customer = await db.customer.create({
      data: {
        clientId: s.clientId,
        phone,
        name,
        tags: ["manual-order"],
        location: resolvedArea,
        locationRaw: rawAddr || null,
        region: resolvedRegion,
      },
      select: { id: true, name: true },
    });
  }

  const allFromCatalog = Boolean(input.catalogId && lines.every((i) => Boolean(i.id)));
  const items: OrderItem[] = lines.map((i, k) => ({
    id: i.id || `manual-${k + 1}`,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    currency: "INR",
  }));
  const shippingFee = input.shippingFee !== undefined ? Math.max(0, Number(input.shippingFee) || 0) : DEFAULT_SHIPPING_FEE;
  const { total: grossTotal } = getOrderPricing(items, null, { customShippingFee: shippingFee });

  const finalOrderNote =
    combinedOrderNote || existing?.locationRaw?.trim() || existing?.location?.trim() || null;

  const order = await db.order.create({
    data: {
      ref: await nextOrderRef(s.clientId),
      clientId: s.clientId,
      customerId: customer.id,
      catalogId: allFromCatalog ? input.catalogId : null,
      items,
      total: grossTotal,
      note: finalOrderNote,
      internalNote: "Entered by hand",
      ...(input.paymentMode === "cod" && { paymentMethod: "cod" }),
    },
  });

  await syncCustomerOrderedProducts(customer.id, items).catch(() => {});
  // Automatic points (Order & Payment Settings) come off before any payment is asked or recorded.
  const pointsOff = await autoRedeemPoints(order.id).catch((e) => (console.error("Could not use loyalty points", e), 0));
  const total = Math.round((grossTotal - pointsOff) * 100) / 100;
  pushOrderToSheet(order.id, "NEW_ORDER");

  const mode = input.paymentMode ?? (input.requestPaymentNow ? "request" : "later");
  let paymentNote = "";
  if (mode === "request" && total > 0 && (pay.waPay || pay.upi)) {
    const payRes = await sendPaymentRequestFor(order.id);
    paymentNote = payRes.ok ? " Sent WhatsApp payment request." : ` (${payRes.message})`;
  } else if ((mode === "paid_cash" || mode === "paid_upi") && total > 0) {
    const method = mode === "paid_cash" ? "cash" : "upi";
    await confirmPayment(order.id, input.paymentRef?.trim().slice(0, 60) || null, { method, source: "staff", utr: utrOf(input.paymentRef) });
    paymentNote = ` Recorded as paid (${mode === "paid_cash" ? "cash" : "UPI"}).`;
  } else if (mode === "cod") {
    paymentNote = ` Cash on delivery: collect ${money(total, "INR")}.`;
  }

  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message:
      (existing
        ? `Order ${orderRef(order)} added for ${customer.name} (total ${money(total, "INR")}).`
        : `Order ${orderRef(order)} added, and ${customer.name} was saved as a new customer.`) + paymentNote,
  };
}

/** Updates an existing order's items, quantities, prices, shipping fee, or customer note/address (common for every order). */
export async function updateOrderItems(
  id: string,
  input: {
    items: { id?: string; name: string; quantity: number; price: number }[];
    shippingFee?: number;
    note?: string | null;
    area?: string | null;
    syncCustomerAddress?: boolean;
    catalogId?: string | null;
  },
): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({
    where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) },
    select: {
      id: true,
      clientId: true,
      number: true, ref: true,
      catalogId: true,
      total: true,
      status: true,
      paidAt: true,
      paidAmount: true,
      currency: true,
      pointsRedeemed: true,
      customer: { select: { id: true, location: true, locationRaw: true, region: true } },
    },
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
  const shippingFee = input.shippingFee !== undefined ? Math.max(0, Number(input.shippingFee) || 0) : DEFAULT_SHIPPING_FEE;
  // Points already used stay on the order (cut back if the items now cost less than the discount).
  const before = getOrderPricing(items, null, { customShippingFee: shippingFee });
  const keptPoints = keptPointsDiscount(order, before.subtotal);
  const total = Math.round((before.total - keptPoints) * 100) / 100;

  await db.order.update({
    where: { id: order.id },
    data: {
      items,
      total,
      pointsRedeemed: keptPoints * 2,
      catalogId: allFromCatalog ? (input.catalogId ?? order.catalogId) : null,
      ...(input.note !== undefined && { note: input.note?.trim() || null }),
    },
  });
  await syncCustomerOrderedProducts(order.customer.id, items).catch(() => {});
  pushOrderToSheet(order.id, "ORDER_UPDATE", "Items changed");

  // Also sync address to customer profile if note/area was provided
  if (input.note !== undefined || input.area !== undefined) {
    const cleanNote = input.note?.trim() || "";
    const parsed = parseAddressText(cleanNote, await homeCityFor(order.clientId));
    const resolvedArea = input.area?.trim() || parsed.area || null;
    const customerHasNoAddress = !order.customer.location?.trim() && !order.customer.locationRaw?.trim();
    const shouldSync =
      (cleanNote || resolvedArea) &&
      (customerHasNoAddress || input.syncCustomerAddress !== false);

    if (shouldSync) {
      await db.customer.update({
        where: { id: order.customer.id },
        data: {
          ...(cleanNote ? { locationRaw: cleanNote.slice(0, 500) } : {}),
          ...(resolvedArea ? { location: resolvedArea.slice(0, 120) } : {}),
          ...(parsed.region !== "Not sure" ? { region: parsed.region } : {}),
        },
      });
    }
  }

  revalidatePath("/dashboard", "layout");
  // Already paid something: say what the change means for the money.
  const got = receivedOf(order);
  const diff = Math.round((total - got) * 100) / 100;
  const money_ = got > 0 && Math.abs(diff) >= 1
    ? diff > 0
      ? ` ${money(got, "INR")} was paid, so ${money(diff, "INR")} is now due.`
      : ` ${money(got, "INR")} was paid, so ${money(-diff, "INR")} should be refunded (record it on the order).`
    : "";
  return { ok: true, message: `Updated ${orderRef(order)} items and total (${money(total, "INR")}).${money_}` };
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
    samples: ["Priya", "#FM-1001"],
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
  if (image && !isTemplatePicture(image)) return { ok: false, message: "Use a public https link to a JPG or PNG image." };
  // New clients' picture versions are pic_…; a client that already has thenan_… ones keeps that name.
  const own = await db.template.findMany({ where: { clientId: s.clientId }, select: { name: true } });
  const prefix = picturePrefixFor(own.map((t) => t.name));
  const named = ORDER_TEMPLATES.map((t) => ({ ...t, name: image ? `${prefix}${t.name}` : t.name }));
  const existing = await db.template.findMany({ where: { clientId: s.clientId, name: { in: named.map((t) => t.name) } }, select: { name: true } });
  const missing = named.filter((t) => !existing.some((e) => e.name === t.name));
  if (!missing.length) return { ok: true, message: `All ${image ? "picture " : ""}order templates already exist.` };

  const failed: string[] = [];
  for (const t of missing) {
    // {{1}} is always the customer's first name; the rest keep Meta's review examples (order sends fill them in).
    const variables = Object.fromEntries(
      t.samples.map((v, k) => [String(k + 1), k === 0 ? { source: "first_name" as const } : { source: "static" as const, value: v }]),
    );
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
  const s = await requireManager(true, { evenIfLocked: true });
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

/** Reorder reminders: send `templateId` this many days after each order; 0 days turns them off. */
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
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/refills");
  return { ok: true, message: n ? `Reorder reminders on: ${n} days after each order.` : "Reorder reminders turned off." };
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

/** Saves the client's custom order fields (PO number, order type…) on one order. */
export async function updateOrderExtra(id: string, values: Record<string, string>): Promise<SendResult> {
  const s = await requireOrderAccess();
  if ("denied" in s) return { ok: false, message: s.denied };
  const order = await db.order.findFirst({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, select: { id: true, extra: true, client: { select: { customFields: true } } } });
  if (!order) return { ok: false, message: "Order not found." };
  const fields = readFields(order.client.customFields, "order");
  const checked = cleanValues(fields, values);
  if ("error" in checked) return { ok: false, message: checked.error };
  // Values of fields no longer shown are kept.
  const kept = Object.fromEntries(Object.entries(readValues(order.extra)).filter(([k]) => !fields.some((f) => f.key === k)));
  await db.order.update({ where: { id: order.id }, data: { extra: { ...kept, ...checked.values } } });
  revalidatePath("/dashboard/orders");
  return { ok: true, message: "Order details saved." };
}
