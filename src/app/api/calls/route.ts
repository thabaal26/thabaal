import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getScope, owned, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Meta stops ringing after about a minute, so older RINGING rows are stale. */
const RING_WINDOW_MS = 75_000;

/**
 * Calls ringing right now, polled by the dashboard so any open tab can answer.
 * With ?active=<id>, just that call's status, so the browser notices when the caller hangs up.
 */
export async function GET(req: NextRequest) {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();
  if (!scope.canOperate) return NextResponse.json({ calls: [] });

  const active = req.nextUrl.searchParams.get("active");
  if (active) {
    const call = await db.call.findFirst({ where: { id: active, ...owned(scope) }, select: { status: true, answerSdp: true } });
    return NextResponse.json({ status: call?.status ?? "ENDED", answerSdp: call?.answerSdp ?? null });
  }

  const calls = await db.call.findMany({
    where: { direction: "INCOMING", status: "RINGING", startedAt: { gte: new Date(Date.now() - RING_WINDOW_MS) }, offerSdp: { not: null }, ...owned(scope) },
    select: { id: true, fromPhone: true, callerName: true, offerSdp: true, customer: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json({ calls });
}
