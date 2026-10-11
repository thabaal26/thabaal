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

/** One icon and tint per kind, so the list can be scanned by type before reading. */
const KIND = {
  order: { icon: ShoppingBag, tile: "bg-info-bg text-info" },
  reply: { icon: Inbox, tile: "bg-brand-soft text-brand-deep" },
  call: { icon: Phone, tile: "bg-accent-bg text-accent" },
  alert: { icon: TriangleAlert, tile: "bg-danger-bg text-danger" },
} as const;

function KindIcon({ type }: { type: NotificationItem["type"] }) {
  const k = KIND[type] ?? KIND.alert;
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-control", k.tile)}>
      <k.icon className="size-4" />
    </span>
  );
}

function stripTitlePrefix(title: string): string {
  const cleaned = title.replace(/^(?:🔔\s*|\(\d+\+?\)\s*)+/g, "").trim();
  return cleaned || "Thabaal · Customer Messaging";
}

function updateDynamicFavicon(count: number) {
  if (typeof document === "undefined") return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Rounded white tile background so the Thabaal bird pops on both dark & light browser tabs
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e2e8f0";
    ctx.stroke();

    // Draw the Thabaal bird mark (or custom logo) preserving aspect ratio
    const pad = 6;
    const maxW = size - pad * 2;
    const maxH = size - pad * 2;
    const ratio = Math.min(maxW / (img.naturalWidth || 64), maxH / (img.naturalHeight || 64));
    const drawW = (img.naturalWidth || 64) * ratio;
    const drawH = (img.naturalHeight || 64) * ratio;
    const drawX = (size - drawW) / 2;
    const drawY = (size - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Draw live notification badge in top-right corner when unreadCount > 0
    if (count > 0) {
      const label = count > 9 ? "9+" : String(count);
      const badgeR = label.length > 1 ? 15 : 13;
      const cx = size - badgeR - 1;
      const cy = badgeR + 1;

      ctx.beginPath();
      ctx.arc(cx, cy, badgeR + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#e11d48";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${label.length > 1 ? 14 : 16}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 1);
    }

    const dataUrl = canvas.toDataURL("image/png");
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]');
    if (links.length > 0) {
      links.forEach((link) => {
        if (link.rel !== "apple-touch-icon") {
          link.type = "image/png";
          link.href = dataUrl;
        }
      });
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/png";
      link.href = dataUrl;
      document.head.appendChild(link);
    }
  };
  img.src = "/brands/thabaal/mark.png";
}

export function NotificationProvider({
  children,
  initialUnreadCount = 0,
}: {
  children: ReactNode;
  initialUnreadCount?: number;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [openSheet, setOpenSheet] = useState(false);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [flashTitle, setFlashTitle] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialFetchRef = useRef(true);
  const updatingTitleRef = useRef(false);

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
            setFlashTitle(newItems[0].title);
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

  // Keep browser tab title and favicon badge synced with unread notifications
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyTabState = () => {
      if (updatingTitleRef.current) return;
      updatingTitleRef.current = true;
      const base = stripTitlePrefix(document.title);
      const countText = unreadCount > 99 ? "99+" : String(unreadCount);
      const nextTitle = unreadCount > 0 ? `(${countText}) ${base}` : base;
      if (document.title !== nextTitle) {
        document.title = nextTitle;
      }
      updatingTitleRef.current = false;
    };

    applyTabState();
    updateDynamicFavicon(unreadCount);

    // Also update OS / PWA app badge when supported
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unreadCount > 0) {
      nav.setAppBadge?.(unreadCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }

    const titleEl = document.querySelector("head > title");
    if (!titleEl) return;
    const observer = new MutationObserver(() => {
      if (!updatingTitleRef.current && !flashTitle) {
        applyTabState();
      }
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [unreadCount, flashTitle]);

  // Briefly pulse the tab title when a brand-new live notification arrives
  useEffect(() => {
    if (!flashTitle || unreadCount <= 0 || typeof document === "undefined") return;
    let step = 0;
    const base = stripTitlePrefix(document.title);
    const countText = unreadCount > 99 ? "99+" : String(unreadCount);
    const timer = setInterval(() => {
      step += 1;
      updatingTitleRef.current = true;
      if (step % 2 === 1) {
        document.title = `🔔 (${countText}) ${flashTitle} · Thabaal`;
      } else {
        document.title = `(${countText}) ${base}`;
      }
      updatingTitleRef.current = false;
      if (step >= 8) {
        clearInterval(timer);
        setFlashTitle(null);
      }
    }, 1200);
    return () => clearInterval(timer);
  }, [flashTitle, unreadCount]);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
    setUnreadCount(0);
    setToasts([]);
    setFlashTitle(null);
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
                "pointer-events-auto flex items-start gap-3 rounded-card border bg-panel p-3.5 shadow-pop animate-toast",
                toast.urgent ? "border-warning-border border-l-4 border-l-warning-solid" : "border-line"
              )}
            >
              <KindIcon type={toast.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-ink">{toast.title}</p>
                  <span className="shrink-0 text-2xs text-muted">{timeAgo(toast.timestamp)}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted">{toast.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={toast.href}
                    onClick={() => dismissToast(toast.id)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-control bg-brand px-2.5 text-xs font-semibold text-white transition hover:bg-brand-deep active:scale-95 sm:min-h-7"
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
        "relative grid size-11 place-items-center rounded-control transition active:scale-95 sm:pointer-fine:size-9",
        dark
          ? "text-white/80 hover:bg-white/10 hover:text-white"
          : "text-ink-2 hover:bg-sunken hover:text-ink",
        className
      )}
    >
      <Bell className="size-5 shrink-0" />
      {unreadCount > 0 && (
        <span
          className={cn(
            "tabular absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full px-1 text-2xs font-semibold ring-2",
            dark
              ? "bg-glow text-night ring-night"
              : "bg-danger-solid text-white ring-panel"
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
                  "min-h-11 rounded-full border px-3 text-xs font-medium transition sm:min-h-7",
                  filter === t.id
                    ? "border-ink bg-ink text-white"
                    : "border-line-2 bg-panel text-ink-2 hover:border-line-strong hover:text-ink"
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
            <Bell aria-hidden className="mx-auto mb-2 size-8 text-faint" />
            <p className="font-medium text-ink">No notifications</p>
            <p className="text-xs text-muted">Nothing to see in this category right now.</p>
          </div>
        ) : (
          <ul className="thin-scroll -mx-1 max-h-[60vh] space-y-1 overflow-y-auto px-1">
            {filtered.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => setOpenSheet(false)}
                  className={cn(
                    "flex items-start gap-3 rounded-control border p-3 transition hover:bg-subtle active:bg-sunken",
                    item.unread ? "border-line bg-panel" : "border-transparent"
                  )}
                >
                  <KindIcon type={item.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn("truncate text-sm text-ink", item.unread ? "font-semibold" : "font-medium")}>
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
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand">
                      <span className="sr-only">Unread</span>
                    </span>
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
