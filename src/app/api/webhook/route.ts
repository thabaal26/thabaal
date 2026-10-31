import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pushOrderToSheet, pushToGoogleSheet } from "@/lib/google-sheets-live";
import { refreshNumberStatus } from "@/lib/limits";
import { recordMetaAccountAlert } from "@/lib/meta-balance";
import { recordMetaSignup } from "@/lib/meta-signup";
import { explainError } from "@/lib/meta-errors";
import { applyFailure } from "@/lib/rules";
import { money, orderRef, orderWhereRef, recordOrder } from "@/lib/orders";
import { ORDER_REF_RE } from "@/lib/order-ref";
import { metaReplyContent, receivingNumber, recordReply } from "@/lib/replies";
import { autoRedeemPoints } from "@/lib/loyalty-redeem";
import { ADDRESS_FORM, askNewAddress, confirmSavedAddress, handleAddressReply, sendAddressFallback, startAddressStep } from "@/lib/delivery-address";
import { codBlocked } from "@/lib/pay-settings";
import { paySettingsFor } from "@/lib/pay-settings-server";
import { cancelSupersededOrdersForCustomer, confirmPayment, parseMetaAmount, recordPaymentClaim, recordPaymentFailure, sendCodConfirmationPrompt, sendPaymentRequestFor, startCheckout, textInWindow, updateOrderCard } from "@/lib/payments";
import { autoReplyToButton, autoSendCatalogue, catalogueTrigger, firstMessageToday } from "@/lib/catalog";
import { mapMetaStatus } from "@/lib/whatsapp";
import { findUtr, logPaymentEvent } from "@/lib/payment-events";
import { JOIN_RE, joinFromWhatsApp } from "@/lib/optin";
import { chargeMessage } from "@/lib/wallet";

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
const OPT_OUT = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|dont\s*send|don't\s*send|no\s*more|நிறுத்து|வேண்டாம்|बंद\s*करो)\s*$/i;

type StatusUpdate = { id: string; status: string; timestamp: string; pricing?: { category?: string; billable?: boolean }; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };

/**
 * "signed": Meta's signature checks out. "unchecked": no app secret is configured, so messages are still taken
 * (nothing is lost) but nothing in them can mark an order paid; payments become "customer says paid" for staff
 * to verify. "invalid": a wrong or missing signature while a secret is configured; rejected.
 */
type SignatureCheck = "signed" | "unchecked" | "invalid";

function checkSignature(raw: string, header: string | null): SignatureCheck {
  const secret = process.env.META_APP_SECRET;
  if (!secret || secret === "[SENSITIVE]") return "unchecked";
  if (!header?.startsWith("sha256=")) return "invalid";
  try {
    const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
    const given = Buffer.from(header.slice(7));
    return expected.length === given.length && timingSafeEqual(expected, given) ? "signed" : "invalid";
  } catch {
    return "invalid";
  }
}

const UNVERIFIED_NOTE = "WhatsApp reported a payment, but the webhook couldn't be verified (META_APP_SECRET is not set). Check your UPI app before packing.";

