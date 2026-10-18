import type { Metadata } from "next";
import Link from "@/components/intent-link";
import type { ConversationEntry } from "@/components/conversation";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope, ownedMessages } from "@/lib/session";
import { handleAllReplies } from "../actions/replies";
import { CHATS_SUB, CHATS_SUB_TA, InboxTabs } from "./inbox-tabs";
import { PAction, PortalPage, T } from "../portal-ui";
import { ReplyInbox } from "./reply-inbox";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

// Every chat by default, as in the design; "Open" narrows to the ones still waiting.
const TABS = [
  { key: "", label: "All", labelTa: "அனைத்தும்" },
  { key: "open", label: "Open", labelTa: "திறந்தவை" },
  { key: "handled", label: "Handled", labelTa: "பார்த்தவை" },
] as const;

export default async function RepliesPage({ searchParams }: PageProps<"/dashboard/replies">) {
  const { show: rawShow = "", r: picked } = await searchParams;
  // Older links say show=all for everything.
  const show = rawShow === "all" ? "" : rawShow;
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
    "": allThreads.length,
    open: openThreadsCount,
    handled: handledThreadsCount,
  };

  const replies = allThreads.filter((t) => (show === "handled" ? t.handled : show === "open" ? !t.handled : true));

  // Computers show the picked customer's conversation beside the list (the newest customer thread by default).
  let selected = replies.find((x) => x.id === picked || x.customer.id === picked);
  if (!selected && picked) {
    selected = allThreads.find((x) => x.id === picked || x.customer.id === picked);
    if (selected && !replies.some((r) => r.customer.id === selected!.customer.id)) {
      replies.unshift(selected);
    }
  }
  if (!selected) {
    selected = replies[0];
  }
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
    <PortalPage title="Chats" titleTa="உரையாடல்கள்" sub={CHATS_SUB} subTa={CHATS_SUB_TA}>
      <InboxTabs active="inbox" />

      <div className="chips" style={{ marginBottom: 14, alignItems: "center" }}>
        {TABS.map((t) => (
          <Link key={t.key} href={t.key ? `/dashboard/replies?show=${t.key}` : "/dashboard/replies"} className="chip" aria-current={show === t.key ? "true" : undefined} scroll={false}>
            {t.label} <small>{fmtNumber(tabCount[t.key])}</small>
          </Link>
        ))}
        {scope.canOperate && openThreadsCount > 0 && (
          <PAction action={handleAllReplies} className="sm ghost" style={{ marginLeft: "auto" }} confirm="Mark every open customer conversation as handled?">
            <T ta="அனைத்தையும் முடிந்ததாகக் குறி">Mark all handled</T>
          </PAction>
        )}
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
        <section className="card">
          <h2>{show === "handled" ? "Nothing handled yet" : show === "open" ? "You're all caught up" : "No replies yet"}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            When customers tap &ldquo;Order now&rdquo; or write back after a campaign, each customer&apos;s conversation appears here.
          </p>
        </section>
      )}
    </PortalPage>
  );
}
