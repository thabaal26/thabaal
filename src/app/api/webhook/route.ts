import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { mapMetaStatus } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Meta calls GET once to verify the webhook URL.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge"), { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

const RANK = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4, SKIPPED: 4 } as const;
const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel)\s*$/i;

type StatusUpdate = { id: string; status: string; timestamp: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] };

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // signature check is optional until the secret is configured
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function applyStatus(s: StatusUpdate) {
  const msg = await db.message.findUnique({ where: { waMessageId: s.id }, select: { id: true, status: true } });
  if (!msg) return;
  const at = new Date(Number(s.timestamp) * 1000);
  const next = s.status.toUpperCase();
  if (next === "FAILED") {
    const err = s.errors?.[0];
    await db.message.update({
      where: { id: msg.id },
      data: { status: "FAILED", failedAt: at, error: err?.error_data?.details || err?.message || err?.title || "Delivery failed" },
    });
    return;
  }
  if (!(next in RANK) || RANK[next as keyof typeof RANK] <= RANK[msg.status]) return;
  await db.message.update({
    where: { id: msg.id },
    data: {
      status: next as "SENT" | "DELIVERED" | "READ",
      ...(next === "DELIVERED" && { deliveredAt: at }),
      ...(next === "READ" && { readAt: at }),
    },
  });
}

/** STOP only opts out of the business whose number received it. */
async function optOut(phone: string, phoneNumberId?: string) {
  const owner = phoneNumberId ? await db.client.findUnique({ where: { waPhoneNumberId: phoneNumberId }, select: { id: true } }) : null;
  // Clients without their own number all share the env-configured one.
  const client = owner ? { clientId: owner.id } : { client: { waPhoneNumberId: null } };
  await db.customer.updateMany({ where: { phone, ...client }, data: { optedOut: true } });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const payload = JSON.parse(raw);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (change.field === "messages") {
        for (const s of v.statuses ?? []) await applyStatus(s);
        for (const m of v.messages ?? []) {
          const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? "";
          if (OPT_OUT.test(text)) await optOut(m.from, v.metadata?.phone_number_id);
        }
      } else if (change.field === "message_template_status_update") {
        await db.template.updateMany({
          where: { metaId: String(v.message_template_id) },
          data: { status: mapMetaStatus(v.event), statusReason: v.reason && v.reason !== "NONE" ? v.reason : null, lastSyncedAt: new Date() },
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
