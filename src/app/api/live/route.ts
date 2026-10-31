import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getScope, owned, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A fingerprint of this business's orders (how many, and when one last changed). Pages like Orders and Payments
 * ask for it every few seconds and refresh themselves when it changes, e.g. when a payment arrives from WhatsApp.
 * Only the login's own business is counted; nothing about the orders themselves is returned.
 */
export async function GET() {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();
  const agg = await db.order.aggregate({ where: owned(scope), _max: { updatedAt: true }, _count: { _all: true } });
  return NextResponse.json({ v: `${agg._count._all}:${agg._max.updatedAt?.getTime() ?? 0}` }, { headers: { "Cache-Control": "no-store" } });
}
