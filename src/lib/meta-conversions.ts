import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v27.0";
const GRAPH_BASE_URL = "https://graph.facebook.com";

export type MetaWhatsAppEvent = {
  datasetId: string;
  wabaId: string;
  ctwaClid: string;
  eventName: "Purchase" | "OrderCreated" | "QualifiedLead";
  eventTime: Date;
  currency?: string;
  value?: number;
  partnerAgent?: string;
};

export type MetaConversionResult = {
  success: boolean;
  eventsReceived: number;
  fbTraceId?: string | null;
  messages: string[];
};

type MetaApiResponse = {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

/**
 * Sanitizes sensitive credentials and PII from error strings.
 */
function sanitizeError(msg: string): string {
  return msg
    .replace(/EA[A-Za-z0-9_-]{20,}/g, "[REDACTED_META_TOKEN]")
    .replace(/(ctwa_clid=)[^&\s]+/gi, "$1[REDACTED_CLID]");
}

/**
 * Retrieves or provisions the Meta dataset for a client's WABA.
 */
export async function getOrCreateWabaDataset(
  wabaId: string,
  accessToken: string
): Promise<string> {
  const cleanWaba = wabaId.trim();
  if (!/^\d+$/.test(cleanWaba)) {
    throw new Error("Invalid WABA ID format. Must contain digits only.");
  }
  if (!accessToken || !accessToken.trim()) {
    throw new Error("Missing Meta access token.");
  }

  // 1. Try to fetch existing dataset for WABA
  try {
    const listUrl = `${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(cleanWaba)}/dataset`;
    const getRes = await fetch(listUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (getRes.ok) {
      const getJson = await getRes.json();
      if (getJson.data && Array.isArray(getJson.data) && getJson.data.length > 0 && getJson.data[0].id) {
        return String(getJson.data[0].id);
      }
      if (getJson.id) {
        return String(getJson.id);
      }
    }
  } catch {}

  // 2. Provision new dataset if none found
  const postUrl = `${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(cleanWaba)}/dataset`;
  const postRes = await fetch(postUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dataset_name: `Thabaal WABA Dataset ${cleanWaba}`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const postJson = await postRes.json();

  if (!postRes.ok || !postJson.id) {
    const errMsg = postJson.error?.message || `HTTP ${postRes.status}`;
    throw new Error(sanitizeError(`Meta dataset provisioning failed: ${errMsg}`));
  }

  return String(postJson.id);
}

/**
 * Low-level HTTP client to submit a WhatsApp conversion event to Meta.
 * Does not perform tenant authorization or DB operations (handled by caller).
 */
export async function submitWhatsAppEvent(
  event: MetaWhatsAppEvent,
  accessToken: string
): Promise<MetaConversionResult> {
  if (!event.datasetId?.trim() || !event.wabaId?.trim() || !event.ctwaClid?.trim()) {
    throw new Error("Missing dataset ID, WABA ID, or CTWA attribution.");
  }
  if (!accessToken?.trim()) {
    throw new Error("Missing Meta access token.");
  }
  if (!event.eventTime || Number.isNaN(event.eventTime.getTime())) {
    throw new Error("Invalid conversion event timestamp.");
  }
  if (event.value !== undefined && (!Number.isFinite(event.value) || event.value < 0)) {
    throw new Error("Invalid conversion amount.");
  }
  if (event.currency !== undefined && !/^[A-Z]{3}$/.test(event.currency)) {
    throw new Error("Invalid ISO currency code.");
  }

  const endpoint = `${GRAPH_BASE_URL}/${GRAPH_VERSION}/${encodeURIComponent(event.datasetId)}/events`;

  const eventPayload: Record<string, unknown> = {
    event_name: event.eventName,
    event_time: Math.floor(event.eventTime.getTime() / 1000),
    action_source: "business_messaging",
    messaging_channel: "whatsapp",
    user_data: {
      whatsapp_business_account_id: event.wabaId.trim(),
      ctwa_clid: event.ctwaClid.trim(),
    },
  };

  if (event.currency && event.value !== undefined) {
    eventPayload.custom_data = {
      currency: event.currency,
      value: event.value,
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: [eventPayload],
      partner_agent: event.partnerAgent || "Thabaal",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const result = (await response.json()) as MetaApiResponse;

  if (!response.ok || result.error) {
    const errorMsg = sanitizeError(
      `Meta event submission failed. HTTP ${response.status}, code ${result.error?.code ?? "unknown"}, trace ${result.fbtrace_id ?? "none"}: ${result.error?.message ?? "unknown error"}`
    );
    throw new Error(errorMsg);
  }

  if (result.events_received !== 1) {
    throw new Error(
      `Expected 1 accepted event; Meta reported ${result.events_received ?? "unknown"}.`
    );
  }

  return {
    success: true,
    eventsReceived: result.events_received,
    fbTraceId: result.fbtrace_id ?? null,
    messages: result.messages ?? [],
  };
}

/**
 * Atomically queues an eligible WhatsApp conversion event into MetaConversionOutbox.
 * Idempotent: uses @@unique([clientId, orderId, eventName]) to prevent duplicate jobs.
 */
export async function queueConversionOutbox(params: {
  clientId: string;
  wabaId: string;
  datasetId: string;
  orderId: string;
  eventName: "Purchase" | "OrderCreated" | "QualifiedLead";
  eventTime: Date;
  currency?: string;
  value?: number;
  conversationId?: string;
}) {
  try {
    const outbox = await db.metaConversionOutbox.upsert({
      where: {
        clientId_orderId_eventName: {
          clientId: params.clientId,
          orderId: params.orderId,
          eventName: params.eventName,
        },
      },
      create: {
        clientId: params.clientId,
        wabaId: params.wabaId,
        datasetId: params.datasetId,
        conversationId: params.conversationId,
        orderId: params.orderId,
        eventName: params.eventName,
        eventTime: params.eventTime,
        currency: params.currency ?? "INR",
        value: params.value !== undefined ? new Prisma.Decimal(params.value.toFixed(2)) : null,
        status: "PENDING",
      },
      update: {}, // No-op if already queued or sent
    });
    return outbox;
  } catch (err) {
    console.error("[Conversions Outbox] Failed to queue outbox entry:", err);
    return null;
  }
}

/**
 * Worker claim and dispatch for an outbox entry.
 * Atomically transitions PENDING -> SUBMITTING -> SENT / FAILED.
 */
export async function dispatchOutboxEntry(outboxId: string, accessToken: string) {
  // 1. Atomic claim PENDING -> SUBMITTING
  const claimed = await db.metaConversionOutbox.updateMany({
    where: {
      id: outboxId,
      status: { in: ["PENDING", "FAILED_RETRYABLE"] },
    },
    data: {
      status: "SUBMITTING",
      attemptCount: { increment: 1 },
      updatedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    return { ok: false, reason: "Entry already in-flight or completed." };
  }

  const entry = await db.metaConversionOutbox.findUnique({
    where: { id: outboxId },
  });

  if (!entry) {
    return { ok: false, reason: "Entry not found after claim." };
  }

  // 2. Fetch conversation ctwa_clid if conversationId exists
  let ctwaClid = "";
  if (entry.conversationId) {
    const reply = await db.reply.findUnique({
      where: { id: entry.conversationId },
      select: { ctwaClid: true },
    });
    ctwaClid = reply?.ctwaClid || "";
  }

  // Fallback: check Order ctwaClid
  if (!ctwaClid) {
    const order = await db.order.findUnique({
      where: { id: entry.orderId },
      select: { ctwaClid: true },
    });
    ctwaClid = order?.ctwaClid || "";
  }

  if (!ctwaClid) {
    await db.metaConversionOutbox.update({
      where: { id: outboxId },
      data: {
        status: "PERMANENT_FAILURE",
        lastError: "Missing CTWA click identifier on conversation or order.",
        updatedAt: new Date(),
      },
    });
    return { ok: false, reason: "Missing CTWA click identifier." };
  }

  // 3. Submit to Meta CAPI outside database transaction
  try {
    const res = await submitWhatsAppEvent(
      {
        datasetId: entry.datasetId,
        wabaId: entry.wabaId,
        ctwaClid,
        eventName: entry.eventName as "Purchase" | "OrderCreated" | "QualifiedLead",
        eventTime: entry.eventTime,
        currency: entry.currency || undefined,
        value: entry.value ? Number(entry.value) : undefined,
        partnerAgent: "Thabaal",
      },
      accessToken
    );

    // 4. Mark SENT
    await db.metaConversionOutbox.update({
      where: { id: outboxId },
      data: {
        status: "SENT",
        metaTraceId: res.fbTraceId,
        metaResponse: { events_received: res.eventsReceived, messages: res.messages },
        submittedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      },
    });

    return { ok: true, traceId: res.fbTraceId };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTimeout = errorMessage.includes("timeout") || errorMessage.includes("AbortError");
    const nextStatus = isTimeout ? "UNKNOWN_EXTERNAL_OUTCOME" : "FAILED_RETRYABLE";

    await db.metaConversionOutbox.update({
      where: { id: outboxId },
      data: {
        status: nextStatus,
        lastError: sanitizeError(errorMessage).slice(0, 500),
        updatedAt: new Date(),
      },
    });

    return { ok: false, reason: errorMessage };
  }
}

/**
 * Automatically queues and dispatches a Meta Business Messaging Conversions API
 * event if the customer or order has an attributed Click-to-WhatsApp click identifier (ctwa_clid).
 * Completely non-blocking and fail-safe.
 */
export async function recordWhatsAppPurchaseConversion(
  orderId: string,
  clientId: string,
  customerId: string,
  amount: number,
  currency: string
) {
  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { waBusinessAccountId: true, wabaDatasetId: true, waToken: true },
    });
    if (!client?.waBusinessAccountId || !client?.wabaDatasetId) {
      return; // No WABA dataset configured for this tenant
    }

    // 1. Resolve CTWA CLID from Order or recent customer Reply
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: { ctwaClid: true },
    });

    let ctwaClid = order?.ctwaClid || null;
    let replyId: string | undefined = undefined;

    if (!ctwaClid) {
      const recentReply = await db.reply.findFirst({
        where: {
          customerId,
          customer: { clientId },
          ctwaClid: { not: null },
        },
        orderBy: { receivedAt: "desc" },
        select: { id: true, ctwaClid: true },
      });
      if (recentReply?.ctwaClid) {
        ctwaClid = recentReply.ctwaClid;
        replyId = recentReply.id;
        // Backfill on order
        await db.order.update({
          where: { id: orderId },
          data: { ctwaClid },
        });
      }
    }

    if (!ctwaClid) {
      return; // Not a CTWA attributed conversion
    }

    // 2. Queue into MetaConversionOutbox (idempotent upsert)
    const outbox = await queueConversionOutbox({
      clientId,
      wabaId: client.waBusinessAccountId,
      datasetId: client.wabaDatasetId,
      orderId,
      eventName: "Purchase",
      eventTime: new Date(),
      currency,
      value: amount,
      conversationId: replyId,
    });

    // 3. If outbox entry created/pending and client has valid token, dispatch asynchronously
    if (outbox && outbox.status === "PENDING" && client.waToken) {
      dispatchOutboxEntry(outbox.id, client.waToken).catch((err) => {
        console.error("[Conversions API] Async dispatch error:", err);
      });
    }
  } catch (err) {
    console.error("[Conversions API] recordWhatsAppPurchaseConversion error:", err);
  }
}

