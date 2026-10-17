import type { Metadata } from "next";
import { inboxPriority } from "@/lib/inbox-priority";
import { getScope, ownedMessages } from "@/lib/session";
import { PortalPage } from "../../portal-ui";
import { CHATS_SUB, CHATS_SUB_TA, InboxTabs } from "../inbox-tabs";
import { PriorityBoard, type BoardItem } from "./priority-board";

export const metadata: Metadata = { title: "Priority inbox" };
export const dynamic = "force-dynamic";

/** Chats › Priority: open conversations grouped by what's at stake (portal design). */
export default async function PriorityInboxPage() {
  const scope = await getScope();
  const now = new Date();
  const items = await inboxPriority(ownedMessages(scope), now);
  const board: BoardItem[] = items.map((i) => ({
    customerId: i.customerId,
    name: i.name,
    latestReplyId: i.latestReplyId,
    lastText: i.lastText,
    lastKind: i.lastKind,
    openCount: i.openCount,
    waitingSinceMs: i.waitingSince.getTime(),
    windowLeftH: i.windowLeftH,
    cart: i.cart,
    paidOrders: i.paidOrders,
    lifetimeValue: i.lifetimeValue,
    buyingIntent: i.buyingIntent,
    lane: i.lane,
  }));

  return (
    <PortalPage title="Chats" titleTa="அரட்டை" sub={CHATS_SUB} subTa={CHATS_SUB_TA}>
      <InboxTabs active="priority" />
      <PriorityBoard items={board} nowMs={now.getTime()} canOperate={scope.canOperate} />
    </PortalPage>
  );
}
