"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ExternalLink, Inbox, Phone, ShoppingBag, TriangleAlert, X } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/cn";
import type { NotificationItem } from "@/app/api/notifications/route";

type NotificationContextType = {
  notifications: NotificationItem[];
  unreadCount: number;
  openSheet: boolean;
  setOpenSheet: (open: boolean) => void;
  markAllRead: () => void;
  refresh: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextType | null>(null);

function timeAgo(dateStr: string) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getIcon(type: NotificationItem["type"]) {
  switch (type) {
    case "order":
      return <ShoppingBag className="size-4 text-emerald-600" />;
    case "reply":
      return <Inbox className="size-4 text-brand-deep" />;
    case "call":
      return <Phone className="size-4 text-glow" />;
    case "alert":
      return <TriangleAlert className="size-4 text-danger" />;
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openSheet, setOpenSheet] = useState(false);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialFetchRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unreadCount: number; notifications: NotificationItem[] };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || stop) return;
        const data = (await res.json()) as { unreadCount: number; notifications: NotificationItem[] };
        if (stop) return;
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);

        if (initialFetchRef.current) {
          for (const item of data.notifications) {
            seenIdsRef.current.add(item.id);
          }
          initialFetchRef.current = false;
        } else {
          const newItems = data.notifications.filter(
            (item) => item.unread && !seenIdsRef.current.has(item.id)
          );
          for (const item of newItems) {
            seenIdsRef.current.add(item.id);
          }
          if (newItems.length > 0) {
            setToasts((prev) => [...newItems.slice(0, 3), ...prev].slice(0, 4));
          }
        }
      } catch {
        // offline / momentary glitch
      }
    };

    tick();
    const interval = setInterval(tick, 12000);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, []);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    setUnreadCount(0);
    setToasts([]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        openSheet,
        setOpenSheet,
        markAllRead,
        refresh,
      }}
    >
      {children}

      {/* Floating toast notification alerts */}
      {toasts.length > 0 && (
        <div
          role="region"
          aria-label="Live notifications"
          className="fixed bottom-20 right-3 z-50 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 pointer-events-none sm:bottom-6 sm:right-6 print:hidden"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-card border bg-panel p-3.5 shadow-pop transition-all animate-toast",
                toast.urgent
                  ? "border-amber-500/80 bg-amber-50/90 dark:bg-amber-950/40"
                  : "border-line-strong/60"
              )}
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-control bg-canvas">
                {getIcon(toast.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-ink">{toast.title}</p>
                  <span className="shrink-0 text-2xs text-muted">{timeAgo(toast.timestamp)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{toast.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={toast.href}
                    onClick={() => dismissToast(toast.id)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-control bg-brand-deep px-2.5 text-xs font-semibold text-white transition hover:bg-brand active:scale-95 sm:min-h-7"
                  >
                    <span>View</span>
                    <ExternalLink className="size-3" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    className="inline-flex min-h-11 items-center rounded-control px-2 text-xs text-muted hover:text-ink sm:min-h-7"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Close notification"
                className="grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-canvas hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notification drawer / sheet */}
      <NotificationDrawer />
    </NotificationContext.Provider>
  );
}

export function useNotificationCenter() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationCenter must be used within NotificationProvider");
  return ctx;
}

export function NotificationBell({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  const { unreadCount, setOpenSheet } = useNotificationCenter();

  return (
    <button
      type="button"
      onClick={() => setOpenSheet(true)}
      title="Notifications"
      aria-label={`Notifications, ${unreadCount} unread`}
      className={cn(
        "relative grid size-11 place-items-center rounded-full transition active:scale-95",
        dark
          ? "text-white/80 hover:bg-white/10 hover:text-white"
          : "text-ink-muted hover:bg-canvas hover:text-ink",
        className
      )}
    >
      <Bell className="size-5 shrink-0" />
      {unreadCount > 0 && (
        <span
          className={cn(
            "tabular absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full px-1 text-2xs font-bold ring-2",
            dark
              ? "bg-glow text-night ring-night"
              : "bg-brand text-white ring-panel"
          )}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

function NotificationDrawer() {
  const { notifications, unreadCount, openSheet, setOpenSheet, markAllRead } =
    useNotificationCenter();
  const [filter, setFilter] = useState<"all" | "unread" | "orders" | "replies" | "calls">("all");

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return n.unread;
    if (filter === "orders") return n.type === "order";
    if (filter === "replies") return n.type === "reply";
    if (filter === "calls") return n.type === "call";
    return true;
  });

  return (
    <Sheet
      open={openSheet}
      onClose={() => setOpenSheet(false)}
      title="Notifications"
      description={
        unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
          : "You're all caught up!"
      }
      className="sm:max-w-md"
    >
      <div className="space-y-4">
        {/* Category filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
          <div className="flex flex-wrap gap-1">
            {(
              [
                { id: "all", label: "All" },
                { id: "unread", label: `Unread (${unreadCount})` },
                { id: "orders", label: "Orders" },
                { id: "replies", label: "Replies" },
                { id: "calls", label: "Calls" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={cn(
                  "min-h-11 rounded-full px-3 text-xs font-semibold transition sm:min-h-7",
                  filter === t.id
                    ? "bg-brand text-white"
                    : "bg-canvas text-muted hover:text-ink"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand-deep hover:underline sm:min-h-7"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        {/* List of items */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">
            <Bell className="mx-auto mb-2 size-8 text-muted/50" />
            <p className="font-medium text-ink">No notifications</p>
            <p className="text-xs text-muted">Nothing to see in this category right now.</p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-[60vh] overflow-y-auto no-scrollbar pr-0.5">
            {filtered.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpenSheet(false)}
                  className={cn(
                    "flex items-start gap-3 rounded-card border p-3 transition hover:border-brand/50 active:bg-sunken",
                    item.unread
                      ? "border-line-strong bg-brand-soft/20 text-ink"
                      : "border-line/70 bg-panel text-ink-muted"
                  )}
                >
                  <div className="grid size-8 shrink-0 place-items-center rounded-control bg-canvas">
                    {getIcon(item.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-xs font-semibold text-ink">
                        {item.title}
                      </p>
                      <span className="shrink-0 text-2xs text-muted">
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                      {item.description}
                    </p>
                  </div>
                  {item.unread && (
                    <span
                      aria-label="Unread"
                      className="size-2 shrink-0 rounded-full bg-brand"
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* View all page link */}
        <div className="border-t border-line pt-3 text-center">
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpenSheet(false)}
            className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline sm:min-h-7"
          >
            <span>Open full notifications page</span>
            <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </div>
    </Sheet>
  );
}
