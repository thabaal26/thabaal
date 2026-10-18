"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, CheckCircle2, Phone, RotateCcw, RotateCw, ShoppingBag } from "@/components/icons";
import Link from "@/components/intent-link";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { sendCatalogue } from "../actions/catalog";
import { setReplyHandled } from "../actions/replies";
import { InlineReplyBox } from "./inline-reply-box";
import { ChatList, type ChatListItem } from "./chat-list";
import { PAction } from "../portal-ui";
import { RecordPaymentSheet } from "../orders/payment-ui";
import { paymentRef } from "@/lib/plain-error";
import { useLanguage } from "@/lib/i18n/context";

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
    orders?: {
      id: string;
      number: number;
      ref: string | null;
      total: number;
      currency: string;
      paymentClaimedAt?: Date | string | null;
      paidAmount?: number | null;
      paymentMethod?: string | null;
      paymentTxnId?: string | null;
    }[];
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
const preview = (r: InboxReply, isTamil = false) =>
  r.text ||
  (r.mediaType === "image"
    ? (isTamil ? "📷 புகைப்படம்" : "📷 Photo")
    : r.mediaType === "audio"
    ? (isTamil ? "🎤 குரல் பதிவு" : "🎤 Voice note")
    : r.mediaType === "video"
    ? (isTamil ? "📹 வீடியோ" : "📹 Video")
    : r.mediaType === "sticker"
    ? (isTamil ? "ஸ்டிக்கர்" : "Sticker")
    : r.mediaType
    ? (isTamil ? "📄 கோப்பு" : "📄 File")
    : (isTamil ? "செய்தி" : "Message"));

/** Formats window remaining hours and minutes for WhatsApp 24h pill. */
function formatWindowPill(lastReplyAt: Date | undefined, isTamil = false) {
  const end = replyWindowEnd(lastReplyAt);
  if (!end) return null;
  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3600000);
  const mins = Math.floor((diffMs % 3600000) / 60000);
  if (isTamil) {
    return hours > 0 ? `${hours} மணி ${mins} நிமிடம்` : `${mins} நிமிடம்`;
  }
  return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
}

/** Live countdown hook that ticks every 30 seconds for accurate WhatsApp window display. */
// The minutes left are only worked out in the browser: computed during the server render too, they could differ
// by a minute from the browser's first render and break hydration (React error 418).
function useWindowCountdown(lastInboundAt: Date | undefined, isTamil = false) {
  const [pill, setPill] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setPill(formatWindowPill(lastInboundAt, isTamil));
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [lastInboundAt, isTamil]);
  return pill;
}

/** Formats purchase frequency (e.g., "bought 3 times"). */
function formatPurchasesCount(p: string | null | undefined, isTamil = false): string {
  if (!p) return isTamil ? "புதிய வாடிக்கையாளர்" : "New customer";
  const count = (p.match(/,/g) || []).length + 1;
  return isTamil ? `${count} முறை வாங்கியுள்ளார்` : `bought ${count} time${count === 1 ? "" : "s"}`;
}

