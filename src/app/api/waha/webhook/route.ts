import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { wahaWebhookKey } from "@/lib/provider";
import { recordReply } from "@/lib/replies";
import { mapAck } from "@/lib/waha";

export const dynamic = "force-dynamic";

const RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 } as const;
const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel)\s*$/i;

type Event =
  | { event: "message.ack"; payload: { id: string; ack: number; ackName?: string } }
  | { event: "message"; payload: { id?: string; from: string; body?: string; fromMe?: boolean; hasMedia?: boolean; timestamp?: number } }
  | { event: string; payload: unknown };

function safeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

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
  const expectedKey = await wahaWebhookKey();
  const rawBody = await req.text();

  // 1. Verify Timestamp Freshness if provided (5-minute replay window) (WEB-04)
  const reqTimestamp = req.headers.get("x-webhook-timestamp") || req.headers.get("x-timestamp");
  if (reqTimestamp) {
    const ts = Number(reqTimestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - (ts > 1e11 ? ts : ts * 1000)) > 5 * 60 * 1000) {
      return new NextResponse("Webhook timestamp expired or invalid", { status: 401 });
    }
  }

  // 2. Multi-strategy Authentication (HMAC Header, Secret Header, or Legacy Query Key) (WEB-04)
  const hmacHeader =
    req.headers.get("x-webhook-hmac") ||
    req.headers.get("x-hub-signature-256") ||
    req.headers.get("x-webhook-signature");

  let authenticated = false;

  if (hmacHeader) {
    const cleanHeader = hmacHeader.replace(/^sha(256|512)=/i, "");
    const computedSha256 = createHmac("sha256", expectedKey).update(rawBody).digest("hex");
    const computedSha512 = createHmac("sha512", expectedKey).update(rawBody).digest("hex");
    authenticated = safeCompare(cleanHeader, computedSha256) || safeCompare(cleanHeader, computedSha512);
  }

  if (!authenticated) {
    const secretHeader = req.headers.get("x-webhook-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (secretHeader && safeCompare(secretHeader, expectedKey)) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    const queryKey = req.nextUrl.searchParams.get("key");
    if (queryKey && safeCompare(queryKey, expectedKey)) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let e: Event;
  try {
    e = JSON.parse(rawBody || "{}") as Event;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

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
    // Suppress own-session echoes
    if (p.fromMe) {
      return NextResponse.json({ ok: true, ignored: "fromMe" });
    }

    const phone = p.from.split("@")[0];
    if (!p.from.endsWith("@g.us")) {
      if (OPT_OUT.test(p.body ?? "")) {
        // Resolve tenant scope from recent outbound message to this phone (WEB-01)
        const recentMsg = await db.message.findFirst({
          where: { customer: { phone } },
          orderBy: { createdAt: "desc" },
          select: { customer: { select: { clientId: true } } },
        });

        if (recentMsg?.customer?.clientId) {
          await db.customer.updateMany({
            where: { phone, clientId: recentMsg.customer.clientId },
            data: { optedOut: true },
          });
        } else {
          // If no message found, check if only one client owns this phone
          const candidateCustomers = await db.customer.findMany({
            where: { phone },
            select: { id: true, clientId: true },
            take: 2,
          });
          if (candidateCustomers.length === 1) {
            await db.customer.update({
              where: { id: candidateCustomers[0].id },
              data: { optedOut: true },
            });
          } else {
            console.warn(`[WAHA STOP] Unresolved tenant for phone ${phone}. Global opt-out suppressed (WEB-01).`);
          }
        }
      }

      const text = p.body?.trim() || (p.hasMedia ? "[Photo or file]" : "");
      await recordReply({
        phone,
        text,
        kind: p.body?.trim() ? "text" : "media",
        waMessageId: p.id,
        anyClient: true,
        at: p.timestamp ? new Date(p.timestamp * 1000) : undefined,
      });
    }
  }
  return NextResponse.json({ ok: true });
}
