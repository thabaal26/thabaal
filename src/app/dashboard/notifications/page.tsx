import { Bell, Inbox, Phone, ShoppingBag, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, FilterChips, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { daysAgo, fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned, ownedMessages } from "@/lib/session";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

type NotificationRow = {
  id: string;
  type: "reply" | "order" | "call" | "alert";
  title: string;
  customerName?: string;
  phone?: string;
  description: string;
  date: Date;
  href: string;
  unread: boolean;
  urgent?: boolean;
};

const TABS = [
  { key: "", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "orders", label: "Orders" },
  { key: "replies", label: "Replies" },
  { key: "calls", label: "Calls" },
  { key: "alerts", label: "Alerts" },
] as const;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const sp = await searchParams;
  const show = typeof sp.show === "string" ? sp.show : "";

  const scope = await getScope();
  const mine = owned(scope);
  const myMessages = ownedMessages(scope);
  const oneDayAgo = daysAgo(1);

  const [replies, orders, calls, failures] = await Promise.all([
    db.reply.findMany({
      where: myMessages,
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: { receivedAt: "desc" },
      take: 40,
    }),
    db.order.findMany({
      where: mine,
      include: { customer: { select: { id: true, name: true, phone: true, location: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }).catch(() => []),
    db.call.findMany({
      where: { ...mine, startedAt: { gte: oneDayAgo } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
      take: 20,
    }).catch(() => []),
    db.message.findMany({
      where: { status: "FAILED", failedAt: { gte: oneDayAgo }, ...myMessages },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { failedAt: "desc" },
      take: 10,
    }),
  ]);

  const items: NotificationRow[] = [];

  for (const r of replies) {
    items.push({
      id: `reply-${r.id}`,
      type: "reply",
      title: `Customer reply from ${r.customer.name}`,
      customerName: r.customer.name,
      phone: r.customer.phone,
      description: r.text || (r.kind ? `Sent a ${r.kind}` : "Customer responded to WhatsApp message"),
      date: r.receivedAt,
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
      customerName: o.customer.name,
      phone: o.customer.phone,
      description: `₹${fmtNumber(o.total)} · ${o.customer.location || formatPhone(o.customer.phone)}`,
      date: o.createdAt,
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
      customerName: caller,
      phone: c.fromPhone,
      description: `Status: ${c.status.toLowerCase()}${c.duration ? ` · ${c.duration}s` : ""} · ${formatPhone(c.fromPhone)}`,
      date: c.startedAt,
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
      customerName: f.customer.name,
      description: f.error || "Message send failed",
      date: f.failedAt ?? f.createdAt,
      href: "/dashboard/messages?status=FAILED",
      unread: true,
    });
  }

  // Sort descending by date
  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  const unreadCount = items.filter((i) => i.unread).length;
  const orderCount = items.filter((i) => i.type === "order").length;
  const replyCount = items.filter((i) => i.type === "reply").length;
  const callCount = items.filter((i) => i.type === "call").length;
  const alertCount = items.filter((i) => i.type === "alert").length;

  const tabCounts: Record<string, number> = {
    "": items.length,
    unread: unreadCount,
    orders: orderCount,
    replies: replyCount,
    calls: callCount,
    alerts: alertCount,
  };

  const filtered = items.filter((i) => {
    if (show === "unread") return i.unread;
    if (show === "orders") return i.type === "order";
    if (show === "replies") return i.type === "reply";
    if (show === "calls") return i.type === "call";
    if (show === "alerts") return i.type === "alert";
    return true;
  });

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Unified live notifications for customer replies, catalogue orders, incoming WhatsApp calls, and message delivery alerts."
        tabs={
          <FilterChips
            label="Filter notifications"
            items={TABS.map((t) => ({
              href: t.key ? `/dashboard/notifications?show=${t.key}` : "/dashboard/notifications",
              label: t.label,
              count: fmtNumber(tabCounts[t.key] ?? 0),
              active: (show || "") === t.key,
            }))}
          />
        }
      />

      {filtered.length > 0 ? (
        <Card>
          <ul className="divide-y divide-line">
            {filtered.map((item) => {
              const isOrder = item.type === "order";
              const isReply = item.type === "reply";
              const isCall = item.type === "call";
              const isAlert = item.type === "alert";

              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5",
                    item.unread ? "bg-panel hover:bg-canvas/50" : "bg-panel/60 hover:bg-panel text-muted"
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full",
                        isOrder && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                        isReply && "bg-brand-soft text-brand-deep",
                        isCall && (item.urgent ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-glow/20 text-glow"),
                        isAlert && "bg-danger-bg text-danger"
                      )}
                    >
                      {isOrder && <ShoppingBag className="size-5" />}
                      {isReply && <Inbox className="size-5" />}
                      {isCall && <Phone className="size-5" />}
                      {isAlert && <TriangleAlert className="size-5" />}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={cn("text-sm font-semibold truncate", item.unread ? "text-ink" : "text-ink-muted")}>
                          {item.title}
                        </p>
                        {item.unread && (
                          <span className="size-2 rounded-full bg-brand shrink-0" aria-label="Unread" />
                        )}
                        {item.urgent && (
                          <Badge tone="amber">Ringing</Badge>
                        )}
                      </div>

                      <p className="mt-0.5 text-xs text-muted leading-relaxed line-clamp-2">
                        {item.description}
                      </p>

                      <p className="mt-1 text-2xs text-muted">
                        {fmtDate(item.date, "EEE d MMM, h:mm a")}
                        {item.phone && ` · ${formatPhone(item.phone)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pt-1 sm:pt-0">
                    <Link
                      href={item.href}
                      className={cn(
                        buttonClass(item.unread ? "primary" : "secondary"),
                        "text-xs min-h-11 sm:min-h-8 max-sm:w-full justify-center"
                      )}
                    >
                      {isOrder && "View order"}
                      {isReply && "Reply in chat"}
                      {isCall && "View call"}
                      {isAlert && "View log"}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={<Bell className="size-6 text-muted" />}
            title="No notifications in this view"
          >
            All updates and messages in this category have been handled.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
