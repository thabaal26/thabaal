import { CheckCheck, CheckCircle2, ChevronRight, MessageCircle, RotateCcw, ShoppingBag, UserRound } from "@/components/icons";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Conversation, type ConversationEntry } from "@/components/conversation";
import { Avatar, Badge, Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { money, orderRef } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { replyWindowEnd } from "@/lib/replies";
import { sendCatalogue } from "../actions/catalog";
import { setOrderStatus } from "../actions/orders";
import { setReplyHandled } from "../actions/replies";
import { InlineReplyBox } from "./inline-reply-box";

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
    orders?: { id: string; number: number; total: number; currency: string }[];
  };
  sender: { label: string } | null;
};

/** What a reply shows in the list when it has no text (media, stickers). */
const preview = (r: InboxReply) =>
  r.text ||
  (r.mediaType === "image" ? "Photo" : r.mediaType === "audio" ? "Voice note" : r.mediaType === "video" ? "Video" : r.mediaType === "sticker" ? "Sticker" : r.mediaType ? "File" : "Message");

/**
 * The replies inbox — consolidated to 1 conversation thread per customer phone number.
 * Computers: the customer list scrolls on its own beside the picked customer's conversation.
 * Phones and tablets: a list whose rows open the customer's conversation and composer.
 */
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
  const windowOpen = Boolean(replyWindowEnd(latestInboundAt));
  const hrefFor = (customerId: string) => `/dashboard/replies?${new URLSearchParams({ ...(show && { show: String(show) }), r: customerId })}`;
  const isOrder = (r: InboxReply) => Boolean(r.hasOrderInquiry) || r.kind === "button" || ORDER.test(r.text);
  const unpaidOrder = (r: InboxReply) => r.customer.orders?.[0] ?? null;

  const tags = (r: InboxReply) => {
    const uo = unpaidOrder(r);
    return (
      <>
        {showClient && <Badge>{r.customer.client.name}</Badge>}
        {(r.openCount ?? 0) > 0 && (
          <Badge tone="green">
            {r.openCount === 1 ? "1 open" : `${r.openCount} open`}
          </Badge>
        )}
        {uo && (
          <Badge tone="amber">
            Unpaid {orderRef(uo)} · {money(uo.total, uo.currency)}
          </Badge>
        )}
        {(r.totalCount ?? 1) > 1 && (
          <Badge tone="gray">{r.totalCount} msgs</Badge>
        )}
        {isOrder(r) && !uo && (
          <Badge tone="amber">
            <ShoppingBag aria-hidden />
            {r.hasButtonTap || r.kind === "button" ? "Tapped button" : "Order / inquiry"}
          </Badge>
        )}
        {r.handled && <Badge tone="gray">Handled</Badge>}
      </>
    );
  };

  const handledButton = (r: InboxReply, size: "sm" | "md") => (
    <ActionButton action={setReplyHandled.bind(null, r.id, !r.handled)} size={size}>
      {r.handled ? <RotateCcw aria-hidden className="size-4" /> : <CheckCheck aria-hidden className="size-4" />}
      {r.handled ? "Reopen" : (r.openCount ?? 1) > 1 ? `Mark handled (${r.openCount})` : "Mark handled"}
    </ActionButton>
  );

  const markOrderPaidButton = (r: InboxReply, size: "sm" | "md") => {
    const uo = unpaidOrder(r);
    if (!uo) return null;
    const ref = orderRef(uo);
    return (
      <ActionButton
        action={setOrderStatus.bind(null, uo.id, "PAID")}
        variant="primary"
        size={size}
        title={`Confirm UPI payment for ${ref} and send WhatsApp receipt`}
      >
        <CheckCircle2 aria-hidden className="size-4" />
        Mark {ref} paid ({money(uo.total, uo.currency)})
      </ActionButton>
    );
  };

  return (
    <Card className="card-3d overflow-hidden lg:grid lg:h-[calc(100dvh-21rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      {/* The list: 1 thread row per customer phone number. */}
      <ul aria-label="Customer conversations" className="thin-scroll divide-y divide-line lg:overflow-y-auto lg:border-r lg:border-line">
        {replies.map((r) => {
          const current = selected?.customer.id === r.customer.id;
          return (
            <li key={r.customer.id} className={cn("relative flex gap-3 px-4 py-3.5 transition-colors hover:bg-subtle", current && "lg:bg-brand-soft/60 lg:hover:bg-brand-soft/60")}>
              {current && <span aria-hidden className="absolute inset-y-0 left-0 hidden w-[3px] bg-brand lg:block" />}
              {!r.handled && !current && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-amber-500/70 lg:hidden" />}
              {/* Phones: the row opens the customer's conversation. Computers: it opens it beside the list. */}
              <Link href={`/dashboard/customers/${r.customer.id}#reply`} className="absolute inset-0 lg:hidden">
                <span className="sr-only">Open conversation with {r.customer.name}</span>
              </Link>
              <Link href={hrefFor(r.customer.id)} scroll={false} aria-current={current ? "true" : undefined} className="absolute inset-0 hidden lg:block">
                <span className="sr-only">Show conversation with {r.customer.name}</span>
              </Link>
              <Avatar name={r.customer.name} className="size-9 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("min-w-0 truncate text-sm text-ink", r.handled ? "font-medium" : "font-semibold")}>{r.customer.name}</p>
                  <time className="tabular shrink-0 text-xs text-muted" dateTime={r.receivedAt.toISOString()}>
                    {fmtDate(r.receivedAt, "d MMM, h:mm a")}
                  </time>
                </div>
                <p className="tabular text-xs text-muted">{formatPhone(r.customer.phone)}</p>
                <p className={cn("mt-0.5 line-clamp-2 text-sm [overflow-wrap:anywhere]", r.handled ? "text-muted" : "text-ink-2")}>
                  {r.kind === "button" && <span className="text-muted">Tapped: </span>}
                  {preview(r)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1 empty:hidden">{tags(r)}</div>
                {canOperate && (
                  <div className="relative z-[1] mt-2.5 flex flex-wrap gap-2 lg:hidden">
                    {markOrderPaidButton(r, "sm")}
                    {handledButton(r, "sm")}
                    <span className="ml-auto inline-flex items-center gap-1 self-center text-xs font-medium text-brand-deep">
                      Open <ChevronRight aria-hidden className="size-3.5" />
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Computers: the picked customer's conversation. */}
      {selected && (
        <section aria-label={`Conversation with ${selected.customer.name}`} className="hidden min-h-0 flex-col lg:flex">
          <header className="flex items-start gap-3 border-b border-line bg-gradient-to-r from-brand-soft/60 to-transparent px-5 py-3.5">
            <Avatar name={selected.customer.name} className="size-10" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[0.9375rem] font-semibold text-ink">{selected.customer.name}</h2>
              <p className="tabular text-sm text-muted">
                {formatPhone(selected.customer.phone)}
                {selected.sender && <> · wrote to {selected.sender.label}</>}
              </p>
              {selected.customer.purchases && (
                <p className="mt-1 line-clamp-1 text-xs text-muted">
                  <ShoppingBag aria-hidden className="mr-1 inline size-3 align-[-2px]" />
                  Bought before: {selected.customer.purchases}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">{tags(selected)}</div>
          </header>

          <Conversation entries={thread} className="min-h-0 flex-1" />

          {canOperate && (
            <InlineReplyBox
              key={selected.customer.id}
              customerId={selected.customer.id}
              customerName={selected.customer.name}
              replyId={selected.id}
              replyHandled={selected.handled}
              windowOpen={windowOpen}
            />
          )}

          <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-panel px-5 py-2.5">
            {canOperate && markOrderPaidButton(selected, "sm")}
            {canOperate && (
              <Link href={`/dashboard/customers/${selected.customer.id}#reply`} className={buttonClass("secondary", "sm")}>
                <MessageCircle aria-hidden className="size-4" /> Send template
              </Link>
            )}
            {canOperate && windowOpen && (
              <ActionButton
                action={sendCatalogue.bind(null, selected.customer.id)}
                size="sm"
                title="Send interactive WhatsApp catalogue (free inside the 24-hour window)"
              >
                <ShoppingBag aria-hidden className="size-4" /> Send catalogue
              </ActionButton>
            )}
            {canOperate && handledButton(selected, "sm")}
            <Link href={`/dashboard/customers/${selected.customer.id}`} className={cn(buttonClass("ghost", "sm"), "ml-auto")}>
              <UserRound aria-hidden className="size-4" /> <span className="max-xl:sr-only">Customer profile</span>
            </Link>
          </footer>
        </section>
      )}
    </Card>
  );
}
