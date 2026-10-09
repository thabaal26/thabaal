import { CheckCheck, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Card, EmptyState, FilterChips, PageHeader } from "@/components/ui";
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

  return (
    <>
      <PageHeader
        title="Replies"
        description="What customers sent back after your campaigns: order taps and messages. Reply on WhatsApp, then mark them handled."
        inlineActions
        actions={
          scope.canOperate &&
          n(false) > 0 && (
            <ActionButton action={handleAllReplies} size="md" confirm="Mark every open reply as handled?" aria-label="Mark all handled">
              <CheckCheck aria-hidden className="size-4" />
              <span className="sm:hidden">All handled</span>
              <span className="max-sm:hidden">Mark all handled</span>
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

      {replies.length ? (
        <ReplyInbox replies={replies} picked={typeof picked === "string" ? picked : undefined} show={typeof show === "string" ? show : ""} canOperate={scope.canOperate} showClient={!scope.clientId} />
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
