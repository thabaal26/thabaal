import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/format";
import { getScope, owned, ownedMessages, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const t = (d: Date | null | undefined) => d?.getTime() ?? 0;

/**
 * A fingerprint of what Chats shows: customers' messages (how many, the newest, how many still open), our messages of
 * the last 7 days (how many, the newest, the latest sent / delivered / read / failed tick) and the orders (for the
 * "Unpaid" tags). Chats asks for it every few seconds and re-renders only when it changed, instead of rebuilding the
 * whole page each time. Only the login's own business is counted; nothing about the messages is returned.
 */
export async function GET() {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();
  const mine = ownedMessages(scope);
  const [replies, open, sent, orders] = await Promise.all([
    db.reply.aggregate({ where: mine, _count: { _all: true }, _max: { receivedAt: true } }),
    db.reply.count({ where: { ...mine, handled: false } }),
    db.message.aggregate({
      where: { ...mine, createdAt: { gte: daysAgo(7) } },
      _count: { _all: true },
      _max: { createdAt: true, sentAt: true, deliveredAt: true, readAt: true, failedAt: true },
    }),
    db.order.aggregate({ where: owned(scope), _count: { _all: true }, _max: { updatedAt: true } }),
  ]);
  const v = [
    replies._count._all,
    t(replies._max.receivedAt),
    open,
    sent._count._all,
    t(sent._max.createdAt),
    t(sent._max.sentAt),
    t(sent._max.deliveredAt),
    t(sent._max.readAt),
    t(sent._max.failedAt),
    orders._count._all,
    t(orders._max.updatedAt),
  ].join(":");
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
