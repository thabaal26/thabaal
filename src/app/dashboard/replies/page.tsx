import type { Metadata } from "next";
import type { ConversationEntry } from "@/components/conversation";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/format";
import { getScope, ownedMessages } from "@/lib/session";
import { CHATS_SUB, CHATS_SUB_TA, InboxTabs } from "./inbox-tabs";
import { PortalPage } from "../portal-ui";
import { ReplyInbox, type ChatProfile } from "./reply-inbox";
import "./chats.css";
import { templateLabel } from "@/lib/plain-error";
import { planGate } from "@/app/dashboard/plan-lock";
import { chatAutomation } from "@/lib/engine/conversation";
import { engagementRows, hasCampaignHistory, SEGMENT_LABEL } from "@/lib/engagement-segments";

export const metadata: Metadata = { title: "Chats" };
export const dynamic = "force-dynamic";

// Every chat by default; the only filter is the campaign group ("Not reached yet" customers have no chat to show here).
const CHAT_GROUPS = ["super", "active", "inactive"] as const;

/** Customers we messaged (a campaign, an order update) who haven't written back show as chats this many days. */
const SENT_DAYS = 7;

export default async function RepliesPage({ searchParams }: PageProps<"/dashboard/replies">) {
  const locked = await planGate();
  if (locked) return locked;
  // Older links may still carry ?show=open|handled|sent: those open every chat now.
  const { r: picked, group: rawGroup = "" } = await searchParams;
  // By how they respond to campaigns (lib/engagement-segments.ts), the same groups the campaign form shows.
  const group = typeof rawGroup === "string" && (CHAT_GROUPS as readonly string[]).includes(rawGroup) ? (rawGroup as (typeof CHAT_GROUPS)[number]) : "";
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
            select: { id: true, number: true, ref: true, total: true, currency: true, paymentClaimedAt: true, paidAmount: true, paymentMethod: true, paymentTxnId: true },
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
  const replyThreads = [...threadMap.values()].map((t) => ({
    ...t,
    handled: t.openCount === 0,
  }));

  // Customers we messaged lately who haven't written back: a chat too, so every campaign message shows here. One
  // row per customer, our newest message as its preview.
  const sentMessages = await db.message.findMany({
    where: {
      ...mine,
      status: { notIn: ["QUEUED", "SKIPPED"] },
      createdAt: { gte: daysAgo(SENT_DAYS) },
      customerId: { notIn: [...threadMap.keys()] },
    },
    distinct: ["customerId"],
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      templateName: true,
      status: true,
      sentAt: true,
      createdAt: true,
      customerId: true,
    },
  });
  const sentCustomers = sentMessages.length
    ? await db.customer.findMany({
        where: { id: { in: sentMessages.map((m) => m.customerId) } },
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
            select: { id: true, number: true, ref: true, total: true, currency: true, paymentClaimedAt: true, paidAmount: true, paymentMethod: true, paymentTxnId: true },
          },
        },
      })
    : [];
  const customerById = new Map(sentCustomers.map((c) => [c.id, c]));
  const sentThreads = sentMessages.flatMap((m) => {
    const customer = customerById.get(m.customerId);
    if (!customer) return [];
    return [
      {
        id: m.id,
        text: templateLabel(m.templateName ?? "Message"),
        kind: "sent",
        sentStatus: m.status,
        handled: true,
        receivedAt: m.sentAt ?? m.createdAt,
        mediaId: null,
        mediaType: null,
        openCount: 0,
        totalCount: 0,
        hasButtonTap: false,
        hasOrderInquiry: false,
        customer,
        sender: null,
      },
    ];
  });

  // Newest activity first: their last message to us, or ours to them when they haven't written.
  const allThreads = [...replyThreads, ...sentThreads].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const openThreadsCount = replyThreads.filter((t) => !t.handled).length;
  // Each chat's group, read live for this business's own customers (none before its first campaign).
  const groupOf = new Map<string, string>();
  if (scope.clientId && (await hasCampaignHistory(scope.clientId))) {
    const ids = [...new Set(allThreads.map((t) => t.customer.id))];
    for (const e of await engagementRows(scope.clientId, { customerIds: ids })) groupOf.set(e.id, e.segment);
  }
  const groups = groupOf.size
    ? CHAT_GROUPS.map((key) => ({ key, label: SEGMENT_LABEL[key].en, labelTa: SEGMENT_LABEL[key].ta, count: allThreads.filter((t) => groupOf.get(t.customer.id) === key).length }))
    : null;
  const replies = group && groups ? allThreads.filter((t) => groupOf.get(t.customer.id) === group) : [...allThreads];

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
  let profile: ChatProfile | null = null;
  if (selected) {
    const [msgs, reps, info, automation] = await Promise.all([
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
      // The contact info panel: tags, area, and the latest orders.
      db.customer.findUnique({
        where: { id: selected.customer.id },
        select: {
          tags: true,
          location: true,
          createdAt: true,
          optedOut: true,
          unreachable: true,
          _count: { select: { orders: true } },
          orders: { orderBy: { createdAt: "desc" }, take: 3, select: { id: true, number: true, ref: true, total: true, currency: true, status: true, createdAt: true } },
        },
      }),
      chatAutomation(selected.customer.id),
    ]);
    if (info) {
      profile = {
        tags: info.tags,
        location: info.location,
        since: info.createdAt,
        optedOut: info.optedOut,
        unreachable: info.unreachable,
        orderCount: info._count.orders,
        orders: info.orders,
        automation: { paused: automation.paused, until: automation.until, reason: automation.reason },
      };
    }
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
    <PortalPage title="Chats" titleTa="உரையாடல்கள்" sub={CHATS_SUB} subTa={CHATS_SUB_TA} wide>
      <InboxTabs active="inbox" />
      <ReplyInbox
        replies={replies}
        selectedId={selected?.id}
        thread={thread}
        profile={profile}
        total={allThreads.length}
        group={groups ? group : ""}
        groups={groups}
        openCount={openThreadsCount}
        opened={Boolean(picked)}
        canOperate={scope.canOperate}
        showClient={!scope.clientId}
      />
    </PortalPage>
  );
}
