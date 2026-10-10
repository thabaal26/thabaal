import { CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import type { ConversationEntry } from "@/components/conversation";
import { Inbox3D, Messages3D, ShoppingBag3D } from "@/components/icons-3d";
import { Card, EmptyState, FilterChips, PageHeader, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope, ownedMessages } from "@/lib/session";
import { handleAllReplies } from "../actions/replies";
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
  const filter = show === "handled" ? { handled: true } : show === "all" ? {} : { handled: false };

  const [replies, counts] = await Promise.all([
    db.reply.findMany({
      where: { ...mine, ...filter },
      include: {
        customer: { select: { id: true, name: true, phone: true, purchases: true, client: { select: { name: true } } } },
        sender: { select: { label: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    db.reply.groupBy({ by: ["handled"], where: mine, _count: true }),
  ]);
  const n = (h: boolean) => counts.find((c) => c.handled === h)?._count ?? 0;
  const tabCount = { "": n(false), handled: n(true), all: n(false) + n(true) };
  const orderInquiryCount = replies.filter((r) => r.kind === "button" || /(order|buy|need|want|send|price|rate|available|venum|vendum)|வேண்டும்|ஆர்டர்/i.test(r.text)).length;

  // Computers show the picked reply's customer conversation beside the list (the newest reply by default).
  const selected = replies.find((x) => x.id === picked) ?? replies[0];
  const thread: ConversationEntry[] = [];
  if (selected) {
    const [msgs, reps] = await Promise.all([
      db.message.findMany({
        where: { customerId: selected.customer.id, status: { not: "QUEUED" } },
        include: { run: { select: { campaign: { select: { name: true } } } }, sender: { select: { label: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.reply.findMany({ where: { customerId: selected.customer.id }, include: { sender: { select: { label: true } } }, orderBy: { receivedAt: "desc" }, take: 30 }),
    ]);
    thread.push(
      ...msgs.map((m) => ({
        at: m.sentAt ?? m.createdAt, type: "out" as const, id: m.id, template: m.templateName, campaign: m.run?.campaign.name ?? null,
        status: m.status, body: m.body, readAt: m.readAt, error: m.error, via: m.sender?.label ?? null,
      })),
      ...reps.map((r) => ({ at: r.receivedAt, type: "in" as const, id: r.id, text: r.text, kind: r.kind, mediaId: r.mediaId, mediaType: r.mediaType, via: r.sender?.label ?? null })),
    );
    thread.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  return (
    <>
      <PageHeader
        title="Replies"
        description="What customers sent back: order taps, messages and media. Answer them, then mark them handled so the team knows."
        inlineActions
        actions={
          scope.canOperate &&
          n(false) > 0 && (
            <ActionButton action={handleAllReplies} size="md" confirm="Mark every open reply as handled?" aria-label="Mark all handled">
              <CheckCheck aria-hidden className="size-4" />
              <span>
                <span className="max-sm:hidden">Mark all</span>
                <span className="sm:hidden">All</span> handled
              </span>
            </ActionButton>
          )
        }
        tabs={
          <FilterChips
            label="Reply status"
            items={TABS.map((t) => ({
              href: t.key ? `/dashboard/replies?show=${t.key}` : "/dashboard/replies",
              label: t.label,
              count: fmtNumber(tabCount[t.key]),
              active: show === t.key,
            }))}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Open replies"
          value={fmtNumber(tabCount[""])}
          sub={tabCount[""] > 0 ? "Need a response" : "Inbox zero!"}
          icon={<Inbox3D />}
          tone={tabCount[""] > 0 ? "amber" : "brand"}
          href="/dashboard/replies"
        />
        <Stat
          label="Order & rate taps"
          value={fmtNumber(orderInquiryCount)}
          sub="In current view"
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
          label="Total replies"
          value={fmtNumber(tabCount.all)}
          sub="Across all customers"
          icon={<Messages3D />}
          tone="info"
          href="/dashboard/replies?show=all"
        />
      </div>

      {replies.length ? (
        <ReplyInbox replies={replies} selectedId={selected?.id} thread={thread} show={typeof show === "string" ? show : ""} canOperate={scope.canOperate} showClient={!scope.clientId} />
      ) : (
        <Card className="card-3d">
          <EmptyState icon={<Inbox3D className="size-5" />} title={show === "handled" ? "Nothing handled yet" : show === "all" ? "No replies yet" : "You're all caught up"}>
            When customers tap &ldquo;Order now&rdquo; or write back after a campaign, their messages appear here.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