/** A transaction status other than success: failed, pending, expired. */
const notSucceeded = (status: unknown) => typeof status === "string" && !["success", "completed", "captured", "paid"].includes(status.toLowerCase());

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
      customer: { select: { phone: true, name: true, clientId: true, client: { select: { name: true } } } },
    },
  });
  if (!msg) return;
  const clientName = msg.customer?.client?.name || "Thabaal";
  // Every status carries Meta's pricing; keep it for cost reporting even when the status itself is stale.
  if (s.pricing?.category) {
    await db.message.update({ where: { id: msg.id }, data: { pricingCategory: s.pricing.category.toLowerCase(), billable: s.pricing.billable ?? null } });
    // Thabaal-wallet clients pay for what Meta charges: delivered messages Meta marks billable (charged once).
    if (s.pricing.billable === true && ["DELIVERED", "READ"].includes(s.status.toUpperCase())) {
      await chargeMessage(msg.id, s.pricing.category.toLowerCase()).catch((e) => console.error("[wallet] charge failed", msg.id, e));
    }
  } else if (!msg.pricingCategory && (s.status.toUpperCase() === "DELIVERED" || s.status.toUpperCase() === "READ")) {
    const inferred = msg.template?.category?.toLowerCase() ?? (["Catalogue", "Price list", "Payment request", "Freeform reply", "Auto reply", "Typed reply", "Media reply"].includes(msg.templateName) ? "service" : null);
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
      data: { status: "FAILED", failedAt: at, billable: false, errorCode: code, error: explainError(code, err?.error_data?.details || err?.message || err?.title || "Delivery failed") },
    });
    await applyFailure(msg.customerId, code);
    // The address form can't show on this customer's WhatsApp (old app): ask them to type it or share a location.
    if (code === 1026 && msg.templateName === ADDRESS_FORM) await sendAddressFallback(msg.customerId).catch((e) => console.error("Address fallback failed", e));
    pushToGoogleSheet(msg.customer?.clientId, "CAMPAIGN_STATUS", {
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

  pushToGoogleSheet(msg.customer?.clientId, "CAMPAIGN_STATUS", {
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
    currency?: string;
    transaction?: { id?: string; status?: string; error?: { code?: string | number; reason?: string; message?: string } };
  };
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

/** The customer paid (or failed to pay) through "Review and pay"; reference_id is our order number (e.g. FM-1001). */
async function applyPayment(s: PaymentUpdate, phoneNumberId: string | undefined, signed: boolean) {
  const txn = s.payment?.transaction;
  const paid =
    txn?.status === "success" ||
    txn?.status === "completed" ||
    s.status === "captured" ||
    s.status === "paid" ||
    s.status === "completed";
  const failed = !paid && (txn?.status === "failed" || s.status === "failed" || Boolean(txn?.error) || Boolean(s.errors?.length));
  const reference = s.payment?.reference_id;
  const { number: receiver, customers } = await receivingNumber(phoneNumberId);
  // Every payment update is kept with Meta's full message (and the bank reference, if Meta sent one).
  const utr = findUtr(s);
  const logEvent = (orderId: string | null, note?: string) =>
    logPaymentEvent({
      clientId: receiver?.clientId ?? null,
      orderId,
      source: "meta_status",
      status: paid ? "paid" : failed ? "failed" : String(txn?.status ?? s.status ?? "pending"),
      transactionId: txn?.id ?? null,
      utr,
      amount: parseMetaAmount(s.payment?.amount),
      currency: s.payment?.currency ?? null,
      note: note ?? (reference ? `Order ${reference}` : null),
      raw: s,
    });
  if (!paid && !failed) {
    // pending / processing: the final update follows.
    console.warn("WhatsApp payment not completed yet", JSON.stringify(s));
    await logEvent(null);
    return;
  }
  // The order must belong to the business whose number received the payment.
  let order = reference
    ? await db.order.findFirst({
        // A number Thabaal doesn't know only reaches businesses without numbers of their own (like customers above),
        // so another business's order reference is never paid from it.
        where: { ...orderWhereRef(reference), ...(receiver ? { clientId: receiver.clientId } : { client: { numbers: { none: {} } } }) },
        select: { id: true, number: true, ref: true, total: true, currency: true },
      })
    : null;
  if (!order && s.recipient_id) {
    const cust = await db.customer.findFirst({ where: { phone: s.recipient_id, ...customers }, select: { id: true } });
    if (cust) {
      order = await db.order.findFirst({
        where: { customerId: cust.id, paidAt: null, status: { in: ["NEW", "CONFIRMED"] }, paymentRequestedAt: { not: null } },
        orderBy: [{ paymentRequestedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true, number: true, ref: true, total: true, currency: true },
      });
    }
  }
  await logEvent(order?.id ?? null, order ? undefined : `No matching order for ${reference ?? "this payment"}`);
  if (!order) return;
  if (failed) {
    const reason = txn?.error?.reason ?? txn?.error?.message ?? s.errors?.[0]?.error_data?.details ?? s.errors?.[0]?.title ?? "The UPI payment didn't go through";
    await recordPaymentFailure(order.id, String(reason));
    return;
  }
  if (utr) await db.order.updateMany({ where: { id: order.id, paymentUtr: null }, data: { paymentUtr: utr } }).catch(() => {});
  // Meta sends the amount in paise-like units: value / offset (divisor 100) or value / 10^offset (exponent 2).
  const amount = parseMetaAmount(s.payment?.amount);
  if (amount != null && !(amount > 0)) {
    await recordPaymentClaim(order.id, "WhatsApp reported a payment of ₹0. Check your UPI app before packing.").catch(() => {});
    return;
  }
  if (!signed) {
    await recordPaymentClaim(order.id, UNVERIFIED_NOTE, txn?.id ?? null).catch(() => {});
    return;
  }
  // A payment in another currency is never counted as this order's money; staff check it.
  const currency = s.payment?.currency;
  if (currency && currency.toUpperCase() !== order.currency.toUpperCase()) {
    await recordPaymentClaim(order.id, `WhatsApp reported a payment in ${currency.toUpperCase()}, but the order is in ${order.currency}. Check your UPI app before packing.`, txn?.id ?? null).catch(() => {});
    return;
  }
  // confirmPayment keeps a smaller amount as a part payment, so the order is only "Paid" when the full total arrived.
  await confirmPayment(order.id, txn?.id ?? s.id ?? null, { method: "upi_whatsapp", source: "meta", amount, utr });
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
  signed: boolean,
): Promise<{ text: string; kind: "text" | "button" | "media" | "order"; media?: { id: string; type: string }; handledAsPayment: boolean }> {
  if (!m.from || m.type === "order") return { ...base, handledAsPayment: false };

  const { customers } = await receivingNumber(phoneNumberId);
  const cust = await db.customer.findFirst({
    where: { phone: m.from, ...customers },
    select: {
      id: true,
      orders: {
        where: { paidAt: null, status: { in: ["NEW", "CONFIRMED"] } },
        // The order last asked for payment first (orders never asked come after, newest first). Postgres puts empty
        // dates first in a descending sort, so without nulls: "last" an unrequested order would win.
        orderBy: [{ paymentRequestedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        take: 5,
        select: { id: true, number: true, ref: true, total: true, currency: true, paymentRequestedAt: true, createdAt: true },
      },
    },
  });
  if (!cust || !cust.orders.length) return { ...base, handledAsPayment: false };

  // 1. Try matching the exact order via payment.reference_id, context message ID, or an order number in the text
  let targetOrder = cust.orders[0];
  const explicitRef = m.payment?.reference_id ?? ORDER_REF_RE.exec(base.text)?.[1];
  if (explicitRef) {
    const matched = cust.orders.find((o) => orderRef(o).toUpperCase() === String(explicitRef).toUpperCase());
    if (matched) {
      targetOrder = matched;
    } else {
      const oldCancelled = await db.order.findFirst({
        where: { customerId: cust.id, ...orderWhereRef(String(explicitRef)), status: "CANCELLED" },
        select: { id: true, number: true, ref: true },
      });
      if (oldCancelled && cust.orders.length > 0) {
        console.log(`Payment referenced superseded cart ${orderRef(oldCancelled)}, auto-routing to active cart ${orderRef(cust.orders[0])}`);
        targetOrder = cust.orders[0];
      }
    }
  } else if (m.context?.id) {
    const ctxMsg = await db.message.findUnique({ where: { waMessageId: String(m.context.id) }, select: { body: true } });
    const ctxRef = ctxMsg?.body ? ORDER_REF_RE.exec(ctxMsg.body)?.[1] : null;
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
    const amount = parseMetaAmount(m.payment?.amount);
    const bubbleUtr = findUtr(m);
    await logPaymentEvent({
      orderId: targetOrder.id,
      source: "meta_bubble",
      status: notSucceeded(m.payment?.transaction?.status) ? "failed" : amount != null && amount > 0 && signed ? "paid" : "claimed",
      transactionId: m.payment?.transaction?.id ?? null,
      utr: bubbleUtr,
      amount,
      currency: m.payment?.currency ?? null,
      raw: m,
    });
    if (bubbleUtr) await db.order.updateMany({ where: { id: targetOrder.id, paymentUtr: null }, data: { paymentUtr: bubbleUtr } }).catch(() => {});
    // Only a bubble that says how much was paid is recorded straight away (a smaller amount stays part paid);
    // without an amount, staff check the UPI app first, like any other "I paid".
    if (notSucceeded(m.payment?.transaction?.status)) {
      const reason = m.payment?.transaction?.error?.reason ?? m.payment?.transaction?.error?.message ?? `UPI payment ${m.payment.transaction.status}`;
      await recordPaymentFailure(targetOrder.id, String(reason)).catch(() => {});
      return { text: `UPI payment for ${ref} didn't go through (${reason})`, kind: "order", media: base.media, handledAsPayment: true };
    }
    if (!(amount != null && amount > 0) || !signed) {
      const note = signed ? `WhatsApp showed a completed UPI payment without the amount. Check your UPI app for ${totalFormatted}.` : UNVERIFIED_NOTE;
      await recordPaymentClaim(targetOrder.id, note, String(txnId)).catch(() => {});
      return { text: `UPI payment on WhatsApp for ${ref} (${totalFormatted}) · check the amount`, kind: "order", media: base.media, handledAsPayment: true };
    }
    await confirmPayment(targetOrder.id, String(txnId), { method: "upi_whatsapp", source: "meta", amount, utr: bubbleUtr }).catch((e) => console.error("Auto confirmPayment on UPI bubble failed", e));
    return {
      text: `UPI payment completed on WhatsApp (${money(amount, targetOrder.currency)} for ${ref})`,
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

  // The customer asks to pay cash on delivery: set it on the order and send 1-click confirmation prompt.
  if (m.type === "text" && COD_ASK_RE.test(base.text) && !NO_COD_RE.test(base.text)) {
    // Payment settings › Cash on delivery: off, over the limit or outside the allowed areas → a polite no.
    const asked = await db.order.findUnique({ where: { id: targetOrder.id }, select: { total: true, clientId: true, customer: true, paymentRequestedAt: true } });
    const blocked = asked ? codBlocked((await paySettingsFor(asked.clientId)).settings, asked.total, asked.customer) : null;
    if (asked && blocked) {
      // The payment link may not have gone yet (e.g. we're still waiting for the delivery address).
      const how = asked.paymentRequestedAt ? "Please pay using the payment link we sent, and we will pack it right away." : "You can pay online: the payment link comes with your order details.";
      await textInWindow(asked.customer, `Sorry, cash on delivery isn't available for order ${ref}. ${how}`, "COD not available").catch(() => false);
      return { text: `${base.text} · Asked for cash on delivery on ${ref}; not allowed (${blocked})`, kind: base.kind, media: base.media, handledAsPayment: false };
    }
    await db.order.updateMany({ where: { id: targetOrder.id, paymentMethod: null }, data: { paymentMethod: "cod" } });
    await sendCodConfirmationPrompt(targetOrder.id).catch(() => {});
    return { text: `${base.text} · Asked for cash on delivery on ${ref} (confirmation prompt sent)`, kind: base.kind, media: base.media, handledAsPayment: false };
  }

  // Path B: Customer paid via external UPI app (GPay / PhonePe / Paytm / BHIM) and sent UTR or explicit payment confirmation text.
  if (m.type === "text" && hasRecentPaymentRequest && !NEGATIVE_PAY_RE.test(base.text)) {
    const utrMatch = UTR_RE.exec(base.text);
    const isExplicitPaidText = POSITIVE_PAY_RE.test(base.text) || Boolean(utrMatch && /\b(utr|ref|upi|txn|paid|sent|done)\b/i.test(base.text));
    if (isExplicitPaidText) {
      // Anyone can type "paid" or 12 digits, so nothing here marks the order paid: staff check the UPI app or
      // bank (the reference makes that quick) and confirm with one tap, and the order isn't packed until then.
      if (utrMatch) {
        const dupOrder = await db.order.findFirst({
          where: {
            OR: [
              { paymentUtr: utrMatch[1] },
              { paymentTxnId: { contains: utrMatch[1] } },
              { paymentClaimNote: { contains: utrMatch[1] } },
            ],
            id: { not: targetOrder.id },
          },
          select: { id: true, number: true, ref: true, customer: { select: { name: true } } },
        });

        if (dupOrder) {
          const dupRef = orderRef(dupOrder);
          await recordPaymentClaim(
            targetOrder.id,
            `⚠️ DUPLICATE UTR ALERT: ${utrMatch[1]} was already claimed for ${dupRef} (${dupOrder.customer.name})! Check bank carefully.`,
            `DUP-${utrMatch[1]}`,
          ).catch(() => {});
          return {
            text: `${base.text} · ⚠️ DUPLICATE UPI ref ${utrMatch[1]} (already used on ${dupRef}) · inspect`,
            kind: "order",
            media: base.media,
            handledAsPayment: true,
          };
        }

        await recordPaymentClaim(targetOrder.id, `UPI reference ${utrMatch[1]} sent by the customer`, `UTR-${utrMatch[1]}`).catch(() => {});
        await logPaymentEvent({ orderId: targetOrder.id, source: "customer_text", status: "claimed", utr: utrMatch[1], note: base.text.slice(0, 300) });
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
      let isDup = false;
      let dupRefStr = "";
      if (utrMatch) {
        const dupOrder = await db.order.findFirst({
          where: {
            OR: [
              { paymentUtr: utrMatch[1] },
              { paymentTxnId: { contains: utrMatch[1] } },
              { paymentClaimNote: { contains: utrMatch[1] } },
            ],
            id: { not: targetOrder.id },
          },
          select: { id: true, number: true, ref: true, customer: { select: { name: true } } },
        });
        if (dupOrder) {
          isDup = true;
          dupRefStr = orderRef(dupOrder);
        }
      }

      await recordPaymentClaim(
        targetOrder.id,
        isDup
          ? `⚠️ DUPLICATE UTR ALERT: Screenshot shows ${utrMatch![1]} already used on ${dupRefStr}! Check bank.`
          : utrMatch
            ? `Payment screenshot with UPI reference ${utrMatch[1]}`
            : `Payment screenshot: "${caption.slice(0, 200)}"`,
        utrMatch ? (isDup ? `DUP-${utrMatch[1]}` : `UTR-${utrMatch[1]}`) : null,
      ).catch(() => {});
      await logPaymentEvent({ orderId: targetOrder.id, source: "screenshot", status: isDup ? "duplicate" : "claimed", utr: utrMatch && !isDup ? utrMatch[1] : null, note: caption.slice(0, 300) });
      return {
        text: isDup
          ? `⚠️ DUPLICATE UPI screenshot (${totalFormatted} for ${ref}, ref ${utrMatch![1]} used on ${dupRefStr})`
          : `UPI payment screenshot (${totalFormatted} for ${ref}): ${caption}`,
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

async function loadOrderForButton(orderId: string) {
  return db.order.findUnique({
    where: { id: orderId },
    include: { customer: { include: { client: true } } },
  });
}
type OrderWithCustomer = NonNullable<Awaited<ReturnType<typeof loadOrderForButton>>>;

async function confirmCod(order: OrderWithCustomer) {
  const ref = orderRef(order);
  await db.order.update({
    where: { id: order.id },
    data: { status: "CONFIRMED", paymentMethod: "cod" },
  });
  pushOrderToSheet(order.id, "ORDER_UPDATE", "Customer confirmed COD");
  const addr = order.note?.trim() || order.customer.locationRaw?.trim() || order.customer.location?.trim() || "";
  const hasAddr = Boolean(addr);
  const replyMsg = hasAddr
    ? `🎉 Thank you! Your Cash on Delivery order ${ref} (${money(order.total, order.currency)}) is confirmed.\n\nWe will pack and dispatch it to your delivery address:\n📍 ${addr}`
    : `🎉 Thank you! Your Cash on Delivery order ${ref} (${money(order.total, order.currency)}) is confirmed.\n\n📍 Please reply with your full delivery address (Door No, Street, Landmark, City & Pincode) so our delivery partner can reach you smoothly.`;
  await textInWindow(order.customer, replyMsg, "COD Confirmed").catch(() => {});
  await updateOrderCard(order, "processing", "COD order confirmed - packing now").catch(() => {});
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = checkSignature(raw, req.headers.get("x-hub-signature-256"));
  if (signature === "invalid") {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  const signed = signature === "signed";
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      if (change.field === "messages") {
        for (const s of v.statuses ?? []) {
          await (s.type === "payment" || Boolean(s.payment)
            ? applyPayment(s, v.metadata?.phone_number_id, signed)
            : applyStatus(s));
        }
        for (const m of v.messages ?? []) {
          const base = metaReplyContent(m);
          const phoneNumberId = v.metadata?.phone_number_id;
          const { text, kind, media, handledAsPayment } = await detectAndApplyUpiPayment(m, phoneNumberId, base, signed);
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

          let handledByOrderButton = false;
          if (kind === "button") {
            const contactName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            const actionVal = m.button?.payload ?? m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? text;
            pushToGoogleSheet(customer?.clientId, "BUTTON_CLICK", {
              phone: m.from,
              name: customer?.name || contactName || "",
              campaign: "WhatsApp Portal",
              buttonText: text,
              actionValue: actionVal,
              client: clientName,
            });

            // Delivery address step: "Yes, deliver here" / "New address" (lib/delivery-address.ts)
            if (typeof actionVal === "string" && customer && (actionVal.startsWith("addr_ok:") || actionVal.startsWith("addr_new:"))) {
              handledByOrderButton = true;
              const ok = actionVal.startsWith("addr_ok:");
              const orderId = actionVal.slice(ok ? 8 : 9);
              await (ok ? confirmSavedAddress(orderId, customer.id) : askNewAddress(orderId, customer.id)).catch((e) => console.error("Address button failed", e));
            }

            // 1-Click Payment Choice Flow (pay_online / pay_cod)
            if (typeof actionVal === "string" && (actionVal.startsWith("pay_online:") || actionVal.startsWith("pay_cod:"))) {
              handledByOrderButton = true;
              const isOnline = actionVal.startsWith("pay_online:");
              const orderId = actionVal.slice(isOnline ? 11 : 8);
              const order = await loadOrderForButton(orderId);
              const mine = Boolean(order && customer && order.customerId === customer.id);
              if (order && mine) {
                const ref = orderRef(order);
                if (order.status === "CANCELLED") {
                  await textInWindow(
                    order.customer,
                    `This cart (${ref}) was replaced by your newer order, so nothing was changed. Please use the latest message.`,
                    "Payment choice (cancelled)",
                  ).catch(() => {});
                } else if (order.paidAt || (order.paidAmount ?? 0) > 0 || order.packedAt || ["PAID", "DISPATCHED", "DELIVERED"].includes(order.status)) {
                  await textInWindow(
                    order.customer,
                    `Order ${ref} is already ${order.status === "DELIVERED" ? "delivered" : order.status === "DISPATCHED" ? "on its way" : order.packedAt ? "packed" : "paid"}, so nothing was changed. If you need help with it, reply here.`,
                    "Payment choice (no change)",
                  ).catch(() => {});
                } else if (order.status === "CONFIRMED" && order.paymentMethod === "cod") {
                  if (!isOnline) {
                    await textInWindow(order.customer, `Your Cash on Delivery order ${ref} is already confirmed.`, "COD already confirmed").catch(() => {});
                  } else {
                    await textInWindow(order.customer, "Your order is already confirmed as Cash on Delivery. Reply here if you want to change it.", "COD already confirmed").catch(() => {});
                  }
                } else if (isOnline) {
                  if (order.paymentMethod === "cod") await db.order.updateMany({ where: { id: order.id, paymentMethod: "cod", status: "NEW", paidAt: null }, data: { paymentMethod: null } });
                  const res = await sendPaymentRequestFor(order.id);
                  if (!res.ok) {
                    await textInWindow(order.customer, "We couldn't create the payment link just now. We will send it shortly.", "Payment link retry").catch(() => {});
                    console.warn(`sendPaymentRequestFor failed for order ${order.id}: ${res.message}`);
                  }
                  pushOrderToSheet(order.id, "ORDER_UPDATE", "Customer chose online payment");
                } else {
                  // pay_cod: re-check codBlocked
                  const pay = await paySettingsFor(order.clientId);
                  const blocked = codBlocked(pay.settings, order.total, order.customer);
                  if (blocked) {
                    await textInWindow(order.customer, `Sorry, cash on delivery isn't available for order ${ref}. Here is the payment link.`, "COD unavailable").catch(() => {});
                    await sendPaymentRequestFor(order.id);
                  } else {
                    await confirmCod(order);
                  }
                }
              }
            }

            // 1-Click COD Confirmation Flow
            if (typeof actionVal === "string" && (actionVal.startsWith("cod_confirm:") || actionVal.startsWith("cod_cancel:"))) {
              handledByOrderButton = true;
              const isConfirm = actionVal.startsWith("cod_confirm:");
              const orderId = actionVal.slice(isConfirm ? 12 : 11);
              const order = await loadOrderForButton(orderId);
              // Only the customer the buttons were sent to, and only while the order still waits for this answer:
              // an old button pressed after payment, packing or dispatch must not move the order back or cancel it.
              const mine = Boolean(order && customer && order.customerId === customer.id);
              const settled = Boolean(order && (order.paidAt || (order.paidAmount ?? 0) > 0 || order.packedAt || ["PAID", "DISPATCHED", "DELIVERED"].includes(order.status)));
              const alreadyConfirmed = Boolean(order && isConfirm && order.status === "CONFIRMED" && order.paymentMethod === "cod");
              if (order && mine && order.status !== "CANCELLED" && settled) {
                await textInWindow(
                  order.customer,
                  `Order ${orderRef(order)} is already ${order.status === "DELIVERED" ? "delivered" : order.status === "DISPATCHED" ? "on its way" : order.packedAt ? "packed" : "paid"}, so nothing was changed. If you need help with it, reply here.`,
                  "COD button (no change)",
                ).catch(() => {});
              } else if (order && mine && order.status !== "CANCELLED" && !alreadyConfirmed) {
                const ref = orderRef(order);
                if (isConfirm) {
                  await confirmCod(order);
                } else {
                  await db.order.update({
                    where: { id: order.id },
                    data: { status: "CANCELLED" },
                  });
                  pushOrderToSheet(order.id, "ORDER_UPDATE", "Customer cancelled COD");
                  await textInWindow(order.customer, `Your order ${ref} has been cancelled as requested. If you need any assistance or want to order later, feel free to message us anytime!`, "COD Cancelled").catch(() => {});
                  await updateOrderCard(order, "canceled", "Order cancelled").catch(() => {});
                }
              }
            }
          } else if (m.type !== "order") {
            const contactName = v.contacts?.find((c: { wa_id?: string }) => c.wa_id === m.from)?.profile?.name;
            pushToGoogleSheet(customer?.clientId, "NEW_CHAT", {
              phone: m.from,
              name: customer?.name || contactName || "",
              message: text,
              source: join ? `Opt-in (${join[1]})` : handledAsPayment ? "UPI Payment" : "Inbound WhatsApp",
              client: clientName,
            });

            // Recycled Number / Wrong Number auto-detection
            const WRONG_NUMBER_RE = /\b(wrong\s*number|not\s*me|who\s*(is\s*this|are\s*you)|wrong\s*person|thappana\s*number|thappa\s*vandhirukku|yaar\s*idhu)\b/i;
            if (customer && m.type === "text" && WRONG_NUMBER_RE.test(text)) {
              const tags = customer.tags ?? [];
              if (!tags.includes("possible-wrong-number")) {
                await db.customer.update({
                  where: { id: customer.id },
                  data: { tags: { push: "possible-wrong-number" } },
                });
                await textInWindow(
                  customer,
                  "Apologies for any inconvenience! We have marked this number to stop updates. If you ever wish to browse our products, feel free to reply 'Catalogue'.",
                  "Wrong Number Notice",
                ).catch(() => {});
              }
            }
          }

          // The delivery address: WhatsApp's address form, a shared location, or typed while we wait for it.
          if (customer && !handledAsPayment && !handledByOrderButton && kind !== "button" && m.type !== "order") {
            if (await handleAddressReply(customer, m, text).catch((e) => (console.error("Address reply failed", e), false))) handledByOrderButton = true;
          }

          // Said hi, asked about products or prices (e.g. tapped "Send price list"), or wrote for the first time
          // today: reply with the free catalogue message (at most once every 12 hours).
          // Buttons with their own answer ("Make a gift pack", "Happy Deepavali") get that instead.
          const isSystemOrPayment = handledAsPayment || handledByOrderButton || m.type === "order" || m.type === "errors" || m.type === "unsupported" || m.type === "payment";
          const answered = customer && !isSystemOrPayment ? await autoReplyToButton(customer.id, text, kind).catch((e) => (console.error("Automatic button reply failed", e), true)) : false;
          if (customer && !isSystemOrPayment && !answered) {
            const trigger = catalogueTrigger(text, kind) ?? ((await firstMessageToday(customer.id)) ? "greeting" : null);
            if (trigger) await autoSendCatalogue(customer.id, trigger).catch((e) => console.error("Automatic catalogue reply failed", e));
          }
          if (customer && m.type === "order") {
            const order = await recordOrder(customer, m.id, m).catch((e) => (console.error("Could not save order", e), null));
            // A new cart: expire all previous unpaid carts & payment links, then send fresh "Review and pay"
            if (order) {
              await cancelSupersededOrdersForCustomer(customer.id, order).catch((e) => console.error("Could not expire old carts", e));
              // Automatic loyalty points (Order & Payment Settings) come off before "Review and pay" goes out.
              await autoRedeemPoints(order.id).catch((e) => console.error("Could not use loyalty points", e));
              // The delivery address first (form, or "deliver here?" for a saved one); payment follows once it's in.
              const step = await startAddressStep(order.id).catch((e) => (console.error("Address step failed", e), "skip" as const));
              if (step === "skip") await startCheckout(order).catch((e) => console.error("Automatic checkout start failed", e));
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
        // A business finished Meta's hosted sign-up: keep it for Thabaal to attach on the Requests page. Never throws.
        if (change.field === "account_update") await recordMetaSignup(entry.id, v);
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
