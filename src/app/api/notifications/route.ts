import { orderRef } from "@/lib/order-ref";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { daysAgo, fmtNumber } from "@/lib/format";
import { getMetaAccountAlerts } from "@/lib/meta-balance";
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
  const sevenDaysAgo = daysAgo(7);

  const client = scope.clientId
    ? await db.client.findUnique({ where: { id: scope.clientId }, select: { disabledSections: true } })
    : null;
  const disabledSections = client?.disabledSections ?? [];
  const ordersOn = isSectionEnabled(disabledSections, "orders");
  const repliesOn = isSectionEnabled(disabledSections, "replies");
  const callsOn = isSectionEnabled(disabledSections, "calls");

  const [replies, orders, calls, failures, recentSuccesses, numbers, flaggedTemplates] = await Promise.all([
    repliesOn
      ? db.reply.findMany({
          where: { ...myMessages },
          include: { customer: { select: { id: true, name: true, phone: true } } },
          orderBy: { receivedAt: "desc" },
          take: 15,
        })
      : [],
    ordersOn
      ? db.order.findMany({
          where: { ...mine },
          include: { customer: { select: { id: true, name: true, phone: true, location: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        }).catch(() => [])
      : [],
    callsOn
      ? db.call.findMany({
          where: { ...mine, startedAt: { gte: oneDayAgo } },
          include: { customer: { select: { id: true, name: true } } },
          orderBy: { startedAt: "desc" },
          take: 10,
        }).catch(() => [])
      : [],
    db.message.findMany({
      where: { status: "FAILED", failedAt: { gte: oneDayAgo }, ...myMessages },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { failedAt: "desc" },
      take: 5,
    }),
    db.message.findMany({
      where: { status: { in: ["SENT", "DELIVERED", "READ"] }, createdAt: { gte: oneDayAgo }, ...myMessages },
      select: { customerId: true, templateName: true, createdAt: true },
    }),
    db.whatsAppNumber.findMany({
      where: { ...mine },
      select: { id: true, label: true, displayPhone: true, businessAccountId: true, qualityRating: true, statusCheckedAt: true, createdAt: true },
    }).catch(() => []),
    db.template.findMany({
      where: {
        ...mine,
        updatedAt: { gte: sevenDaysAgo },
        OR: [
          { status: { in: ["PAUSED", "DISABLED", "REJECTED"] } },
          { qualityScore: "RED" },
        ],
      },
      select: { id: true, name: true, status: true, statusReason: true, qualityScore: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }).catch(() => []),
  ]);

  const items: NotificationItem[] = [];

  const replyByCustomer = new Map<string, { latest: (typeof replies)[number]; count: number; unread: boolean }>();
  for (const r of replies) {
    const existing = replyByCustomer.get(r.customerId);
    if (existing) {
      existing.count += 1;
      if (!r.handled) existing.unread = true;
    } else {
      replyByCustomer.set(r.customerId, { latest: r, count: 1, unread: !r.handled });
    }
  }

  for (const { latest: r, count, unread } of replyByCustomer.values()) {
    items.push({
      id: `reply-${r.customerId}-${r.id}`,
      type: "reply",
      title: `Customer reply: ${r.customer.name}${count > 1 ? ` (${count} messages)` : ""}`,
      description: r.text || (r.kind ? `Sent a ${r.kind}` : "Customer responded to WhatsApp message"),
      timestamp: r.receivedAt.toISOString(),
      href: `/dashboard/replies?show=${unread ? "open" : "all"}`,
      unread,
    });
  }

  for (const o of orders) {
    const isNew = o.status === "NEW";
    const isPaid = o.status === "PAID";
    items.push({
      id: `order-${o.id}`,
      type: "order",
      title: `Order #${orderRef(o)} (${o.status.toLowerCase()}): ${o.customer.name}`,
      description: `₹${fmtNumber(o.total)} · ${o.customer.location || formatPhone(o.customer.phone)}`,
      timestamp: o.createdAt.toISOString(),
      href: `/dashboard/orders?q=${orderRef(o)}`,
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

  if (failures.length > 0) {
    const errorCounts = new Map<string, number>();
    for (const f of failures) {
      const err = f.error || "Delivery failed";
      errorCounts.set(err, (errorCounts.get(err) || 0) + 1);
    }
    const errSummary = Array.from(errorCounts.entries())
      .map(([err, count]) => (count > 1 ? `${err} (${count})` : err))
      .join("; ");

    items.push({
      id: `fail-summary-${failures[0].id}`,
      type: "alert",
      title: `${failures.length} message${failures.length === 1 ? "" : "s"} failed in the last 24 hours`,
      description: errSummary,
      timestamp: (failures[0].failedAt ?? failures[0].createdAt).toISOString(),
      href: "/dashboard/messages?status=FAILED",
      unread: true,
      urgent: true,
    });
  }

  for (const f of failures) {
    const failTime = (f.failedAt ?? f.createdAt).getTime();
    const superseded = recentSuccesses.some(
      (s) =>
        s.customerId === f.customerId &&
        s.templateName === f.templateName &&
        s.createdAt.getTime() > failTime,
    );
    if (superseded) continue;
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

  // Surface WhatsApp number quality alerts (RED / YELLOW)
  for (const n of numbers) {
    if (n.qualityRating === "RED" || n.qualityRating === "YELLOW") {
      items.push({
        id: `num-quality-${n.id}-${n.qualityRating}`,
        type: "alert",
        title: `WhatsApp number quality is ${n.qualityRating.toLowerCase()}: ${n.label}`,
        description: n.qualityRating === "RED"
          ? `${n.displayPhone || n.label} is paused to protect the number.`
          : `${n.displayPhone || n.label} quality dropped to yellow — monitor recent campaigns.`,
        timestamp: (n.statusCheckedAt ?? n.createdAt).toISOString(),
        href: "/dashboard/clients",
        unread: true,
        urgent: n.qualityRating === "RED",
      });
    }
  }

  // Surface paused, disabled, or rejected templates from Meta
  for (const t of flaggedTemplates) {
    items.push({
      id: `tpl-alert-${t.id}-${t.status}-${t.qualityScore ?? ""}`,
      type: "alert",
      title: `Template ${t.status.toLowerCase()}: ${t.name}`,
      description: t.statusReason || (t.qualityScore === "RED" ? "Meta marked this template's quality as low (red)." : `Meta updated status to ${t.status.toLowerCase()}.`),
      timestamp: t.updatedAt.toISOString(),
      href: `/dashboard/templates/${t.id}`,
      unread: true,
    });
  }

  // Surface Meta account_update / account_alerts webhook events
  const allowedWabas = new Set(numbers.map((n) => n.businessAccountId));
  for (const a of getMetaAccountAlerts(scope.clientId)) {
    if (scope.clientId && a.wabaId && allowedWabas.size > 0 && !allowedWabas.has(a.wabaId)) continue;
    items.push({
      id: a.id,
      type: "alert",
      title: a.title,
      description: a.detail,
      timestamp: a.receivedAt,
      href: "/dashboard/settings",
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
