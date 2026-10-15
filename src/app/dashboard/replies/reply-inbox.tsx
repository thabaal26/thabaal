"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, CheckCircle2, MessageCircle, MoreHorizontal, Phone, RotateCcw, RotateCw, ShoppingBag } from "@/components/icons";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { sendCatalogue } from "../actions/catalog";
import { setOrderStatus } from "../actions/orders";
import { setReplyHandled } from "../actions/replies";
import { InlineReplyBox } from "./inline-reply-box";
import { ChatList, type ChatListItem } from "./chat-list";

export type InboxReply = {
  id: string;
  text: string;
  kind: string;
  handled: boolean;
  receivedAt: Date;
  mediaId: string | null;
  mediaType: string | null;
  openCount?: number;
  totalCount?: number;
  hasButtonTap?: boolean;
  hasOrderInquiry?: boolean;
  customer: {
    id: string;
    name: string;
    phone: string;
    purchases: string | null;
    client: { name: string };
    orders?: { id: string; number: number; ref: string | null; total: number; currency: string }[];
  };
  sender: { label: string } | null;
};

const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const orderRef = (o: { number: number; ref?: string | null }) => o.ref ?? `RG-${o.number}`;

function replyWindowEnd(lastReplyAt: Date | undefined) {
  if (!lastReplyAt) return null;
  const end = new Date(new Date(lastReplyAt).getTime() + 24 * 3_600_000);
  return end.getTime() > Date.now() ? end : null;
}

/** Formats preview text for message snippets in chat list. */
const preview = (r: InboxReply) =>
  r.text ||
  (r.mediaType === "image" ? "📷 Photo" : r.mediaType === "audio" ? "🎤 Voice note" : r.mediaType === "video" ? "📹 Video" : r.mediaType === "sticker" ? "Sticker" : r.mediaType ? "📄 File" : "Message");

