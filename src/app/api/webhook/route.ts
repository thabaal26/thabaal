import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pushOrderToSheet, pushToGoogleSheet } from "@/lib/google-sheets-live";
import { refreshNumberStatus } from "@/lib/limits";
import { recordMetaAccountAlert } from "@/lib/meta-balance";
import { explainError } from "@/lib/meta-errors";
import { applyFailure } from "@/lib/rules";
import { money, orderRef, orderWhereRef, recordOrder } from "@/lib/orders";
import { metaReplyContent, receivingNumber, recordReply } from "@/lib/replies";
import { autoRequestPayment, confirmPayment, recordPaymentClaim, recordPaymentFailure } from "@/lib/payments";
import { autoReplyToButton, autoSendCatalogue, catalogueTrigger, firstMessageToday } from "@/lib/catalog";
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
  const msg = await db.message.findUnique({
    where: { waMessageId: s.id },
    select: {
      id: true,
      status: true,
      customerId: true,
      templateName: true,
      pricingCategory: true,
      template: { select: { category: true } },
      customer: { select: { phone: true, name: true, client: { select: { name: true } } } },
    },
  });
  if (!msg) return;
  const clientName = msg.customer?.client?.name || "Thabaal";
  // Every status carries Meta's pricing; keep it for cost reporting even when the status itself is stale.
  if (s.pricing?.category) {
    await db.message.update({ where: { id: msg.id }, data: { pricingCategory: s.pricing.category.toLowerCase(), billable: s.pricing.billable ?? null } });
  } else if (!msg.pricingCategory && (s.status.toUpperCase() === "DELIVERED" || s.status.toUpperCase() === "READ")) {
    const inferred = msg.template?.category?.toLowerCase() ?? (["Catalogue", "Price list", "Payment request", "Freeform reply", "Auto reply"].includes(msg.templateName) ? "service" : null);
    if (inferred) {
      await db.message.update({ where: { id: msg.id }, data: { pricingCategory: inferred, billable: inferred !== "service" } });
    }
  }
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
    pushToGoogleSheet("CAMPAIGN_STATUS", {
      campaign: msg.templateName || "Campaign Message",
      phone: msg.customer?.phone || "",
      status: "FAILED",
      waMessageId: s.id,
      client: clientName,
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

  pushToGoogleSheet("CAMPAIGN_STATUS", {
    campaign: msg.templateName || "Campaign Message",
    phone: msg.customer?.phone || "",
    status: next,
    waMessageId: s.id,
    client: clientName,
  });
}

type PaymentUpdate = {
  id?: string;
  status?: string;
  recipient_id?: string;
  payment?: {
    reference_id?: string;
    amount?: { value?: number; offset?: number };
    transaction?: { id?: string; status?: string; error?: { code?: string | number; reason?: string; message?: string } };
  };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

/** The customer paid (or failed to pay) through "Review and pay"; reference_id is our order number (RG-1001). */
async function applyPayment(s: PaymentUpdate, phoneNumberId?: string) {
  const txn = s.payment?.transaction;
  const paid =
    txn?.status === "success" ||
    txn?.status === "completed" ||
    s.status === "captured" ||
    s.status === "paid" ||
    s.status === "completed";
  const failed = !paid && (txn?.status === "failed" || s.status === "failed" || Boolean(txn?.error) || Boolean(s.errors?.length));
  if (!paid && !failed) {
    // pending / processing: the final update follows.
    console.warn("WhatsApp payment not completed yet", JSON.stringify(s));
    return;
  }
  const reference = s.payment?.reference_id;
  let order = reference
    ? await db.order.findFirst({ where: orderWhereRef(reference), select: { id: true, number: true, total: true, currency: true } })
    : null;
  if (!order && s.recipient_id) {
    const { customers } = await receivingNumber(phoneNumberId);
    const cust = await db.customer.findFirst({ where: { phone: s.recipient_id, ...customers }, select: { id: true } });
    if (cust) {
      order = await db.order.findFirst({
        where: { customerId: cust.id, paidAt: null, status: { in: ["NEW", "CONFIRMED"] }, paymentRequestedAt: { not: null } },
        orderBy: [{ paymentRequestedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, number: true, total: true, currency: true },
      });
    }
  }
  if (!order) return;
  if (failed) {
    const reason = txn?.error?.reason ?? txn?.error?.message ?? s.errors?.[0]?.error_data?.details ?? s.errors?.[0]?.title ?? "The UPI payment didn't go through";
    await recordPaymentFailure(order.id, String(reason));
    return;
  }
  // Meta sends the amount in paise-like units: value / 10^offset.
  const amt = s.payment?.amount;
  const amount = amt?.value != null ? amt.value / 10 ** (amt.offset ?? 2) : null;
  await confirmPayment(order.id, txn?.id ?? s.id ?? null, { method: "upi_whatsapp", source: "meta", amount });
}

const NEGATIVE_PAY_RE = /\b(not\s+paid|haven'?t\s+paid|didn'?t\s+pay|how\s+to\s+pay|will\s+pay|pay\s+later|failed|pending|error|issue|problem|unable|can'?t\s+pay|cannot\s+pay)\b/i;
const POSITIVE_PAY_RE = /\b(paid|payment\s+(done|sent|completed|successful|success)|gpay\s+done|phonepe\s+done|paytm\s+done|upi\s+(done|paid|sent)|money\s+sent|amount\s+(sent|paid))\b/i;
const UTR_RE = /\b(\d{12})\b/;
const COD_ASK_RE = /\b(cod|cash\s+on\s+delivery|pay\s+(by|in|with)\s+cash|cash\s+payment|pay\s+on\s+delivery)\b/i;
const NO_COD_RE = /\b(no|not|don'?t|without)\s+(cod|cash)\b/i;

/**
 * Detects when an inbound WhatsApp message represents a completed UPI payment (from WhatsApp's native
 * "Pay now" bubble across any UPI app, or an explicit GPay/PhonePe/Paytm UTR/confirmation text, or a payment screenshot).
 */
async function detectAndApplyUpiPayment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: Record<string, any>,
  phoneNumberId: string | undefined,
  base: { text: string; kind: "text" | "button" | "media" | "order"; media?: { id: string; type: string } },
): Promise<{ text: string; kind: "text" | "button" | "media" | "order"; media?: { id: string; type: string }; handledAsPayment: boolean }> {
  if (!m.from || m.type === "order") return { ...base, handledAsPayment: false };

  const { customers } = await receivingNumber(phoneNumberId);
  const cust = await db.customer.findFirst({
    where: { phone: m.from, ...customers },
    select: {
      id: true,
      orders: {
        where: { paidAt: null, status: { in: ["NEW", "CONFIRMED"] } },
        orderBy: [{ paymentRequestedAt: "desc" }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, number: true, total: true, currency: true, paymentRequestedAt: true, createdAt: true },
      },
    },
  });
  if (!cust || !cust.orders.length) return { ...base, handledAsPayment: false };

  // 1. Try matching the exact order via payment.reference_id, context message ID, or RG-xxxx in text
  let targetOrder = cust.orders[0];
  const explicitRef = m.payment?.reference_id ?? /\b(RG-\d{4,})\b/i.exec(base.text)?.[1];
  if (explicitRef) {
    const matched = cust.orders.find((o) => orderRef(o).toUpperCase() === String(explicitRef).toUpperCase());
    if (matched) targetOrder = matched;
  } else if (m.context?.id) {
    const ctxMsg = await db.message.findUnique({ where: { waMessageId: String(m.context.id) }, select: { body: true } });
    const ctxRef = ctxMsg?.body ? /\b(RG-\d{4,})\b/i.exec(ctxMsg.body)?.[1] : null;
    if (ctxRef) {
      const matched = cust.orders.find((o) => orderRef(o).toUpperCase() === ctxRef.toUpperCase());
      if (matched) targetOrder = matched;
    }
  }

  const ref = orderRef(targetOrder);
  const totalFormatted = money(targetOrder.total, targetOrder.currency);
  const hasRecentPaymentRequest =
    Boolean(targetOrder.paymentRequestedAt) &&
    Date.now() - targetOrder.paymentRequestedAt!.getTime() < 7 * 86_400_000;

  // Path A: Native WhatsApp UPI payment bubble (triggered when customer pays via GPay/PhonePe/Paytm/WhatsApp Pay from "Pay now" button).
  // With a direct merchant_vpa (UPI Intent), Meta Cloud API delivers the blue "Sent to <Merchant> · Completed" bubble in v.messages[]
  // as type "errors" or "unsupported" (131051) or "payment".
  const isNativePaymentBubble = m.type === "payment" || Boolean(m.payment) || m.interactive?.type === "payment";

  if (isNativePaymentBubble) {
    const txnId = m.payment?.transaction?.id ?? m.id ?? "WA-UPI";
    await confirmPayment(targetOrder.id, String(txnId), { method: "upi_whatsapp", source: "meta" }).catch((e) => console.error("Auto confirmPayment on UPI bubble failed", e));
    return {
      text: `UPI payment completed on WhatsApp (${totalFormatted} for ${ref})`,
      kind: "order",
      media: base.media,
      handledAsPayment: true,
    };
  }

  // A bubble WhatsApp can't show us (often "Sent to <shop> · Completed" from a UPI app) right after a pay link:
  // likely a payment, but nothing proves it, so staff verify it against the UPI app before packing.
  if ((m.type === "errors" || m.type === "unsupported") && hasRecentPaymentRequest) {
    await recordPaymentClaim(targetOrder.id, "WhatsApp showed a payment message we can't read. Check your UPI app for this amount.").catch(() => {});
    return { text: `Possible UPI payment for ${ref} (${totalFormatted}) · check and verify`, kind: "order", media: base.media, handledAsPayment: true };
  }

  // The customer asks to pay cash on delivery: set it on the order (staff can switch it back to online).
  if (m.type === "text" && COD_ASK_RE.test(base.text) && !NO_COD_RE.test(base.text)) {
    await db.order.updateMany({ where: { id: targetOrder.id, paymentMethod: null }, data: { paymentMethod: "cod" } });
    return { text: `${base.text} · Asked for cash on delivery on ${ref}`, kind: base.kind, media: base.media, handledAsPayment: false };
  }

  // Path B: Customer paid via external UPI app (GPay / PhonePe / Paytm / BHIM) and sent UTR or explicit payment confirmation text.
  if (m.type === "text" && hasRecentPaymentRequest && !NEGATIVE_PAY_RE.test(base.text)) {
    const utrMatch = UTR_RE.exec(base.text);
    const isExplicitPaidText = POSITIVE_PAY_RE.test(base.text) || Boolean(utrMatch && /\b(utr|ref|upi|txn|paid|sent|done)\b/i.test(base.text));
    if (isExplicitPaidText) {
      // Anyone can type "paid" or 12 digits, so nothing here marks the order paid: staff check the UPI app or
      // bank (the reference makes that quick) and confirm with one tap, and the order isn't packed until then.
      if (utrMatch) {
        await recordPaymentClaim(targetOrder.id, `UPI reference ${utrMatch[1]} sent by the customer`, `UTR-${utrMatch[1]}`).catch(() => {});
        return { text: `${base.text} · Says paid ${ref} (${totalFormatted}), UPI ref ${utrMatch[1]} · check`, kind: "order", media: base.media, handledAsPayment: true };
      }
      await recordPaymentClaim(targetOrder.id, `Customer wrote: "${base.text.slice(0, 200)}"`).catch(() => {});
      return { text: `${base.text} · Says paid for ${ref} (${totalFormatted}) · verify`, kind: "order", media: base.media, handledAsPayment: true };
    }
  }

  // Path C: Customer sent a Photo screenshot right after a UPI payment request.
  if (m.type === "image" && hasRecentPaymentRequest) {
    const caption = m.image?.caption?.trim();
    // A caption saying "paid" or carrying a 12-digit UTR: flag it with the reference for staff to check.
    if (caption && !NEGATIVE_PAY_RE.test(caption) && (POSITIVE_PAY_RE.test(caption) || UTR_RE.test(caption))) {
      const utrMatch = UTR_RE.exec(caption);
      await recordPaymentClaim(
        targetOrder.id,
        utrMatch ? `Payment screenshot with UPI reference ${utrMatch[1]}` : `Payment screenshot: "${caption.slice(0, 200)}"`,
        utrMatch ? `UTR-${utrMatch[1]}` : null,
      ).catch(() => {});
      return {
        text: `UPI payment screenshot (${totalFormatted} for ${ref}): ${caption}`,
        kind: "media",
        media: base.media,
        handledAsPayment: true,
      };
    }
    await recordPaymentClaim(targetOrder.id, caption ? `Photo after the pay link: "${caption.slice(0, 200)}"` : "Photo sent after the pay link (maybe a payment screenshot)").catch(() => {});
    return {
      text: caption
        ? `Payment screenshot for ${ref} (${totalFormatted}): ${caption}`
        : `[Payment screenshot / Photo for ${ref} (${totalFormatted})]`,
      kind: "media",
      media: base.media,
      handledAsPayment: false,
    };
  }

  return { ...base, handledAsPayment: false };
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
        for (const s of v.statuses ?? []) {
          await (s.type === "payment" || Boolean(s.payment)
            ? applyPayment(s, v.metadata?.phone_number_id)
            : applyStatus(s));
        }
        for (const m of v.messages ?? []) {
          const base = metaReplyContent(m);
          const phoneNumberId = v.metadata?.phone_number_id;
          const { text, kind, media, handledAsPayment } = await detectAndApplyUpiPayment(m, phoneNumberId, base);
          if (OPT_OUT.test(text)) await optOut(m.from, phoneNumberId);
          if (m.interactive?.type === "call_permission_reply") await applyCallPermission(m.from, phoneNumberId, m.interactive.call_permission_reply ?? {});
          // "JOIN van" from an opt-in QR code or link: add them as an opted-in customer first.
          const join = JOIN_RE.exec(text);
          if (join) {
            const profileName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            await joinFromWhatsApp({ phone: m.from, profileName, source: join[1], phoneNumberId }).catch((e) => console.error("Could not add joining customer", e));
          }
          const customer = await recordReply({ phone: m.from, text, kind, media, waMessageId: m.id, phoneNumberId, at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : undefined });
          const clientName = customer?.client?.name || "Thabaal";

          if (kind === "button") {
            const contactName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            const actionVal = m.button?.payload ?? m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? text;
            pushToGoogleSheet("BUTTON_CLICK", {
              phone: m.from,
              name: customer?.name || contactName || "",
              campaign: "WhatsApp Portal",
              buttonText: text,
              actionValue: actionVal,
              client: clientName,
            });
          } else if (m.type !== "order") {
            const contactName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            pushToGoogleSheet("NEW_CHAT", {
              phone: m.from,
              name: customer?.name || contactName || "",
              message: text,
              source: join ? `Opt-in (${join[1]})` : handledAsPayment ? "UPI Payment" : "Inbound WhatsApp",
              client: clientName,
            });
          }

          // Said hi, asked about products or prices (e.g. tapped "Send price list"), or wrote for the first time
          // today: reply with the free catalogue message (at most once every 12 hours).
          // Buttons with their own answer ("Make a gift pack", "Happy Deepavali") get that instead.
          const isSystemOrPayment = handledAsPayment || m.type === "order" || m.type === "errors" || m.type === "unsupported" || m.type === "payment";
          const answered = customer && !isSystemOrPayment ? await autoReplyToButton(customer.id, text, kind).catch((e) => (console.error("Automatic button reply failed", e), true)) : false;
          if (customer && !isSystemOrPayment && !answered) {
            const trigger = catalogueTrigger(text, kind) ?? ((await firstMessageToday(customer.id)) ? "greeting" : null);
            if (trigger) await autoSendCatalogue(customer.id, trigger).catch((e) => console.error("Automatic catalogue reply failed", e));
          }
          if (customer && m.type === "order") {
            const order = await recordOrder(customer, m.id, m).catch((e) => (console.error("Could not save order", e), null));
            // A new cart: send "Review and pay" right away while the customer is in the chat.
            if (order) {
              await autoRequestPayment(order).catch((e) => console.error("Automatic payment request failed", e));
              pushOrderToSheet(order.id, "NEW_ORDER");
            }
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
        // Restrictions, policy notices and verification results: persist for notifications and refresh numbers.
        console.warn(`WhatsApp ${change.field}`, JSON.stringify(v));
        const wabaId = String(entry.id ?? "");
        await recordMetaAccountAlert({ wabaId, field: change.field, value: v });
        if (wabaId) {
          const numbers = await db.whatsAppNumber.findMany({
            where: { businessAccountId: wabaId },
            include: { client: { select: { waToken: true } } },
          });
          for (const n of numbers) {
            await refreshNumberStatus(n, n.client.waToken).catch(() => {});
          }
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}
