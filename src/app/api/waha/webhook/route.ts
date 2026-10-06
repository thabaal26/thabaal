import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { wahaWebhookKey } from "@/lib/provider";
import { mapAck } from "@/lib/waha";

export const dynamic = "force-dynamic";

const RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 } as const;
const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel)\s*$/i;

type Event =
  | { event: "message.ack"; payload: { id: string; ack: number; ackName?: string } }
  | { event: "message"; payload: { from: string; body?: string; fromMe?: boolean } }
  | { event: string; payload: unknown };

/** Finds our message by WAHA id, tolerating the short and long id formats engines use. */
async function findMessage(id: string) {
  const exact = await db.message.findUnique({ where: { waMessageId: id }, select: { id: true, status: true } });
  if (exact) return exact;
  const short = id.split("_").pop();
  return short
    ? db.message.findFirst({ where: { provider: "LOCAL", waMessageId: { endsWith: `_${short}` } }, select: { id: true, status: true } })
    : null;
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== (await wahaWebhookKey())) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const e = (await req.json().catch(() => ({}))) as Event;

  if (e.event === "message.ack") {
    const p = (e as Extract<Event, { event: "message.ack" }>).payload;
    const next = mapAck(p.ack);
    const msg = next && (await findMessage(p.id));
    if (msg && next) {
      const now = new Date();
      if (next === "FAILED") {
        await db.message.update({ where: { id: msg.id }, data: { status: "FAILED", failedAt: now, error: "WhatsApp could not deliver this message" } });
      } else if (RANK[next] > RANK[msg.status]) {
        await db.message.update({
          where: { id: msg.id },
          data: {
            status: next,
            ...((next === "DELIVERED" || next === "READ") && { deliveredAt: now }),
            ...(next === "READ" && { readAt: now }),
          },
        });
      }
    }
  } else if (e.event === "message") {
    const p = (e as Extract<Event, { event: "message" }>).payload;
    if (!p.fromMe && OPT_OUT.test(p.body ?? "")) {
      // Every client sends through the one local session, so STOP opts out of all of them.
      await db.customer.updateMany({ where: { phone: p.from.split("@")[0] }, data: { optedOut: true } });
    }
  }
  return NextResponse.json({ ok: true });
}
