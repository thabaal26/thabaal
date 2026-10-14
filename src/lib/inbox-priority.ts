import { orderRef } from "@/lib/order-ref";
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

// Inbox priority: every open conversation, sorted into lanes by what's at stake and how long
// WhatsApp still lets us reply for free (24 hours from the customer's last message).

const HOUR = 3_600_000;
const WINDOW_H = 24;
const BUY_RE = /(order|buy|need|want|send|price|rate|cost|how much|available|stock|catalog|menu|list|venum|vendum|kg|litre|liter|ml\b)|வேண்டும்|ஆர்டர்|விலை/i;

export type Lane = "money" | "buying" | "regular" | "other";

export type InboxItem = {
  customerId: string;
  name: string;
  phone: string;
  latestReplyId: string;
  lastText: string;
  lastKind: string;
  openCount: number;
  /** First unanswered message: how long they've been waiting. */
  waitingSince: Date;
  lastAt: Date;
  /** Hours left to reply with free text (0 = closed, template only). */
  windowLeftH: number;
  cart: { id: string; ref: string; total: number; paymentRequested: boolean } | null;
  paidOrders: number;
  lifetimeValue: number;
  buyingIntent: boolean;
  lane: Lane;
  score: number;
};

export async function inboxPriority(where: Prisma.ReplyWhereInput, now = new Date()): Promise<InboxItem[]> {
  const open = await db.reply.findMany({
    where: { ...where, handled: false },
    select: {
      id: true,
      text: true,
      kind: true,
      receivedAt: true,
      customerId: true,
      customer: {
        select: {
          name: true,
          phone: true,
          orders: {
            where: { status: { not: "CANCELLED" } },
            select: { id: true, number: true, ref: true, total: true, status: true, paidAt: true, paymentRequestedAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
    orderBy: { receivedAt: "asc" },
    take: 1000,
  });

  const map = new Map<string, InboxItem>();
  for (const r of open) {
    const cur = map.get(r.customerId);
    const intent = r.kind === "order" || r.kind === "button" || BUY_RE.test(r.text);
    if (cur) {
      cur.openCount++;
      cur.latestReplyId = r.id;
      cur.lastText = r.text;
      cur.lastKind = r.kind;
      cur.lastAt = r.receivedAt;
      cur.buyingIntent ||= intent;
      continue;
    }
    const orders = r.customer.orders;
    const bought = orders.filter((o) => o.paidAt || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status));
    const cart = orders.find((o) => !o.paidAt && (o.status === "NEW" || o.status === "CONFIRMED"));
    map.set(r.customerId, {
      customerId: r.customerId,
      name: r.customer.name,
      phone: r.customer.phone,
      latestReplyId: r.id,
      lastText: r.text,
      lastKind: r.kind,
      openCount: 1,
      waitingSince: r.receivedAt,
      lastAt: r.receivedAt,
      windowLeftH: 0,
      cart: cart ? { id: cart.id, ref: orderRef(cart), total: cart.total, paymentRequested: Boolean(cart.paymentRequestedAt) } : null,
      paidOrders: bought.length,
      lifetimeValue: bought.reduce((n, o) => n + o.total, 0),
      buyingIntent: intent,
      lane: "other",
      score: 0,
    });
  }

  const items = [...map.values()];
  for (const it of items) {
    it.windowLeftH = Math.max(0, WINDOW_H - (now.getTime() - it.lastAt.getTime()) / HOUR);
    it.lane = it.cart ? "money" : it.buyingIntent ? "buying" : it.paidOrders > 0 ? "regular" : "other";
    const waitedH = (now.getTime() - it.waitingSince.getTime()) / HOUR;
    // Money first, then intent, then loyal buyers; within that, closing windows and long waits rise.
    const base = { money: 4000, buying: 3000, regular: 2000, other: 1000 }[it.lane];
    const value = Math.min(800, (it.cart?.total ?? 0) / 2 + it.lifetimeValue / 20);
    const urgency = it.windowLeftH > 0 ? Math.max(0, 300 - it.windowLeftH * 12) : -200;
    it.score = base + value + urgency + Math.min(200, waitedH * 8);
  }
  return items.sort((a, b) => b.score - a.score);
}
