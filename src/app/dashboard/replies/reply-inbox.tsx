"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, CheckCircle2, Phone, RotateCcw, RotateCw, ShoppingBag } from "@/components/icons";
import Link from "@/components/intent-link";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { sendCatalogue } from "../actions/catalog";
import { setOrderStatus } from "../actions/orders";
import { setReplyHandled } from "../actions/replies";
import { InlineReplyBox } from "./inline-reply-box";
import { ChatList, type ChatListItem } from "./chat-list";
import { PAction } from "../portal-ui";

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
  const [prevInbound, setPrevInbound] = useState(lastInboundAt);
  const [pill, setPill] = useState(() => formatWindowPill(lastInboundAt));

  if (lastInboundAt !== prevInbound) {
    setPrevInbound(lastInboundAt);
    setPill(formatWindowPill(lastInboundAt));
  }

  useEffect(() => {
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

  return (
    <div className="convo">
      {/* Left: the chat list */}
      <div className={cn("card", mobileView === "chat" && "hide-sm")} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 15rem)", minHeight: 420 }}>
        <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <span className="grow muted small" style={{ fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", minWidth: 0 }}>
            Chats ({replies.length})
          </span>
          <span className="pill ok" title="The list refreshes on its own every few seconds">
            {isSyncing ? "Syncing…" : "Live"}
          </span>
          <button type="button" className="btn sm ghost" onClick={refreshChats} disabled={isSyncing} aria-label="Refresh chats" title="Refresh chats">
            <RotateCw aria-hidden className="ic" style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <ChatList items={chatListItems} selectedCustomerId={selected?.customer.id} onSelectCustomer={() => setMobileView("chat")} />
      </div>

      {/* Right: the open conversation */}
      {selected ? (
        <section aria-label={`Conversation with ${selected.customer.name}`} className={cn("card", mobileView === "list" && "hide-sm")}>
          <div className="hd">
            <div>
              <button type="button" className="btn sm show-sm" onClick={() => setMobileView("list")} style={{ marginBottom: 8 }}>
                <ArrowLeft aria-hidden className="ic" style={{ width: 15, height: 15 }} /> All chats
              </button>
              <h2>{selected.customer.name}</h2>
              <p>{currentPurchasesSubtitle}</p>
            </div>
            <div className="tools">
              {windowTimeRemaining ? <span className="pill ok">Free replies · {windowTimeRemaining}</span> : <span className="pill warn">Free replies closed</span>}
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}`}>
                Profile
              </Link>
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}#call`}>
                <Phone aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Call
              </Link>
            </div>
          </div>

          <div className="phone" style={{ display: "flex", flexDirection: "column", height: "min(55dvh, 520px)", minHeight: 220, padding: 0, overflow: "hidden" }}>
            <Conversation entries={thread} plain className="min-h-0 flex-1" />
          </div>

          {canOperate ? (
            <InlineReplyBox
              key={selected.customer.id}
              customerId={selected.customer.id}
              customerName={selected.customer.name}
              replyId={selected.id}
              replyHandled={selected.handled}
              windowOpen={windowOpen}
              onTypingChange={setIsTyping}
              more={
                <>
                  <PAction action={setReplyHandled.bind(null, selected.id, !selected.handled)}>
                    {selected.handled ? (
                      <>
                        <RotateCcw aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Reopen chat
                      </>
                    ) : (
                      <>
                        <CheckCheck aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Mark handled
                      </>
                    )}
                  </PAction>
                  {currentUnpaid && (
                    <PAction
                      action={setOrderStatus.bind(null, currentUnpaid.id, "PAID")}
                      confirm={`Mark order ${orderRef(currentUnpaid)} as paid (${money(currentUnpaid.total, currentUnpaid.currency)})?`}
                    >
                      <CheckCircle2 aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Mark order paid
                    </PAction>
                  )}
                  {windowOpen && (
                    <PAction action={sendCatalogue.bind(null, selected.customer.id)}>
                      <ShoppingBag aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Send catalogue
                    </PAction>
                  )}
                </>
              }
            />
          ) : null}
        </section>
      ) : (
        <div className="card muted" style={{ display: "grid", placeItems: "center" }}>
          Pick a chat on the left to open it.
        </div>
      )}
    </div>
  );
}
