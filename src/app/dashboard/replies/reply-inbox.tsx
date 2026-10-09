import { CheckCheck, MessageCircle, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { ReplyMedia } from "@/components/reply-media";
import { Avatar, Badge, Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { setReplyHandled } from "../actions/replies";

const ORDER = /(order|buy|need|want|send|price|rate|available|venum|vendum)|வேண்டும்|ஆர்டர்/i;

export type InboxReply = {
  id: string;
  text: string;
  kind: string;
  handled: boolean;
  receivedAt: Date;
  mediaId: string | null;
  mediaType: string | null;
  customer: { id: string; name: string; phone: string; purchases: string | null; client: { name: string } };
  sender: { label: string } | null;
};

/**
 * The replies list. Phones and tablets: each reply with its message and buttons. Wide screens:
 * a compact list beside the selected reply (?r=<id>, the newest by default).
 */
export function ReplyInbox({ replies, picked, show, canOperate, showClient }: { replies: InboxReply[]; picked?: string; show: string; canOperate: boolean; showClient: boolean }) {
  // Wide screens show one reply beside the list (?r=<id>); the newest is open by default.
  const selected = replies.find((x) => x.id === picked) ?? replies[0];
  const hrefFor = (id: string) => `/dashboard/replies?${new URLSearchParams({ ...(show && { show: String(show) }), r: id })}`;
  const isOrder = (r: InboxReply) => r.kind === "button" || ORDER.test(r.text);

  const tags = (r: InboxReply) => (
    <>
      {showClient && <Badge>{r.customer.client.name}</Badge>}
      {isOrder(r) && (
        <Badge tone="green">
          <ShoppingBag aria-hidden className="mr-1 inline size-3 align-[-2px]" />
          {r.kind === "button" ? "Tapped button" : "Possible order"}
        </Badge>
      )}
      {r.handled && <Badge tone="gray">Handled</Badge>}
    </>
  );

  const actions = (r: InboxReply, wide?: boolean) =>
    canOperate && (
      <div className={cn("flex gap-2", !wide && "*:flex-1")}>
        <Link href={`/dashboard/customers/${r.customer.id}#reply`} className={buttonClass("primary", wide ? "md" : "sm")}>
          <MessageCircle aria-hidden className="size-4" /> Reply here
        </Link>
        <ActionButton action={setReplyHandled.bind(null, r.id, !r.handled)} size={wide ? "md" : "sm"}>
          {r.handled ? (
            <>
              <RotateCcw aria-hidden className="size-4" /> Reopen
            </>
          ) : (
            <>
              <CheckCheck aria-hidden className="size-4" /> Handled
            </>
          )}
        </ActionButton>
      </div>
    );

  return (
        <div className="xl:grid xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start xl:gap-6">
          <Card>
            <ul className="divide-y divide-line">
              {replies.map((r) => {
                const current = selected?.id === r.id;
                return (
                  <li key={r.id} className={cn("relative flex gap-3 px-4 py-3.5 sm:px-5 xl:py-3 xl:transition-colors xl:hover:bg-canvas/70", current && "xl:bg-brand-soft/60 xl:hover:bg-brand-soft/60")}>
                    {/* Wide screens: the whole row opens the reply in the side panel. */}
                    <Link href={hrefFor(r.id)} scroll={false} aria-current={current ? "true" : undefined} className="absolute inset-0 hidden rounded-[inherit] xl:block">
                      <span className="sr-only">Open reply from {r.customer.name}</span>
                    </Link>
                    <Avatar name={r.customer.name} className="max-sm:hidden xl:size-9" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/dashboard/customers/${r.customer.id}`} className="relative min-w-0 truncate font-medium text-ink hover:underline xl:pointer-events-none">
                          {r.customer.name}
                        </Link>
                        <time className="tabular shrink-0 text-xs text-muted" dateTime={r.receivedAt.toISOString()}>
                          {fmtDate(r.receivedAt, "d MMM, h:mm a")}
                        </time>
                      </div>
                      <p className="tabular text-xs text-muted">{formatPhone(r.customer.phone)}</p>
                      <p className="mt-2 w-fit max-w-full whitespace-pre-wrap rounded-card rounded-tl-sm bg-bubble px-3 py-2 text-sm text-ink shadow-card ring-1 ring-line xl:line-clamp-2 xl:w-auto xl:bg-transparent xl:p-0 xl:pb-0.5 xl:text-muted xl:shadow-none xl:ring-0">
                        {r.text}
                      </p>
                      <div className="xl:hidden">
                        {r.mediaId && <ReplyMedia id={r.id} type={r.mediaType} />}
                        <p className="mt-1.5 text-xs text-muted">
                          {r.sender && <>To {r.sender.label}</>}
                          {r.sender && r.customer.purchases && " · "}
                          {r.customer.purchases && <>Bought before: {r.customer.purchases}</>}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1 empty:hidden">{tags(r)}</div>
                      {canOperate && <div className="relative mt-3 xl:hidden">{actions(r)}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected && (
            <Card className="sticky top-8 hidden xl:block" aria-label="Selected reply">
              <div className="flex items-start gap-3 border-b border-line px-5 py-4">
                <Avatar name={selected.customer.name} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-ink">
                    <Link href={`/dashboard/customers/${selected.customer.id}`} className="hover:underline">
                      {selected.customer.name}
                    </Link>
                  </h2>
                  <p className="tabular text-sm text-muted">{formatPhone(selected.customer.phone)}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">{tags(selected)}</div>
              </div>
              <div className="chat-wall px-5 py-6">
                <div className="w-fit max-w-[85%] rounded-card rounded-tl-sm bg-bubble px-3.5 py-2.5 text-md text-ink shadow-card">
                  {selected.kind === "button" && <p className="mb-0.5 text-xs font-medium text-brand-deep">Tapped a button</p>}
                  <p className="whitespace-pre-wrap">{selected.text}</p>
                  {selected.mediaId && <ReplyMedia id={selected.id} type={selected.mediaType} />}
                  <p className="mt-1 text-right text-2xs text-muted">{fmtDate(selected.receivedAt, "EEE d MMM, h:mm a")}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-5 py-4 text-sm">
                {selected.sender && (
                  <>
                    <dt className="text-muted">Sent to</dt>
                    <dd>{selected.sender.label}</dd>
                  </>
                )}
                <dt className="text-muted">Bought before</dt>
                <dd>{selected.customer.purchases ?? <span className="text-muted">Nothing recorded</span>}</dd>
              </dl>
              {canOperate && <div className="border-t border-line px-5 py-4">{actions(selected, true)}</div>}
            </Card>
          )}
        </div>
  );
}
