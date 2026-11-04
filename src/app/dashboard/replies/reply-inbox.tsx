"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  Info,
  MessageCircle,
  MoreVertical,
  PauseCircle,
  Phone,
  Play,
  ReceiptText,
  RotateCcw,
  RotateCw,
  ShoppingBag,
  User,
  X,
} from "@/components/icons";
import Link from "@/components/intent-link";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { sendCatalogue } from "../actions/catalog";
import { handleAllReplies, setReplyHandled } from "../actions/replies";
import { pauseChatReplies, resumeChatReplies } from "../actions/automation";
import { InlineReplyBox } from "./inline-reply-box";
import { Avatar, ChatList, type ChatListItem } from "./chat-list";
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
  /** Our message's status, on a chat we started (kind "sent"). */
  sentStatus?: string | null;
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

/** What the contact info panel shows about the open chat's customer. */
export type ChatProfile = {
  tags: string[];
  location: string | null;
  since: Date;
  optedOut: boolean;
  unreachable: boolean;
  orderCount: number;
  orders: { id: string; number: number; ref: string | null; total: number; currency: string; status: string; createdAt: Date }[];
  /** Automatic replies off for this chat (lib/engine/conversation.ts): paused by staff, or quiet after a staff reply. */
  automation: { paused: boolean; until: Date | null; reason: "paused" | "staff-typing" | null };
};

export type ChatFilter = { key: string; label: string; labelTa: string; count: number };

const money = (n: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const orderRef = (o: { number: number; ref?: string | null }) => o.ref ?? `RG-${o.number}`;

const ORDER_STATUS: Record<string, [string, string]> = {
  NEW: ["New", "புதியது"],
  CONFIRMED: ["Confirmed", "உறுதி"],
  PAID: ["Paid", "செலுத்தப்பட்டது"],
  DISPATCHED: ["Sent out", "அனுப்பப்பட்டது"],
  DELIVERED: ["Delivered", "டெலிவரி ஆனது"],
  CANCELLED: ["Cancelled", "ரத்து"],
};

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

/** Closes a popup menu on Escape or a click outside it. */
function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close, ref]);
}

const ic = { width: 17, height: 17 };

/**
 * Chats in WhatsApp's own layout: the chat list on the left, the open chat beside it (header, bubbles on the
 * wallpaper, composer at the bottom), and the contact info panel on the right. On phones the list comes first
 * and a chat opens full screen with a back arrow.
 */
