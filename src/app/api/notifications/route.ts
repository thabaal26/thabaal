import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { daysAgo, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned, ownedMessages, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export type NotificationItem = {
  id: string;
  type: "reply" | "order" | "call" | "alert";
  title: string;
  description: string;
  timestamp: string;
  href: string;
  unread: boolean;
  urgent?: boolean;
};

export async function GET() {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const scope = await getScope();
  const mine = owned(scope);
  const myMessages = ownedMessages(scope);
  const oneDayAgo = daysAgo(1);

  const [replies, orders, calls, failures] = await Promise.all([
    db.reply.findMany({
      where: { ...myMessages },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { receivedAt: "desc" },
      take: 15,
    }),
    db.order.findMany({
      where: { ...mine },
      include: { customer: { select: { id: true, name: true, phone: true, location: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }).catch(() => []),
    db.call.findMany({
      where: { ...mine, startedAt: { gte: oneDayAgo } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: 10,
    }).catch(() => []),
    db.message.findMany({
      where: { status: "FAILED", failedAt: { gte: oneDayAgo }, ...myMessages },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { failedAt: "desc" },
      take: 5,
    }),
  ]);

  const items: NotificationItem[] = [];

  for (const r of replies) {
    items.push({
      id: `reply-${r.id}`,
      type: "reply",
      title: `Customer reply: ${r.customer.name}`,
      description: r.text || (r.kind ? `Sent a ${r.kind}` : "Customer responded to WhatsApp message"),
      timestamp: r.receivedAt.toISOString(),
      href: `/dashboard/replies?show=${r.handled ? "all" : "open"}`,
      unread: !r.handled,
    });
  }

  for (const o of orders) {
    const isNew = o.status === "NEW";
    const isPaid = o.status === "PAID";
    items.push({
      id: `order-${o.id}`,
      type: "order",
      title: `Order #RG-${o.number} (${o.status.toLowerCase()}): ${o.customer.name}`,
      description: `₹${fmtNumber(o.total)} · ${o.customer.location || formatPhone(o.customer.phone)}`,
      timestamp: o.createdAt.toISOString(),
      href: `/dashboard/orders?q=RG-${o.number}`,
      unread: isNew || isPaid || o.status === "CONFIRMED",
    });
  }

  for (const c of calls) {
    const isRinging = c.status === "RINGING";
    const isMissed = c.status === "MISSED" || c.status === "REJECTED";
    const caller = c.customer?.name || c.callerName || formatPhone(c.fromPhone);
    items.push({
      id: `call-${c.id}`,
      type: "call",
      title: isRinging
        ? `Incoming WhatsApp call from ${caller}`
        : `${c.direction === "INCOMING" ? "Incoming" : "Outgoing"} call: ${caller}`,
      description: `Status: ${c.status.toLowerCase()}${c.duration ? ` · ${c.duration}s` : ""} · ${formatPhone(c.fromPhone)}`,
      timestamp: c.startedAt.toISOString(),
      href: "/dashboard/calls",
      unread: isRinging || isMissed,
      urgent: isRinging,
    });
  }

  for (const f of failures) {
    items.push({
      id: `fail-${f.id}`,
      type: "alert",
      title: `Message delivery failed to ${f.customer.name}`,
      description: f.error || "Delivery failed",
      timestamp: (f.failedAt ?? f.createdAt).toISOString(),
      href: `/dashboard/messages?status=FAILED`,
      unread: true,
    });
  }

  // Sort by newest first
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const unreadCount = items.filter((i) => i.unread).length;

  return NextResponse.json({
    unreadCount,
    notifications: items.slice(0, 30),
  });
}