/** Formats window remaining hours and minutes for WhatsApp 24h pill. */
function formatWindowPill(lastReplyAt: Date | undefined) {
  const end = replyWindowEnd(lastReplyAt);
  if (!end) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

/** Live countdown hook that ticks every 30 seconds for accurate WhatsApp window display. */
function useWindowCountdown(lastInboundAt: Date | undefined) {
  const [pill, setPill] = useState(() => formatWindowPill(lastInboundAt));
  useEffect(() => {
    setPill(formatWindowPill(lastInboundAt));
    const timer = setInterval(() => {
      setPill(formatWindowPill(lastInboundAt));
    }, 30000);
    return () => clearInterval(timer);
  }, [lastInboundAt]);
  return pill;
}

/** Formats purchase frequency (e.g., "bought 3 times"). */
function formatPurchasesCount(p: string | null | undefined): string {
  if (!p) return "New customer";
  const count = (p.match(/,/g) || []).length + 1;
  return `bought ${count} time${count === 1 ? "" : "s"}`;
}

export function ReplyInbox({
  replies,
  selectedId,
  thread,
  show,
  canOperate,
  showClient,
}: {
  replies: InboxReply[];
  selectedId?: string;
  thread: ConversationEntry[];
  show: string;
  canOperate: boolean;
  showClient: boolean;
}) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("chat");

  const selected = replies.find((x) => x.id === selectedId || x.customer.id === selectedId) ?? replies[0];
  const latestInboundAt = thread.find((e) => e.type === "in")?.at ?? selected?.receivedAt;
  const windowTimeRemaining = useWindowCountdown(latestInboundAt);
  const windowOpen = Boolean(windowTimeRemaining);
  const hrefFor = (customerId: string) => `/dashboard/replies?${new URLSearchParams({ ...(show && { show: String(show) }), r: customerId })}`;
  const unpaidOrder = (r: InboxReply) => r.customer.orders?.[0] ?? null;

  const currentUnpaid = selected ? unpaidOrder(selected) : null;
  const currentPurchasesSubtitle = selected
    ? currentUnpaid
      ? `Unpaid ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · ${formatPurchasesCount(selected.customer.purchases)}`
      : `${formatPhone(selected.customer.phone)} · ${formatPurchasesCount(selected.customer.purchases)}`
    : "";

  // 1-Click Refresh Function
  const refreshChats = () => {
    setIsSyncing(true);
    router.refresh();
    setTimeout(() => setIsSyncing(false), 800);
  };

  // Smart background live polling: refreshes every 6 seconds when tab is active and operator is not typing
  useEffect(() => {
    let mounted = true;
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden" || isTyping) return;
      setIsSyncing(true);
      router.refresh();
      setTimeout(() => {
        if (mounted) setIsSyncing(false);
      }, 800);
    }, 6000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !isTyping) {
        refreshChats();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isTyping, router]);

  // Prepare serializable list items for the client ChatList component
  const chatListItems: ChatListItem[] = replies.map((r) => {
    const uo = unpaidOrder(r);
    return {
      id: r.id,
      customerId: r.customer.id,
      name: r.customer.name,
      phone: r.customer.phone,
      timeStr: fmtDate(r.receivedAt, "h:mm a"),
      previewText: preview(r),
      isButton: r.kind === "button",
      openCount: r.openCount ?? (r.handled ? 0 : 1),
      handled: r.handled,
      unpaidLabel: uo ? `Unpaid ${money(uo.total, uo.currency)}` : null,
      href: hrefFor(r.customer.id),
    };
  });

  const card = "min-h-0 overflow-hidden rounded-[20px] border-[1.5px] border-line bg-panel shadow-card";
  const headBtn = "inline-flex min-h-10 items-center gap-1.5 rounded-xl border-[1.5px] border-line bg-panel px-4 text-[14px] font-semibold text-ink transition hover:border-ink";
  const menuItem = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-ink transition hover:bg-sunken";

  return (
    <div className="grid gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(18rem,25rem)_minmax(0,1fr)] lg:grid-rows-1">
      {/* Left Chat List Card */}
      <div className={cn(card, mobileView === "chat" ? "hidden lg:flex" : "flex", "flex-col max-h-[75dvh] lg:max-h-none")}>
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5 bg-subtle/30">
          <span className="text-xs font-bold uppercase tracking-wider text-muted">Chats ({replies.length})</span>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className={cn("size-1.5 rounded-full bg-emerald-500", isSyncing ? "animate-ping" : "animate-pulse")} />
              {isSyncing ? "Syncing…" : "Live"}
            </span>
            <button
              type="button"
              onClick={refreshChats}
              disabled={isSyncing}
              title="Refresh chats"
              className="inline-flex size-7 items-center justify-center rounded-lg border border-line bg-panel text-muted hover:border-ink hover:text-ink transition"
            >
              <RotateCw className={cn("size-3", isSyncing && "animate-spin text-brand")} />
            </button>
          </div>
        </div>
        <ChatList
          items={chatListItems}
          selectedCustomerId={selected?.customer.id}
          onSelectCustomer={() => setMobileView("chat")}
        />
      </div>

      {/* Right Conversation Card */}
      {selected ? (
        <section aria-label={`Conversation with ${selected.customer.name}`} className={cn(card, mobileView === "list" ? "hidden lg:flex" : "flex", "flex-col")}>
          <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
            <div className="min-w-0 flex items-start gap-2.5">
              <button
                type="button"
                onClick={() => setMobileView("list")}
                className="lg:hidden mt-0.5 inline-flex items-center gap-1 rounded-xl border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-ink hover:border-ink"
              >
                <ArrowLeft aria-hidden className="size-3.5" /> All Chats
              </button>
              <div>
                <h2 className="truncate font-display text-[21px] font-semibold leading-tight text-ink">{selected.customer.name}</h2>
                <p className="mt-1 truncate text-[14.5px] text-muted">{currentPurchasesSubtitle}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {windowTimeRemaining ? (
                <span className="inline-flex items-center rounded-full bg-success-bg px-3 py-1 text-[13.5px] font-semibold text-success">Free replies · {windowTimeRemaining}</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-warning-bg px-3 py-1 text-[13.5px] font-semibold text-warning">Free replies closed</span>
              )}
              <Link href={`/dashboard/customers/${selected.customer.id}`} className={headBtn}>
                Profile
              </Link>
              <Link href={`/dashboard/customers/${selected.customer.id}#call`} className={headBtn}>
                <Phone aria-hidden className="size-4" /> Call
              </Link>
              {canOperate && (
                <details className="relative">
                  <summary className={cn(headBtn, "cursor-pointer list-none px-3 [&::-webkit-details-marker]:hidden")} aria-label="More actions">
                    <MoreHorizontal aria-hidden className="size-4" />
                  </summary>
                  <div className="absolute right-0 top-full z-20 mt-2 w-60 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                    <ActionButton action={setReplyHandled.bind(null, selected.id, !selected.handled)} variant="ghost" size="sm" className={menuItem}>
                      {selected.handled ? <RotateCcw aria-hidden className="size-4 text-muted" /> : <CheckCheck aria-hidden className="size-4 text-success" />}
                      {selected.handled ? "Reopen chat" : "Mark as handled"}
                    </ActionButton>
                    {windowOpen && (
                      <ActionButton action={sendCatalogue.bind(null, selected.customer.id)} variant="ghost" size="sm" className={menuItem}>
                        <ShoppingBag aria-hidden className="size-4 text-brand-deep" /> Send catalogue
                      </ActionButton>
                    )}
                    <Link href={`/dashboard/customers/${selected.customer.id}#reply`} className={menuItem}>
                      <MessageCircle aria-hidden className="size-4 text-muted" /> Send a template
                    </Link>
                    {currentUnpaid && (
                      <ActionButton
                        action={setOrderStatus.bind(null, currentUnpaid.id, "PAID")}
                        variant="ghost"
                        size="sm"
                        confirm={`Mark order ${orderRef(currentUnpaid)} as paid (${money(currentUnpaid.total, currentUnpaid.currency)})?`}
                        className={menuItem}
                      >
                        <CheckCircle2 aria-hidden className="size-4 text-success" /> Mark {orderRef(currentUnpaid)} paid
                      </ActionButton>
                    )}
                  </div>
                </details>
              )}
            </div>
          </header>

          {/* The messages sit in a soft beige panel inside the card. */}
          <div className="mx-5 flex h-[55dvh] min-h-0 flex-col overflow-hidden rounded-2xl bg-track lg:h-auto lg:flex-1">
            <Conversation entries={thread} plain className="min-h-0 flex-1" />
          </div>

          {canOperate ? (
            <div className="shrink-0">
              <InlineReplyBox
                key={selected.customer.id}
                customerId={selected.customer.id}
                customerName={selected.customer.name}
                replyId={selected.id}
                replyHandled={selected.handled}
                windowOpen={windowOpen}
                onTypingChange={setIsTyping}
              />
            </div>
          ) : (
            <div className="h-5 shrink-0" />
          )}
        </section>
      ) : (
        <div className={cn(card, "grid place-items-center p-8 text-center text-sm text-muted")}>Pick a chat on the left to open it.</div>
      )}
    </div>
  );
}
