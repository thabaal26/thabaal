import { CheckCheck, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import type { ConversationEntry } from "@/components/conversation";
import { Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope, ownedMessages } from "@/lib/session";
import { handleAllReplies } from "../actions/replies";
import { InboxTabs } from "./inbox-tabs";
import { ReplyInbox } from "./reply-inbox";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "Open" },
  { key: "handled", label: "Handled" },
  { key: "all", label: "All" },
] as const;

export default async function RepliesPage({ searchParams }: PageProps<"/dashboard/replies">) {
  const { show = "", r: picked } = await searchParams;
  const scope = await getScope();
  const mine = ownedMessages(scope);

  const rawReplies = await db.reply.findMany({
    where: mine,
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          purchases: true,
          client: { select: { name: true } },
          orders: {
            where: { paidAt: null, status: { in: ["NEW", "CONFIRMED"] } },
            orderBy: [{ paymentRequestedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: { id: true, number: true, ref: true, total: true, currency: true },
          },
        },
      },
      sender: { select: { label: true } },
    },
    orderBy: { receivedAt: "desc" },
    take: 500,
  });

  const ORDER_RE = /(order|buy|need|want|send|price|rate|available|venum|vendum)|வேண்டும்|ஆர்டர்/i;

  // Group into 1 thread per customer (phone number), ordered by newest reply first.
  const threadMap = new Map<
    string,
    (typeof rawReplies)[number] & {
      openCount: number;
      totalCount: number;
      hasButtonTap: boolean;
      hasOrderInquiry: boolean;
    }
  >();

  for (const r of rawReplies) {
    const cid = r.customer.id;
    const isOrderTap = r.kind === "button" || r.kind === "order" || ORDER_RE.test(r.text);
    const existing = threadMap.get(cid);
    if (!existing) {
      threadMap.set(cid, {
        ...r,
        openCount: r.handled ? 0 : 1,
        totalCount: 1,
        hasButtonTap: r.kind === "button",
        hasOrderInquiry: isOrderTap,
      });
    } else {
      existing.totalCount += 1;
      if (!r.handled) existing.openCount += 1;
      if (r.kind === "button") existing.hasButtonTap = true;
      if (isOrderTap) existing.hasOrderInquiry = true;
    }
  }

  // A customer thread is open if ANY reply from that customer is still unhandled.
  const allThreads = [...threadMap.values()].map((t) => ({
    ...t,
    handled: t.openCount === 0,
  }));

  const openThreadsCount = allThreads.filter((t) => !t.handled).length;
  const handledThreadsCount = allThreads.filter((t) => t.handled).length;
  const tabCount = {
    "": openThreadsCount,
    handled: handledThreadsCount,
    all: allThreads.length,
  };

  const replies = allThreads.filter((t) =>
    show === "handled" ? t.handled : show === "all" ? true : !t.handled,
  );
  const orderInquiryCount = replies.filter((r) => r.hasOrderInquiry).length;

  // Computers show the picked customer's conversation beside the list (the newest customer thread by default).
  const selected = replies.find((x) => x.id === picked || x.customer.id === picked) ?? replies[0];
  const thread: ConversationEntry[] = [];
  if (selected) {
    const [msgs, reps] = await Promise.all([
      db.message.findMany({
        where: { customerId: selected.customer.id, status: { not: "QUEUED" } },
        include: { run: { select: { campaign: { select: { name: true } } } }, sender: { select: { label: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      db.reply.findMany({
        where: { customerId: selected.customer.id },
        include: { sender: { select: { label: true } } },
        orderBy: { receivedAt: "desc" },
        take: 40,
      }),
    ]);
    thread.push(
      ...msgs.map((m) => ({
        at: m.sentAt ?? m.createdAt,
        type: "out" as const,
        id: m.id,
        template: m.templateName,
        campaign: m.run?.campaign.name ?? null,
        status: m.status,
        body: m.body,
        readAt: m.readAt,
        error: m.error,
        via: m.sender?.label ?? null,
      })),
      ...reps.map((r) => ({
        at: r.receivedAt,
        type: "in" as const,
        id: r.id,
        text: r.text,
        kind: r.kind,
        mediaId: r.mediaId,
        mediaType: r.mediaType,
        via: r.sender?.label ?? null,
      })),
    );
    thread.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Header section with title and view tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink dark:text-[#FFF9F0] sm:text-3xl">Chats</h1>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">
            Answer customers first. Free replies are open for 24 hours after they write.
          </p>
        </div>
        <InboxTabs active="inbox" />
      </div>

      {/* Filter pills and Mark All Handled action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          {TABS.map((t) => {
            const count = tabCount[t.key];
            const active = show === t.key;
            return (
              <Link
                key={t.key}
                href={t.key ? `/dashboard/replies?show=${t.key}` : "/dashboard/replies"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition",
                  active
                    ? "bg-[#10283B] text-[#FFF9F0] dark:bg-[#FFF9F0] dark:text-[#10283B] shadow-xs"
                    : "border border-line bg-card text-muted hover:border-line-strong hover:text-ink dark:hover:text-white",
                )}
              >
                <span>{t.label}</span>
                <span className={cn("rounded-full px-1.5 py-0.2 text-[11px] font-bold", active ? "bg-white/20 dark:bg-black/20" : "bg-subtle text-muted")}>
                  {fmtNumber(count)}
                </span>
              </Link>
            );
          })}
        </div>

        {scope.canOperate && openThreadsCount > 0 && (
          <ActionButton
            action={handleAllReplies}
            size="sm"
            confirm="Mark every open customer conversation as handled?"
            aria-label="Mark all handled"
            className="text-xs font-medium text-muted hover:text-ink hover:underline"
          >
            <CheckCheck aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>Mark all handled</span>
          </ActionButton>
        )}
      </div>

      {/* WhatsApp 2-Column Chat Interface */}
      {replies.length ? (
        <div className="h-[calc(100dvh-15.5rem)] min-h-[440px] w-full">
          <ReplyInbox
            replies={replies}
            selectedId={selected?.id}
            thread={thread}
            show={typeof show === "string" ? show : ""}
            canOperate={scope.canOperate}
            showClient={!scope.clientId}
          />
        </div>
      ) : (
        <Card className="rounded-[24px] p-8">
          <EmptyState
            icon={<MessageCircle className="size-6 stroke-[2] text-brand" />}
            title={show === "handled" ? "Nothing handled yet" : show === "all" ? "No replies yet" : "You're all caught up"}
          >
            When customers tap &ldquo;Order now&rdquo; or write back after a campaign, each customer&apos;s conversation appears here.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

