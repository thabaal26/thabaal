import { Bell, ChevronRight, Inbox, Phone, ShoppingBag, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, FilterChips, PageHeader } from "@/components/ui";
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

/** One icon, tint and action word per kind, so the list can be scanned before it's read. */
const KIND = {
  order: { icon: ShoppingBag, tile: "bg-info-bg text-info", action: "View order" },
  reply: { icon: Inbox, tile: "bg-brand-soft text-brand-deep", action: "Reply" },
  call: { icon: Phone, tile: "bg-accent-bg text-accent", action: "View call" },
  alert: { icon: TriangleAlert, tile: "bg-danger-bg text-danger", action: "View log" },
} as const;

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

  // Grouped by day in the app's time zone, newest first (the list is already sorted).
  const today = fmtDate(new Date(), "yyyy-MM-dd");
  const yesterday = fmtDate(daysAgo(1), "yyyy-MM-dd");
  const days: { key: string; label: string; items: NotificationRow[] }[] = [];
  for (const item of filtered) {
    const key = fmtDate(item.date, "yyyy-MM-dd");
    let group = days.find((d) => d.key === key);
    if (!group) {
      group = { key, label: key === today ? "Today" : key === yesterday ? "Yesterday" : fmtDate(item.date, "EEEE d MMMM"), items: [] };
      days.push(group);
    }
    group.items.push(item);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Customer replies, orders, WhatsApp calls and delivery problems in one place. Unread items still need someone to act on them."
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
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              <h2 id={`day-${day.key}`} className="mb-2 px-1 text-xs font-medium text-muted">
                {day.label}
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {day.items.map((item) => {
                    const k = KIND[item.type];
                    return (
                      <li key={item.id} className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-subtle sm:items-center sm:px-5">
                        {item.unread && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-brand" />}
                        <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full", k.tile)}>
                          <k.icon className="size-[18px]" />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={cn("min-w-0 truncate text-sm", item.unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                              <Link href={item.href} className="outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-brand">
                                {item.title}
                              </Link>
                            </p>
                            {item.urgent && <Badge tone="amber" dot>Ringing</Badge>}
                            {item.unread && <span className="sr-only">(unread)</span>}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted sm:line-clamp-1">{item.description}</p>
                          <p className="tabular mt-1 text-xs text-muted sm:hidden">
                            {fmtDate(item.date, "h:mm a")}
                            {item.phone && ` · ${formatPhone(item.phone)}`}
                          </p>
                        </div>

                        <div className="hidden shrink-0 text-right sm:block">
                          <p className="tabular text-xs text-muted">{fmtDate(item.date, "h:mm a")}</p>
                          {item.phone && <p className="tabular text-xs text-muted">{formatPhone(item.phone)}</p>}
                        </div>
                        <span className="hidden w-24 shrink-0 items-center justify-end gap-1 text-xs font-medium text-brand-deep md:flex">
                          {k.action} <ChevronRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </span>
                        <ChevronRight aria-hidden className="mt-2 size-4 shrink-0 text-faint md:hidden" />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<Bell />} title={show === "unread" ? "You're all caught up" : "Nothing here yet"}>
            {show === "unread" ? "Every reply, order and alert has been handled." : "New replies, orders, calls and delivery problems will show up here."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
