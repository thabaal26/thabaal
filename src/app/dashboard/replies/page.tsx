import { CheckCheck } from "@/components/icons";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import type { ConversationEntry } from "@/components/conversation";
import { Inbox3D, Messages3D, ShoppingBag3D } from "@/components/icons-3d";
import { Card, EmptyState, FilterChips, PageHeader, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope, ownedMessages } from "@/lib/session";
import { handleAllReplies } from "../actions/replies";
import { InboxTabs } from "./inbox-tabs";
import { ReplyInbox } from "./reply-inbox";

export const metadata: Metadata = { title: "Replies" };
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
    <>
      <PageHeader
        title="Replies"
        description="One conversation thread per customer phone number. Answer them inside the chat, then mark the customer handled."
        inlineActions
        actions={
          scope.canOperate &&
          openThreadsCount > 0 && (
            <ActionButton action={handleAllReplies} size="md" confirm="Mark every open customer conversation as handled?" aria-label="Mark all handled">
              <CheckCheck aria-hidden className="size-4" />
              <span>
                <span className="max-sm:hidden">Mark all</span>
                <span className="sm:hidden">All</span> handled
              </span>
            </ActionButton>
          )
        }
        tabs={
          <div className="flex flex-wrap items-center gap-3">
          <InboxTabs active="inbox" />
          <FilterChips
            label="Reply status"
            items={TABS.map((t) => ({
              href: t.key ? `/dashboard/replies?show=${t.key}` : "/dashboard/replies",
              label: t.label,
              count: fmtNumber(tabCount[t.key]),
              active: show === t.key,
            }))}
          />
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Open conversations"
          value={fmtNumber(tabCount[""])}
          sub={tabCount[""] > 0 ? "Customers waiting for reply" : "Inbox zero!"}
          icon={<Inbox3D />}
          tone={tabCount[""] > 0 ? "amber" : "brand"}
          href="/dashboard/replies"
        />
        <Stat
          label="Order & rate taps"
          value={fmtNumber(orderInquiryCount)}
          sub="Customers in current view"
          icon={<ShoppingBag3D />}
          tone="gold"
        />
        <Stat
          label="Handled"
          value={fmtNumber(tabCount.handled)}
          sub="Answered & closed"
          icon={<CheckCheck />}
          tone="brand"
          meter={tabCount.all > 0 ? Math.round((tabCount.handled / tabCount.all) * 100) : 0}
          href="/dashboard/replies?show=handled"
        />
        <Stat
          label="Customer threads"
          value={fmtNumber(tabCount.all)}
          sub={`${fmtNumber(rawReplies.length)} total messages`}
          icon={<Messages3D />}
          tone="info"
          href="/dashboard/replies?show=all"
        />
      </div>

      {replies.length ? (
        <ReplyInbox
          replies={replies}
          selectedId={selected?.id}
          thread={thread}
          show={typeof show === "string" ? show : ""}
          canOperate={scope.canOperate}
          showClient={!scope.clientId}
        />
      ) : (
        <Card className="card-3d">
          <EmptyState icon={<Inbox3D className="size-5" />} title={show === "handled" ? "Nothing handled yet" : show === "all" ? "No replies yet" : "You're all caught up"}>
            When customers tap &ldquo;Order now&rdquo; or write back after a campaign, each customer&apos;s conversation appears here.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

