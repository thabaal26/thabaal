import { CheckCheck, Inbox, MessageCircle, RotateCcw, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, ownedMessages } from "@/lib/session";
import { handleAllReplies, setReplyHandled } from "../actions/replies";

export const metadata: Metadata = { title: "Replies" };
export const dynamic = "force-dynamic";

const ORDER = /\b(order|buy|need|want|send|price|rate|available|venum|vendum)\b|வேண்டும்|ஆர்டர்/i;
const TABS = [
  { key: "", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
] as const;

export default async function RepliesPage({ searchParams }: PageProps<"/dashboard/replies">) {
  const { show = "" } = await searchParams;
  const scope = await getScope();
  const mine = ownedMessages(scope);
  const filter = show === "handled" ? { handled: true } : show === "all" ? {} : { handled: false };

  const [replies, counts] = await Promise.all([
    db.reply.findMany({
      where: { ...mine, ...filter },
      include: { customer: { select: { id: true, name: true, phone: true, purchases: true, client: { select: { name: true } } } } },
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    db.reply.groupBy({ by: ["handled"], where: mine, _count: true }),
  ]);
  const n = (h: boolean) => counts.find((c) => c.handled === h)?._count ?? 0;
  const tabCount = { "": n(false), handled: n(true), all: n(false) + n(true) };

  return (
    <>
      <PageHeader
        title="Replies"
        description="What customers sent back after your campaigns: order taps and messages. Reply on WhatsApp, then mark them handled."
        actions={n(false) > 0 && <ActionButton action={handleAllReplies} size="md" confirm="Mark every open reply as handled?"><CheckCheck className="size-4" /> Mark all handled</ActionButton>}
      />

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/dashboard/replies?show=${t.key}` : "/dashboard/replies"}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-95 sm:h-auto sm:px-3 sm:py-1.5 sm:text-xs",
              show === t.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink/30",
            )}
          >
            {t.label} <span className="tabular opacity-60">{fmtNumber(tabCount[t.key])}</span>
          </Link>
        ))}
      </div>

      {replies.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {replies.map((r) => {
              const order = r.kind === "button" || ORDER.test(r.text);
              return (
                <li key={r.id} className={cn("flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:px-5", r.handled && "opacity-70")}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-deep max-sm:hidden">
                    {r.customer.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={`/dashboard/customers/${r.customer.id}`} className="font-medium hover:underline">{r.customer.name}</Link>
                      <span className="tabular text-xs text-muted">{formatPhone(r.customer.phone)}</span>
                      {!scope.clientId && <Badge>{r.customer.client.name}</Badge>}
                      {order && <Badge tone="green"><ShoppingBag className="size-3" /> {r.kind === "button" ? "Tapped button" : "Possible order"}</Badge>}
                    </div>
                    <p className="mt-2 w-fit max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-bubble px-3 py-2 text-sm shadow-sm ring-1 ring-line">{r.text}</p>
                    <p className="mt-1.5 text-xs text-muted">
                      {fmtDate(r.receivedAt, "EEE d MMM, h:mm a")}
                      {r.customer.purchases && <> · bought before: {r.customer.purchases}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
                    <a href={`https://wa.me/${r.customer.phone}`} target="_blank" rel="noreferrer" className={cn(buttonClass("primary", "sm"), "flex-1 sm:flex-none")}>
                      <MessageCircle className="size-3.5" /> Reply on WhatsApp
                    </a>
                    <ActionButton action={setReplyHandled.bind(null, r.id, !r.handled)} className="flex-1 sm:flex-none">
                      {r.handled ? <><RotateCcw className="size-3.5" /> Reopen</> : <><CheckCheck className="size-3.5" /> Handled</>}
                    </ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<Inbox className="size-5" />} title={show === "handled" ? "Nothing handled yet" : show === "all" ? "No replies yet" : "You're all caught up"}>
            When customers tap &ldquo;Order now&rdquo; or write back after a campaign, their messages appear here.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
