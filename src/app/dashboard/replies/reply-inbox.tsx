import { CheckCheck, CheckCircle2, ChevronRight, MessageCircle, Phone, RotateCcw, ShoppingBag } from "@/components/icons";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { Avatar } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { money, orderRef } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { replyWindowEnd } from "@/lib/replies";
import { sendCatalogue } from "../actions/catalog";
import { setOrderStatus } from "../actions/orders";
import { setReplyHandled } from "../actions/replies";
import { InlineReplyBox } from "./inline-reply-box";
import { ChatList, type ChatListItem } from "./chat-list";

const ORDER = /(order|buy|need|want|send|price|rate|available|venum|vendum)|வேண்டும்|ஆர்டர்/i;

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
  const selected = replies.find((x) => x.id === selectedId || x.customer.id === selectedId) ?? replies[0];
  const latestInboundAt = thread.find((e) => e.type === "in")?.at ?? selected?.receivedAt;
  const windowTimeRemaining = formatWindowPill(latestInboundAt);
  const windowOpen = Boolean(windowTimeRemaining);
  const hrefFor = (customerId: string) => `/dashboard/replies?${new URLSearchParams({ ...(show && { show: String(show) }), r: customerId })}`;
  const unpaidOrder = (r: InboxReply) => r.customer.orders?.[0] ?? null;

  const currentUnpaid = selected ? unpaidOrder(selected) : null;
  const currentPurchasesSubtitle = selected
    ? currentUnpaid
      ? `Unpaid ₹${Math.round(currentUnpaid.total).toLocaleString("en-IN")} · ${formatPurchasesCount(selected.customer.purchases)}`
      : `${formatPhone(selected.customer.phone)} · ${formatPurchasesCount(selected.customer.purchases)}`
    : "";

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
    <div className="h-full min-h-0 w-full overflow-hidden rounded-[24px] border border-line bg-card shadow-[0_12px_36px_rgba(16,40,59,0.06)] dark:bg-[#111B21] lg:grid lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
      {/* LEFT COLUMN: Customer Conversations List with Client Search */}
      <div className="flex h-full min-h-0 flex-col overflow-hidden border-r border-line">
        <ChatList items={chatListItems} selectedCustomerId={selected?.customer.id} />
      </div>

      {/* RIGHT COLUMN: WhatsApp Active Chat Window */}
      {selected ? (
        <section aria-label={`Conversation with ${selected.customer.name}`} className="flex h-full min-h-0 flex-col overflow-hidden bg-panel dark:bg-[#111B21]">
          {/* Header matching WhatsApp UI Mock */}
          {/* Two rows: who it is, then the actions (one scrollable line, never overlapping the name). */}
          <header className="shrink-0 space-y-2.5 border-b border-line bg-panel px-4 py-3 dark:bg-[#111B21]">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={selected.customer.name} className="size-10 shrink-0 text-sm font-semibold" />
              <div className="min-w-0">
                <h2 className="truncate text-[15.5px] font-bold text-ink dark:text-white leading-tight">
                  {selected.customer.name}
                </h2>
                <p className="truncate text-xs text-muted dark:text-[#8696A0] leading-normal">
                  {currentPurchasesSubtitle}
                </p>
              </div>
            </div>

            {/* Header Action Badges & Buttons matching mock */}
            <div className="flex flex-wrap items-center gap-2">
              {windowTimeRemaining ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 px-3 py-1 text-xs font-semibold">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Free replies · {windowTimeRemaining}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 px-2.5 py-0.5 text-xs font-medium">
                  Window closed
                </span>
              )}

              {canOperate && currentUnpaid && (
                <ActionButton
                  action={setOrderStatus.bind(null, currentUnpaid.id, "PAID")}
                  size="sm"
                  confirm={`Mark order ${orderRef(currentUnpaid)} as paid (${money(currentUnpaid.total, currentUnpaid.currency)})?`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                >
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Mark {orderRef(currentUnpaid)} paid</span>
                </ActionButton>
              )}

              {canOperate && windowOpen && (
                <ActionButton
                  action={sendCatalogue.bind(null, selected.customer.id)}
                  size="sm"
                  title="Send interactive WhatsApp catalogue (free inside the 24-hour window)"
                  className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle dark:bg-[#1A262D]"
                >
                  <ShoppingBag className="size-3.5 text-brand-deep" />
                  <span className="max-sm:sr-only">Send catalogue</span>
                </ActionButton>
              )}

              {canOperate && (
                <Link
                  href={`/dashboard/customers/${selected.customer.id}#reply`}
                  className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle dark:bg-[#1A262D]"
                  title="Send an approved WhatsApp template"
                >
                  <MessageCircle className="size-3.5 text-brand-deep" />
                  <span className="max-sm:sr-only">Send template</span>
                </Link>
              )}

              <Link
                href={`/dashboard/customers/${selected.customer.id}`}
                className="rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle dark:bg-[#1A262D]"
              >
                Profile
              </Link>

              <Link
                href={`/dashboard/customers/${selected.customer.id}#call`}
                className="inline-flex items-center gap-1 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle dark:bg-[#1A262D]"
              >
                <Phone className="size-3 text-emerald-600 dark:text-emerald-400" />
                <span>Call</span>
              </Link>

              {canOperate && (
                <ActionButton
                  action={setReplyHandled.bind(null, selected.id, !selected.handled)}
                  size="sm"
                  className="rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-subtle dark:bg-[#1A262D]"
                >
                  {selected.handled ? <RotateCcw className="size-3.5" /> : <CheckCheck className="size-3.5" />}
                  <span>{selected.handled ? "Reopen" : "Done"}</span>
                </ActionButton>
              )}
            </div>
          </header>

          {/* Conversation Chat Wallpaper & Bubbles */}
          <Conversation entries={thread} className="min-h-0 flex-1 overflow-y-auto" />

          {/* Bottom WhatsApp Message Composer */}
          {canOperate && (
            <div className="shrink-0 border-t border-line">
              <InlineReplyBox
                key={selected.customer.id}
                customerId={selected.customer.id}
                customerName={selected.customer.name}
                replyId={selected.id}
                replyHandled={selected.handled}
                windowOpen={windowOpen}
              />
            </div>
          )}
        </section>
      ) : (
        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
          Select a customer to open WhatsApp conversation
        </div>
      )}
    </div>
  );
}
