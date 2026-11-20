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

  // 1. Multi-strategy Authentication (Native HMAC-SHA512 Header, Secret Header, or Query Key) (WEB-04)
  const hmacHeader =
    req.headers.get("x-webhook-hmac") ||
    req.headers.get("x-hub-signature-256") ||
    req.headers.get("x-hub-signature-512") ||
    req.headers.get("x-webhook-signature");

  let authenticated = false;

  if (hmacHeader) {
    const cleanHeader = hmacHeader.replace(/^sha(256|512)=/i, "");
    // WAHA official documentation specifies native HMAC-SHA512 over the raw request body
    const computedSha512 = createHmac("sha512", expectedKey).update(rawBody).digest("hex");
    const computedSha256 = createHmac("sha256", expectedKey).update(rawBody).digest("hex");
    authenticated = safeCompare(cleanHeader, computedSha512) || safeCompare(cleanHeader, computedSha256);
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

  // 2. Body-level Timestamp Freshness Verification (WEB-04)
  const sessionName = (e as { session?: string }).session;

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

    // Freshness filtering must check the timestamp inside the HMAC-verified body (WEB-04)
    if (p.timestamp) {
      const bodyTs = p.timestamp > 1e11 ? p.timestamp : p.timestamp * 1000;
      if (Math.abs(Date.now() - bodyTs) > 5 * 60 * 1000) {
        return new NextResponse("Webhook body timestamp expired", { status: 401 });
      }
    }

    // Suppress own-session echoes
    if (p.fromMe) {
      return NextResponse.json({ ok: true, ignored: "fromMe" });
    }

    // Replay Protection (WEB-04): Durable idempotency via database uniqueness
    if (p.id) {
      const existingReply = await db.reply.findUnique({
        where: { waMessageId: p.id },
        select: { id: true },
      });
      if (existingReply) {
        return NextResponse.json({ ok: true, duplicate: true, eventId: p.id });
      }
    }

    const phone = p.from.split("@")[0];
    if (!p.from.endsWith("@g.us")) {
      // Resolve tenant ownership strictly from explicit WAHA session-to-tenant mapping (WEB-01)
      // Per-tenant WhatsAppNumber.label / phoneNumberId is authoritative.
      // Conflicting or duplicate session mappings across tenants must strictly fail closed.
      let resolvedClientId: string | null = null;
      let resolvedSenderId: string | null = null;

      if (sessionName) {
        const matchedNumbers = await db.whatsAppNumber.findMany({
          where: {
            OR: [
              { label: sessionName },
              { phoneNumberId: sessionName },
            ],
          },
          select: { id: true, clientId: true },
        });

        if (matchedNumbers.length === 1 && matchedNumbers[0].clientId) {
          resolvedClientId = matchedNumbers[0].clientId;
          resolvedSenderId = matchedNumbers[0].id;
        } else if (matchedNumbers.length > 1) {
          console.warn(`[WAHA WEBHOOK] Ambiguous session mapping: '${sessionName}' matches ${matchedNumbers.length} numbers across tenants. Failing closed (WEB-01).`);
          return new NextResponse("Conflict: Ambiguous session mapping", { status: 409 });
        } else {
          console.warn(`[WAHA WEBHOOK] Unmapped session '${sessionName}'. Failed-closed without customer mutation (WEB-01).`);
        }
      }

      if (OPT_OUT.test(p.body ?? "")) {
        if (resolvedClientId) {
          await db.customer.updateMany({
            where: { phone, clientId: resolvedClientId },
            data: { optedOut: true },
          });
        }
      }

      const text = p.body?.trim() || (p.hasMedia ? "[Photo or file]" : "");
      if (resolvedClientId) {
        await recordReply({
          phone,
          text,
          kind: p.body?.trim() ? "text" : "media",
          waMessageId: p.id,
          anyClient: false,
          phoneNumberId: sessionName,
          at: p.timestamp ? new Date(p.timestamp * 1000) : undefined,
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
