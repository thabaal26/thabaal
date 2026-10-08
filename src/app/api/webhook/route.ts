import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { refreshNumberStatus } from "@/lib/limits";
import { explainError } from "@/lib/meta-errors";
import { applyFailure } from "@/lib/rules";
import { recordOrder } from "@/lib/orders";
import { metaReplyContent, receivingNumber, recordReply } from "@/lib/replies";
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

type StatusUpdate = { id: string; status: string; timestamp: string; pricing?: { category?: string; billable?: boolean }; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };

function validSignature(raw: string, header: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // signature check is optional until the secret is configured
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(header.slice(7));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function applyStatus(s: StatusUpdate) {
  const msg = await db.message.findUnique({ where: { waMessageId: s.id }, select: { id: true, status: true, customerId: true } });
  if (!msg) return;
  // Every status carries Meta's pricing; keep it for cost reporting even when the status itself is stale.
  if (s.pricing?.category)
    await db.message.update({ where: { id: msg.id }, data: { pricingCategory: s.pricing.category.toLowerCase(), billable: s.pricing.billable ?? null } });
  const at = new Date(Number(s.timestamp) * 1000);
  const next = s.status.toUpperCase();
  if (next === "FAILED") {
    const err = s.errors?.[0];
    const code = err?.code ?? null;
    await db.message.update({
      where: { id: msg.id },
      data: { status: "FAILED", failedAt: at, errorCode: code, error: explainError(code, err?.error_data?.details || err?.message || err?.title || "Delivery failed") },
    });
    await applyFailure(msg.customerId, code);
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
  const { customers } = await receivingNumber(phoneNumberId);
  await db.customer.updateMany({ where: { phone, ...customers }, data: { optedOut: true } });
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
          const { text, kind, media } = metaReplyContent(m);
          const phoneNumberId = v.metadata?.phone_number_id;
          if (OPT_OUT.test(text)) await optOut(m.from, phoneNumberId);
          const customer = await recordReply({ phone: m.from, text, kind, media, waMessageId: m.id, phoneNumberId, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined });
          if (customer && m.type === "order") await recordOrder(customer, m.id, m).catch((e) => console.error("Could not save order", e));
        }
      } else if (change.field === "phone_number_quality_update") {
        // Meta changed a number's quality or limit; it sends the display number, so match on digits.
        const digits = String(v.display_phone_number ?? "").replace(/\D/g, "");
        const numbers = await db.whatsAppNumber.findMany({ include: { client: { select: { waToken: true } } } });
        for (const n of numbers.filter((x) => digits && x.displayPhone?.replace(/\D/g, "") === digits)) {
          if (v.current_limit) await db.whatsAppNumber.update({ where: { id: n.id }, data: { messagingTier: v.current_limit } });
          await refreshNumberStatus(n, n.client.waToken);
        }
      } else if (change.field === "message_template_status_update") {
        await db.template.updateMany({
          where: { metaId: String(v.message_template_id) },
          data: { status: mapMetaStatus(v.event), statusReason: v.reason && v.reason !== "NONE" ? v.reason : null, lastSyncedAt: new Date() },
        });
      } else if (change.field === "template_category_update") {
        // Meta re-categorised a template (often utility → marketing), which changes pricing and quiet-hours rules.
        const category = String(v.new_category ?? "").toUpperCase();
        if (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(category))
          await db.template.updateMany({ where: { metaId: String(v.message_template_id) }, data: { category: category as never, lastSyncedAt: new Date() } });
      } else if (change.field === "message_template_quality_update") {
        await db.template.updateMany({
          where: { metaId: String(v.message_template_id) },
          data: { qualityScore: String(v.new_quality_score ?? "UNKNOWN").toUpperCase(), lastSyncedAt: new Date() },
        });
      } else if (change.field === "account_update" || change.field === "account_alerts") {
        // Restrictions, policy notices and verification results; logged so they show up in Vercel's logs.
        console.warn(`WhatsApp ${change.field}`, JSON.stringify(v));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
