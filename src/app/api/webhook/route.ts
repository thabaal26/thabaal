import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { refreshNumberStatus } from "@/lib/limits";
import { explainError } from "@/lib/meta-errors";
import { applyFailure } from "@/lib/rules";
import { recordOrder } from "@/lib/orders";
import { metaReplyContent, receivingNumber, recordReply } from "@/lib/replies";
import { orderWhereRef } from "@/lib/orders";
import { autoRequestPayment, confirmPayment } from "@/lib/payments";
import { autoSendCatalogue, firstMessageToday, wantsCatalogue } from "@/lib/catalog";
import { mapMetaStatus } from "@/lib/whatsapp";
import { JOIN_RE, joinFromWhatsApp } from "@/lib/optin";

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

type PaymentUpdate = {
  status?: string;
  payment?: { reference_id?: string; transaction?: { id?: string; status?: string } };
};

/** The customer paid (or failed to pay) through "Review and pay"; reference_id is our order number (RG-1001). */
async function applyPayment(s: PaymentUpdate) {
  const reference = s.payment?.reference_id;
  if (!reference) return;
  const txn = s.payment?.transaction;
  const paid = txn?.status === "success" || s.status === "captured";
  if (!paid) {
    console.warn("WhatsApp payment not completed", JSON.stringify(s));
    return;
  }
  const order = await db.order.findFirst({ where: orderWhereRef(reference), select: { id: true } });
  if (order) await confirmPayment(order.id, txn?.id);
}

/** STOP only opts out of the business whose number received it. */
async function optOut(phone: string, phoneNumberId?: string) {
  const { customers } = await receivingNumber(phoneNumberId);
  await db.customer.updateMany({ where: { phone, ...customers }, data: { optedOut: true } });
}

type CallEvent = { id: string; from?: string; to?: string; event?: string; direction?: string; status?: string; duration?: number; session?: { sdp?: string; sdp_type?: string } };
type CallStatusUpdate = { id: string; type?: string; status?: string };

/** A customer calling one of our numbers: "connect" rings the portal, "terminate" ends it. */
async function applyCall(c: CallEvent, v: { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[] }) {
  // A call we placed: the customer picked up and this carries their SDP answer for the dialling browser.
  if (c.event === "connect" && (c.session?.sdp_type === "answer" || c.direction === "BUSINESS_INITIATED")) {
    await db.call.upsert({
      where: { waCallId: c.id },
      update: { answerSdp: c.session?.sdp, status: "ANSWERED", answeredAt: new Date() },
      create: { waCallId: c.id, direction: "OUTGOING", fromPhone: c.to ?? "", answerSdp: c.session?.sdp, status: "ANSWERED", answeredAt: new Date() },
    });
  } else if (c.event === "connect" && c.from) {
    const { number, customers } = await receivingNumber(v.metadata?.phone_number_id);
    const customer = await db.customer.findFirst({ where: { phone: c.from, ...customers }, select: { id: true, clientId: true } });
    const callerName = v.contacts?.find((x) => x.wa_id === c.from)?.profile?.name ?? null;
    await db.call.upsert({
      where: { waCallId: c.id },
      update: {},
      create: {
        waCallId: c.id,
        senderId: number?.id,
        clientId: number?.clientId ?? customer?.clientId,
        customerId: customer?.id,
        fromPhone: c.from,
        callerName,
        offerSdp: c.session?.sdp,
      },
    });
  } else if (c.event === "terminate") {
    const call = await db.call.findUnique({ where: { waCallId: c.id }, select: { id: true, status: true } });
    if (!call) return;
    await db.call.update({
      where: { id: call.id },
      data: {
        status: call.status === "RINGING" ? "MISSED" : call.status === "REJECTED" ? "REJECTED" : "ENDED",
        endedAt: new Date(),
        duration: c.duration ?? null,
        offerSdp: null,
      },
    });
  }
}

/** Progress of a call we placed: ringing, accepted or declined by the customer. */
async function applyCallStatus(s: CallStatusUpdate) {
  const status = s.status?.toUpperCase();
  if (status === "REJECTED")
    await db.call.updateMany({ where: { waCallId: s.id, status: { in: ["RINGING", "ANSWERED"] } }, data: { status: "REJECTED", endedAt: new Date() } });
}

/** The customer's answer to "may we call you?"; Meta says until when the permission lasts. */
async function applyCallPermission(phone: string, phoneNumberId: string | undefined, reply: { response?: string; expiration_timestamp?: number | string }) {
  const { customers } = await receivingNumber(phoneNumberId);
  const until = reply.response === "accept"
    ? new Date(reply.expiration_timestamp ? Number(reply.expiration_timestamp) * 1000 : Date.now() + 7 * 86_400_000)
    : null;
  await db.customer.updateMany({ where: { phone, ...customers }, data: { callAllowedUntil: until } });
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
        for (const s of v.statuses ?? []) await (s.type === "payment" ? applyPayment(s) : applyStatus(s));
        for (const m of v.messages ?? []) {
          const { text, kind, media } = metaReplyContent(m);
          const phoneNumberId = v.metadata?.phone_number_id;
          if (OPT_OUT.test(text)) await optOut(m.from, phoneNumberId);
          if (m.interactive?.type === "call_permission_reply") await applyCallPermission(m.from, phoneNumberId, m.interactive.call_permission_reply ?? {});
          // "JOIN van" from an opt-in QR code or link: add them as an opted-in customer first.
          const join = JOIN_RE.exec(text);
          if (join) {
            const profileName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            await joinFromWhatsApp({ phone: m.from, profileName, source: join[1], phoneNumberId }).catch((e) => console.error("Could not add joining customer", e));
          }
          const customer = await recordReply({ phone: m.from, text, kind, media, waMessageId: m.id, phoneNumberId, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined });
          // Said hi, asked about products or prices (e.g. tapped "Send price list"), or wrote for the first time
          // today: reply with the free catalogue message (at most once every 12 hours).
          if (customer && m.type !== "order" && (wantsCatalogue(text, kind) || (await firstMessageToday(customer.id))))
            await autoSendCatalogue(customer.id).catch((e) => console.error("Automatic catalogue reply failed", e));
          if (customer && m.type === "order") {
            const order = await recordOrder(customer, m.id, m).catch((e) => (console.error("Could not save order", e), null));
            // A new cart: send "Review and pay" right away while the customer is in the chat.
            if (order) await autoRequestPayment(order).catch((e) => console.error("Automatic payment request failed", e));
          }
        }
      } else if (change.field === "calls") {
        for (const c of v.calls ?? []) await applyCall(c, v);
        for (const st of v.statuses ?? []) await applyCallStatus(st);
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