export function ReplyInbox({
  replies,
  selectedId,
  thread,
  profile,
  total,
  group = "",
  groups = null,
  openCount,
  opened,
  canOperate,
}: {
  replies: InboxReply[];
  selectedId?: string;
  thread: ConversationEntry[];
  profile?: ChatProfile | null;
  /** Every chat, for the "All" chip. */
  total: number;
  /** The picked engagement group (super | active | inactive), and each group's chats; null before any campaign. */
  group?: string;
  groups?: ChatFilter[] | null;
  /** Customers still waiting for an answer (for "Mark all handled"). */
  openCount: number;
  /** The address names a chat (?r=…): phones open it straight away instead of the list. */
  opened?: boolean;
  canOperate: boolean;
  showClient?: boolean;
}) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">(opened ? "chat" : "list");
  const [paying, setPaying] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const closeListMenu = useCallback(() => setListMenuOpen(false), []);
  useDismiss(menuOpen, closeMenu, menuRef);
  useDismiss(listMenuOpen, closeListMenu, listMenuRef);

  const selected = replies.find((x) => x.id === selectedId || x.customer.id === selectedId) ?? replies[0];
  // A chat we started (a campaign) has no message from them: no 24-hour window until they write.
  const latestInboundAt = thread.find((e) => e.type === "in")?.at ?? (selected?.kind === "sent" ? undefined : selected?.receivedAt);
  const windowTimeRemaining = useWindowCountdown(latestInboundAt, isTamil);
  const windowOpen = Boolean(replyWindowEnd(latestInboundAt));
  const listHref = (g: string) => (g ? `/dashboard/replies?group=${g}` : "/dashboard/replies");
  const hrefFor = (customerId: string) => `/dashboard/replies?${new URLSearchParams({ ...(group && { group }), r: customerId })}`;
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

  // Live updates: every 6 seconds (tab visible, nobody typing) ask /api/chats-live whether anything Chats shows changed,
  // and re-render only then. It used to rebuild the whole page every 6 seconds even when nothing had happened.
  const stampRef = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.visibilityState === "hidden" || isTyping) return;
      try {
        const res = await fetch("/api/chats-live", { cache: "no-store" });
        if (!res.ok || stop) return;
        const { v } = (await res.json()) as { v: string };
        if (stop || isTyping) return;
        if (stampRef.current !== null && v !== stampRef.current) refreshChats();
        stampRef.current = v;
      } catch {
        // offline for a moment: try again on the next tick
      }
    };
    void check();
    const interval = setInterval(check, 6000);
    // Coming back to the tab checks straight away.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isTyping, refreshChats]);

  // A phone shows the open chat full screen: the page behind it must not scroll.
  useEffect(() => {
    if (mobileView !== "chat" || !window.matchMedia("(max-width: 900px)").matches) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [mobileView]);

  // Escape closes the contact info panel.
  useEffect(() => {
    if (!infoOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !menuOpen && setInfoOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [infoOpen, menuOpen]);

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
      isSent: r.kind === "sent",
      sentStatus: r.sentStatus ?? null,
      openCount: r.openCount ?? (r.handled ? 0 : 1),
      handled: r.handled,
      unpaidLabel: uo ? (isTamil ? `நிலுவை ${money(uo.total, uo.currency)}` : `Unpaid ${money(uo.total, uo.currency)}`) : null,
      href: hrefFor(r.customer.id),
    };
  });

  // One row: All, then the groups the campaign form splits customers into (lib/engagement-segments.ts), each with
  // its live count; tapping the picked group again shows every chat. Before a first campaign there are no groups.
  const groupChips = groups && (
    <div className="wa-filters wa-groups" role="group" aria-label={isTamil ? "குழு வாரியாக" : "By group"} data-testid="chat-groups">
      <Link href={listHref("")} className="wa-f" data-group="all" aria-current={!group ? "true" : undefined} scroll={false}>
        {isTamil ? "அனைத்தும்" : "All"} <small>{fmtNumber(total)}</small>
      </Link>
      {groups.map((g) => (
        <Link
          key={g.key}
          href={listHref(group === g.key ? "" : g.key)}
          className="wa-f"
          data-group={g.key}
          aria-current={group === g.key ? "true" : undefined}
          scroll={false}
        >
          {isTamil ? g.labelTa : g.label} <small>{fmtNumber(g.count)}</small>
        </Link>
      ))}
    </div>
  );

  const createOrderHref = selected ? `/dashboard/orders?${new URLSearchParams({ new: "1", phone: selected.customer.phone })}` : "/dashboard/orders?new=1";
  const handledAction = selected ? (
    <PAction action={setReplyHandled.bind(null, selected.id, !selected.handled)} className="wa-qc">
      {selected.handled ? (
        <>
          <RotateCcw aria-hidden className="ic" style={ic} /> {isTamil ? "மீண்டும் திற" : "Reopen chat"}
        </>
      ) : (
        <>
          <CheckCheck aria-hidden className="ic" style={ic} /> {isTamil ? "பார்த்ததாகக் குறி" : "Mark handled"}
        </>
      )}
    </PAction>
  ) : null;
  const paidButton =
    currentUnpaid && canOperate ? (
      // Opens Record payment: amount, how, and the UPI reference (UTR) from the UPI app, which WhatsApp's UPI mode
      // never sends. The customer gets "Payment received" and a thank-you.
      <button type="button" className={cn("wa-qc", claimed && "on")} onClick={() => setPaying(true)} title={`${orderRef(currentUnpaid)} · ${money(currentUnpaid.total, currentUnpaid.currency)}`}>
        <CheckCircle2 aria-hidden className="ic" style={ic} />{" "}
        {claimed ? (isTamil ? "பணம் வந்தது, உறுதிசெய்" : "Payment received: confirm") : isTamil ? "ஆர்டருக்கு பணம் வந்தது" : "Mark order paid"}
      </button>
    ) : null;

  return (
    <div className={cn("wa-app", infoOpen && selected && "info")} data-view={mobileView}>
      {/* Left: the chat list */}
      <aside className="wa-list" aria-label={isTamil ? "உரையாடல் பட்டியல்" : "Chat list"}>
        <div className="wa-lh">
          <h2>{isTamil ? `உரையாடல்கள்` : `Chats`} <small className="muted" style={{ fontSize: 13, fontWeight: 600 }}>({fmtNumber(replies.length)})</small></h2>
          <span className="wa-live" data-busy={isSyncing} title={isTamil ? "பட்டியல் சில வினாடிகளுக்கு ஒருமுறை தானாக புதுப்பிக்கப்படும்" : "The list refreshes on its own every few seconds"}>
            <i aria-hidden /> {isSyncing ? (isTamil ? "இணைக்கிறது…" : "Syncing…") : isTamil ? "நேரலை" : "Live"}
          </span>
          <button type="button" className="wa-ib" onClick={refreshChats} disabled={isSyncing} aria-label={isTamil ? "புதுப்பிக்க" : "Refresh chats"} title={isTamil ? "புதுப்பிக்க" : "Refresh chats"}>
            <RotateCw aria-hidden className="ic" />
          </button>
          {canOperate && openCount > 0 && (
            <div ref={listMenuRef} style={{ position: "relative" }}>
              <button type="button" className="wa-ib" aria-label={isTamil ? "மேலும்" : "More chat list options"} aria-haspopup="menu" aria-expanded={listMenuOpen} onClick={() => setListMenuOpen((v) => !v)}>
                <MoreVertical aria-hidden className="ic" />
              </button>
              {/* Hidden, not removed, when closed: an action started from it keeps running after the menu closes. */}
              <div className="wa-menu" role="menu" hidden={!listMenuOpen} style={{ right: 0, top: "calc(100% + 4px)" }} onClick={() => setListMenuOpen(false)}>
                  <PAction action={handleAllReplies} className="wa-mi" confirm="Mark every open customer conversation as handled?">
                    <CheckCheck aria-hidden className="ic" /> {isTamil ? "அனைத்தையும் முடிந்ததாகக் குறி" : "Mark all handled"}
                  </PAction>
              </div>
            </div>
          )}
        </div>
        <ChatList items={chatListItems} selectedCustomerId={selected?.customer.id} onSelectCustomer={() => setMobileView("chat")} filters={groupChips || undefined} />
      </aside>

      {/* Middle: the open chat */}
      {selected ? (
        <section className="wa-chat" aria-label={isTamil ? `${selected.customer.name} உடனான உரையாடல்` : `Conversation with ${selected.customer.name}`}>
          <header className="wa-ch">
            <button type="button" className="wa-ib wa-back" onClick={() => setMobileView("list")} aria-label={isTamil ? "அனைத்து உரையாடல்கள்" : "All chats"}>
              <ArrowLeft aria-hidden className="ic" />
            </button>
            <button type="button" className="wa-who" onClick={() => setInfoOpen((v) => !v)} aria-expanded={infoOpen} title={isTamil ? "வாடிக்கையாளர் விவரம்" : "Contact info"}>
              <Avatar name={selected.customer.name} seed={selected.customer.id} size="sm" />
              <span>
                <h2 data-data>{selected.customer.name}</h2>
                <p className={claimed ? "claim" : undefined}>{currentPurchasesSubtitle}</p>
              </span>
            </button>
            {windowOpen ? (
              <span className="wa-win" title={isTamil ? "வாடிக்கையாளர் எழுதியதிலிருந்து 24 மணி நேரம் இலவசமாக பதிலளிக்கலாம்" : "You can reply free for 24 hours after the customer writes"}>
                {isTamil ? "இலவச பதில்" : "Free replies"}
                {windowTimeRemaining ? ` · ${windowTimeRemaining}` : ""}
              </span>
            ) : (
              <span className="wa-win closed">{isTamil ? "இலவச பதில் நேரம் முடிந்தது" : "Free replies closed"}</span>
            )}
            {profile?.automation.paused && (
              <span
                className="wa-auto"
                data-testid="auto-paused"
                title={
                  profile.automation.until
                    ? `${isTamil ? "தானியங்கி பதில்கள் நிறுத்தம்" : "Automatic replies off"} · ${fmtDate(profile.automation.until, "d MMM, h:mm a")}`
                    : isTamil ? "நீங்கள் மீண்டும் தொடங்கும் வரை" : "Until you resume them"
                }
              >
                {isTamil ? "தானியங்கி பதில் நிறுத்தம்" : "Auto replies paused"}
              </span>
            )}
            <Link className="wa-ib" href={`/dashboard/customers/${selected.customer.id}#call`} aria-label={isTamil ? "அழைக்க" : "Call"} title={isTamil ? "அழைக்க" : "Call"}>
              <Phone aria-hidden className="ic" />
            </Link>
            <div ref={menuRef} style={{ position: "static" }}>
              <button type="button" className="wa-ib" aria-label={isTamil ? "மேலும்" : "More chat options"} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                <MoreVertical aria-hidden className="ic" />
              </button>
              <div className="wa-menu" role="menu" hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
                  <button type="button" role="menuitem" onClick={() => setInfoOpen(true)}>
                    <Info aria-hidden className="ic" /> {isTamil ? "வாடிக்கையாளர் விவரம்" : "Contact info"}
                  </button>
                  <Link role="menuitem" href={`/dashboard/customers/${selected.customer.id}`}>
                    <User aria-hidden className="ic" /> {isTamil ? "விவரக்குறிப்பு" : "Profile"}
                  </Link>
                  {canOperate && (
                    <>
                      <hr />
                      <PAction action={setReplyHandled.bind(null, selected.id, !selected.handled)} className="wa-mi">
                        {selected.handled ? <RotateCcw aria-hidden className="ic" /> : <CheckCheck aria-hidden className="ic" />}{" "}
                        {selected.handled ? (isTamil ? "மீண்டும் திற" : "Reopen chat") : isTamil ? "பார்த்ததாகக் குறி" : "Mark handled"}
                      </PAction>
                      {profile?.automation.paused ? (
                        <PAction action={resumeChatReplies.bind(null, selected.customer.id)} className="wa-mi">
                          <Play aria-hidden className="ic" /> {isTamil ? "தானியங்கி பதில்களைத் தொடங்கு" : "Resume automatic replies"}
                        </PAction>
                      ) : (
                        <PAction action={pauseChatReplies.bind(null, selected.customer.id)} className="wa-mi">
                          <PauseCircle aria-hidden className="ic" /> {isTamil ? "தானியங்கி பதில்களை நிறுத்து" : "Pause automatic replies"}
                        </PAction>
                      )}
                      {windowOpen && (
                        <PAction action={sendCatalogue.bind(null, selected.customer.id)} className="wa-mi">
                          <ShoppingBag aria-hidden className="ic" /> {isTamil ? "பொருட்கள் பட்டியல் அனுப்பு" : "Send catalogue"}
                        </PAction>
                      )}
                      <Link role="menuitem" href={`/dashboard/customers/${selected.customer.id}#reply`}>
                        <MessageCircle aria-hidden className="ic" /> {isTamil ? "டெம்ப்ளேட் அனுப்பு" : "Send template"}
                      </Link>
                      <Link role="menuitem" href={createOrderHref}>
                        <ReceiptText aria-hidden className="ic" /> {isTamil ? "ஆர்டர் உருவாக்கு" : "Create order"}
                      </Link>
                    </>
                  )}
                  <hr />
                  <button type="button" role="menuitem" onClick={refreshChats}>
                    <RotateCw aria-hidden className="ic" /> {isTamil ? "புதுப்பிக்க" : "Refresh"}
                  </button>
              </div>
            </div>
          </header>

          <div className="wa-body">
            <Conversation entries={thread} plain skin="wa" className="min-h-0 flex-1" />
          </div>

          {canOperate ? (
            <InlineReplyBox
              key={selected.customer.id}
              customerId={selected.customer.id}
              replyId={selected.id}
              replyHandled={selected.handled}
              windowOpen={windowOpen}
              windowLeft={windowTimeRemaining}
              createOrderHref={createOrderHref}
              onTypingChange={setIsTyping}
              actions={
                <>
                  {windowOpen && (
                    <PAction action={sendCatalogue.bind(null, selected.customer.id)} className="wa-qc" title={isTamil ? "பொருட்கள் பட்டியலை வாடிக்கையாளருக்கு அனுப்பும்" : "Sends your product list to the customer"}>
                      <ShoppingBag aria-hidden className="ic" style={ic} /> {isTamil ? "பொருட்கள் அனுப்பு" : "Send products"}
                    </PAction>
                  )}
                  {handledAction}
                </>
              }
            />
          ) : null}
        </section>
      ) : (
        <section className="wa-chat" aria-label={isTamil ? "உரையாடல்" : "Conversation"}>
          <div className="wa-body">
            <div className="wa-pick">
              <div>
                <b>{group ? (isTamil ? "இந்தக் குழுவில் உரையாடல் இல்லை" : "No chats in this group") : isTamil ? "இன்னும் பதில்கள் இல்லை" : "No replies yet"}</b>
                {isTamil
                  ? "வாடிக்கையாளர்கள் பதில் எழுதும்போது அல்லது பட்டனைத் தட்டும்போது, அவர்களின் உரையாடல் இங்கே வரும்."
                  : "When customers tap “Order now” or write back after a campaign, each customer’s conversation appears here."}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Right: contact info */}
      {infoOpen && selected && (
        <aside className="wa-info" aria-label={isTamil ? "வாடிக்கையாளர் விவரம்" : "Contact info"}>
          <header>
            <button type="button" className="wa-ib" onClick={() => setInfoOpen(false)} aria-label={isTamil ? "மூடு" : "Close contact info"}>
              <X aria-hidden className="ic" />
            </button>
            <h2>{isTamil ? "வாடிக்கையாளர் விவரம்" : "Contact info"}</h2>
          </header>
          <div className="wa-hero">
            <Avatar name={selected.customer.name} seed={selected.customer.id} size="lg" />
            <h3 data-data>{selected.customer.name}</h3>
            <p>{formatPhone(selected.customer.phone)}</p>
            <p>{formatPurchasesCount(selected.customer.purchases, isTamil)}</p>
            <div className="acts">
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}`}>
                <User aria-hidden className="ic" style={ic} /> {isTamil ? "விவரக்குறிப்பு" : "Profile"}
              </Link>
              <Link className="btn sm" href={`/dashboard/customers/${selected.customer.id}#call`}>
                <Phone aria-hidden className="ic" style={ic} /> {isTamil ? "அழைக்க" : "Call"}
              </Link>
              {canOperate && (
                <Link className="btn sm" href={createOrderHref}>
                  <ReceiptText aria-hidden className="ic" style={ic} /> {isTamil ? "ஆர்டர்" : "Order"}
                </Link>
              )}
            </div>
          </div>
          {currentUnpaid && (
            <div className="wa-sec">
              <h4>{isTamil ? "நிலுவை ஆர்டர்" : "Unpaid order"}</h4>
              <ul>
                <li>
                  <span>{orderRef(currentUnpaid)}</span>
                  <b>{money(Math.max(0, currentUnpaid.total - (currentUnpaid.paidAmount ?? 0)), currentUnpaid.currency)}</b>
                </li>
              </ul>
              {paidButton && <div style={{ marginTop: 10 }}>{paidButton}</div>}
            </div>
          )}
          {profile && (
            <>
              <div className="wa-sec">
                <h4>{isTamil ? "விவரம்" : "About"}</h4>
                <dl>
                  {profile.location && (
                    <>
                      <dt>{isTamil ? "பகுதி" : "Area"}</dt>
                      <dd>{profile.location}</dd>
                    </>
                  )}
                  <dt>{isTamil ? "ஆர்டர்கள்" : "Orders"}</dt>
                  <dd>{fmtNumber(profile.orderCount)}</dd>
                  <dt>{isTamil ? "சேர்ந்தது" : "Customer since"}</dt>
                  <dd>{fmtDate(profile.since, "d MMM yyyy")}</dd>
                  {(profile.optedOut || profile.unreachable) && (
                    <>
                      <dt>{isTamil ? "செய்திகள்" : "Offers"}</dt>
                      <dd style={{ color: "var(--bad)" }}>
                        {profile.optedOut ? (isTamil ? "வேண்டாம் என்றார்" : "Opted out") : isTamil ? "WhatsApp-ல் பெற முடியாது" : "Can't receive on WhatsApp"}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
              {profile.tags.length > 0 && (
                <div className="wa-sec">
                  <h4>{isTamil ? "குறிச்சொற்கள்" : "Tags"}</h4>
                  <div className="wa-tags">
                    {profile.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.orders.length > 0 && (
                <div className="wa-sec">
                  <h4>{isTamil ? "சமீபத்திய ஆர்டர்கள்" : "Latest orders"}</h4>
                  <ul>
                    {profile.orders.map((o) => (
                      <li key={o.id}>
                        <span>
                          {orderRef(o)} · <span className="muted">{fmtDate(o.createdAt, "d MMM")}</span>
                        </span>
                        <span>
                          {money(o.total, o.currency)} · <span className="muted">{(ORDER_STATUS[o.status] ?? [o.status, o.status])[isTamil ? 1 : 0]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {selected.customer.purchases && (
            <div className="wa-sec">
              <h4>{isTamil ? "வாங்கியவை" : "Bought before"}</h4>
              <p style={{ fontSize: 14 }}>{selected.customer.purchases}</p>
            </div>
          )}
          <CampaignSummary thread={thread} isTamil={isTamil} />
        </aside>
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

/** Offers this customer got lately (from the messages shown), and how many they read. */
function CampaignSummary({ thread, isTamil }: { thread: ConversationEntry[]; isTamil: boolean }) {
  const offers = thread.filter((e): e is Extract<ConversationEntry, { type: "out" }> => e.type === "out" && Boolean(e.campaign));
  if (!offers.length) return null;
  const read = offers.filter((e) => e.status === "READ").length;
  const latest = [...new Set(offers.map((e) => e.campaign as string))].slice(0, 3);
  return (
    <div className="wa-sec">
      <h4>{isTamil ? "சமீபத்திய ஆஃபர்கள்" : "Recent offers"}</h4>
      <p style={{ fontSize: 14, marginBottom: 8 }}>
        {isTamil ? `${offers.length} அனுப்பப்பட்டது · ${read} படித்தார்` : `${offers.length} sent · ${read} read`}
      </p>
      <ul>
        {latest.map((c) => (
          <li key={c}>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
