"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { itemsText, money, type OrderItem } from "@/lib/orders";
import { getSettings, wahaConfig } from "@/lib/provider";
import { replyWindowEnd } from "@/lib/replies";
import { senderFor } from "@/lib/senders";
import { requireAdmin } from "@/lib/session";
import { sendText } from "@/lib/waha";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp";
import { explainSendError, type SendResult } from "./send-helpers";

const STATUSES: OrderStatus[] = ["NEW", "CONFIRMED", "PAID", "DISPATCHED", "DELIVERED", "CANCELLED"];

export async function setOrderStatus(id: string, status: OrderStatus): Promise<SendResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status." };
  const r = await db.order.updateMany({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, data: { status } });
  if (!r.count) return { ok: false, message: "Order not found." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `Marked ${status.toLowerCase()}.` };
}

export async function saveOrderNote(id: string, note: string): Promise<SendResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.order.updateMany({ where: { id, ...(s.clientId ? { clientId: s.clientId } : {}) }, data: { internalNote: note.trim().slice(0, 1000) || null } });
  if (!r.count) return { ok: false, message: "Order not found." };
  revalidatePath("/dashboard/orders");
  return { ok: true, message: "Note saved." };
}

const TEMPLATE_NAMES = { confirm: ["order_confirmation", "thenan_order_confirmation"], dispatch: ["order_dispatched", "thenan_order_dispatched"] };

/**
 * Tells the customer their order is confirmed or dispatched, then moves the order on. While
 * their 24-hour window is open (an order always opens it) it sends a typed message; later it
 * needs the approved order_confirmation / order_dispatched utility template.
 */
export async function notifyOrder(id: string, kind: "confirm" | "dispatch", eta?: string): Promise<SendResult> {
  const s = await requireAdmin();
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
  const when = eta?.trim() || "soon";
  const text =
    kind === "confirm"
      ? `Hello ${first}, thank you for your order with ${order.client.name}.\n\nItems: ${itemsText(items)}\nTotal: ${money(order.total, order.currency)}\n\nWe will confirm your delivery slot shortly.`
      : `Hello ${first}, your ${order.client.name} order ${ref} is on its way and will reach you by ${when}.\n\nFor any help, reply to this message.`;

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
      const t = await db.template.findFirst({ where: { clientId: c.clientId, name: { in: TEMPLATE_NAMES[kind] }, status: "APPROVED" } });
      if (!t)
        return { ok: false, message: "The customer's 24-hour window has closed and no approved order template was found. Get the order_confirmation / order_dispatched templates approved first." };
      const bodyParams = kind === "confirm" ? [first, itemsText(items), String(Math.round(order.total))] : [first, ref, when];
      ({ id: waId, simulated } = await sendTemplateMessage(cfg, { to: c.phone, templateName: t.name, language: t.language, headerType: "NONE", headerParams: [], bodyParams }));
      templateName = t.name;
      templateId = t.id;
    }
    await db.message.create({
      data: {
        customerId: c.id, templateId, templateName, body: text, status: "SENT", waMessageId: waId, simulated,
        provider: settings.provider, sentAt: new Date(), senderId: settings.provider === "META" ? (number?.id ?? null) : null,
      },
    });
    await db.order.update({ where: { id: order.id }, data: { status: kind === "confirm" ? "CONFIRMED" : "DISPATCHED" } });
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: simulated ? "Simulated message logged (demo mode)." : `${kind === "confirm" ? "Confirmation" : "Dispatch update"} sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}