export function ReplyInbox({
  replies,
  selectedId,
  thread,
  show,
  canOperate,
}: {
  replies: InboxReply[];
  selectedId?: string;
  thread: ConversationEntry[];
  show: string;
  canOperate: boolean;
  showClient?: boolean;
}) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("chat");
  const [paying, setPaying] = useState(false);

  const selected = replies.find((x) => x.id === selectedId || x.customer.id === selectedId) ?? replies[0];
  const latestInboundAt = thread.find((e) => e.type === "in")?.at ?? selected?.receivedAt;
  const windowTimeRemaining = useWindowCountdown(latestInboundAt, isTamil);
  const windowOpen = Boolean(replyWindowEnd(latestInboundAt));
  const hrefFor = (customerId: string) => `/dashboard/replies?${new URLSearchParams({ ...(show && { show: String(show) }), r: customerId })}`;
  const unpaidOrder = (r: InboxReply) => r.customer.orders?.[0] ?? null;

  const currentUnpaid = selected ? unpaidOrder(selected) : null;
  // The customer says they paid, or WhatsApp showed a payment bubble Meta can't read: say so right in the chat.
  const claimed = Boolean(currentUnpaid?.paymentClaimedAt);
  const currentPurchasesSubtitle = selected
    ? currentUnpaid && claimed
      ? isTamil
        ? `பணம் செலுத்தியதாகக் கூறுகிறார் ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · UPI-ல் சரிபார்க்கவும்`
        : `Says paid ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · check your UPI app, then confirm`
      : currentUnpaid
      ? isTamil
        ? `நிலுவை ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · ${formatPurchasesCount(selected.customer.purchases, isTamil)}`
        : `Unpaid ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · ${formatPurchasesCount(selected.customer.purchases)}`
      : `${formatPhone(selected.customer.phone)} · ${formatPurchasesCount(selected.customer.purchases, isTamil)}`
    : "";

  // 1-Click Refresh Function
  const refreshChats = useCallback(() => {
    setIsSyncing(true);
    router.refresh();
    setTimeout(() => setIsSyncing(false), 800);
  }, [router]);

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
  }, [isTyping, refreshChats, router]);

  // Prepare serializable list items for the client ChatList component
  const chatListItems: ChatListItem[] = replies.map((r) => {
    const uo = unpaidOrder(r);
    return {
      id: r.id,
      customerId: r.customer.id,
      name: r.customer.name,
      phone: r.customer.phone,
      timeStr: fmtDate(r.receivedAt, "h:mm a"),
      previewText: preview(r, isTamil),
      isButton: r.kind === "button",
      openCount: r.openCount ?? (r.handled ? 0 : 1),
      handled: r.handled,
      unpaidLabel: uo ? (isTamil ? `நிலுவை ${money(uo.total, uo.currency)}` : `Unpaid ${money(uo.total, uo.currency)}`) : null,
      href: hrefFor(r.customer.id),
    };
  });

  return (
    <div className="convo">
      {/* Left: the chat list */}
      <div className={cn("card", mobileView === "chat" && "hide-sm")} style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - 15rem)", minHeight: 420 }}>
        <div className="row" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
          <span className="grow muted small" style={{ fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", minWidth: 0 }}>
            {isTamil ? `உரையாடல்கள் (${replies.length})` : `Chats (${replies.length})`}
          </span>
          <span className="pill ok" title={isTamil ? "பட்டியல் சில வினாடிகளுக்கு ஒருமுறை தானாக புதுப்பிக்கப்படும்" : "The list refreshes on its own every few seconds"}>
            {isSyncing ? (isTamil ? "இணைக்கிறது…" : "Syncing…") : (isTamil ? "நேரலை" : "Live")}
          </span>
          <button type="button" className="btn sm ghost" onClick={refreshChats} disabled={isSyncing} aria-label={isTamil ? "புதுப்பிக்க" : "Refresh chats"} title={isTamil ? "புதுப்பிக்க" : "Refresh chats"}>
            <RotateCw aria-hidden className="ic" style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <ChatList items={chatListItems} selectedCustomerId={selected?.customer.id} onSelectCustomer={() => setMobileView("chat")} />
      </div>

      {/* Right: the open conversation */}
      {selected ? (
        <section aria-label={isTamil ? `${selected.customer.name} உடனான உரையாடல்` : `Conversation with ${selected.customer.name}`} className={cn("card", mobileView === "list" && "hide-sm")}>
          <div className="hd">
            <div>
              <button type="button" className="btn sm show-sm" onClick={() => setMobileView("list")} style={{ marginBottom: 8 }}>
                <ArrowLeft aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTamil ? "அனைத்து உரையாடல்கள்" : "All chats"}
              </button>
              <h2 data-data>{selected.customer.name}</h2>
              <p>{currentPurchasesSubtitle}</p>
            </div>
            <div className="tools">
              {windowOpen ? (
                <span className="pill ok">
                  {isTamil ? "இலவச பதில்" : "Free replies"}
                  {windowTimeRemaining ? ` · ${windowTimeRemaining}` : ""}
                </span>
              ) : (
                <span className="pill warn">{isTamil ? "இலவச பதில் நேரம் முடிந்தது" : "Free replies closed"}</span>
              )}
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}`}>
                {isTamil ? "விவரக்குறிப்பு" : "Profile"}
              </Link>
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}#call`}>
                <Phone aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTamil ? "அழைக்க" : "Call"}
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
                        <RotateCcw aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTamil ? "மீண்டும் திற" : "Reopen chat"}
                      </>
                    ) : (
                      <>
                        <CheckCheck aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTamil ? "பார்த்ததாகக் குறி" : "Mark handled"}
                      </>
                    )}
                  </PAction>
                  {currentUnpaid && (
                    // Opens Record payment: amount, how, and the UPI reference (UTR) from the UPI app, which
                    // WhatsApp's UPI mode never sends. The customer gets "Payment received" and a thank-you.
                    <button type="button" className={`btn sm${claimed ? " primary" : ""}`} onClick={() => setPaying(true)} title={`${orderRef(currentUnpaid)} · ${money(currentUnpaid.total, currentUnpaid.currency)}`}>
                      <CheckCircle2 aria-hidden className="ic" style={{ width: 15, height: 15 }} />{" "}
                      {claimed ? (isTamil ? "பணம் வந்தது, உறுதிசெய்" : "Payment received: confirm") : isTamil ? "ஆர்டருக்கு பணம் வந்தது" : "Mark order paid"}
                    </button>
                  )}
                  {windowOpen && (
                    <PAction action={sendCatalogue.bind(null, selected.customer.id)}>
                      <ShoppingBag aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTamil ? "பொருட்கள் பட்டியல் அனுப்பு" : "Send catalogue"}
                    </PAction>
                  )}
                </>
              }
            />
          ) : null}
        </section>
      ) : (
        <div className="card muted" style={{ display: "grid", placeItems: "center" }}>
          {isTamil ? "திறக்க இடதுபுறத்தில் உள்ள உரையாடலைத் தேர்வு செய்யவும்." : "Pick a chat on the left to open it."}
        </div>
      )}
      {paying && currentUnpaid && selected && (
        <RecordPaymentSheet
          open
          onClose={() => setPaying(false)}
          id={currentUnpaid.id}
          who={selected.customer.name}
          due={Math.max(0, currentUnpaid.total - (currentUnpaid.paidAmount ?? 0))}
          received={currentUnpaid.paidAmount ?? 0}
          cod={currentUnpaid.paymentMethod === "cod"}
          reference={paymentRef(currentUnpaid.paymentTxnId)}
        />
      )}
    </div>
  );
}
