import "server-only";
import { absoluteUrl, resolveImageBytes } from "./media";
import type { MetaComponent } from "./template";

// WhatsApp Cloud API client. When the Meta variables are missing the portal runs in
// demo mode: sends are simulated and templates are approved locally.

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

/** Cache of uploaded WhatsApp media IDs keyed by `${phoneNumberId}:${url}` (Meta media IDs last 30 days; we refresh every 12h). */
const mediaIdCache = new Map<string, { id: string; expiresAt: number }>();
const MEDIA_TTL_MS = 12 * 60 * 60 * 1000;

/** Credentials of one sending number: its token, phone number ID and WhatsApp Business Account. */
export type WaSource = { token: string | null; phoneNumberId: string | null; businessAccountId: string | null };

/** That number when all three are set, otherwise the env-configured number. */
export function waConfig(src?: WaSource | null) {
  const own = Boolean(src?.token && src.phoneNumberId && src.businessAccountId);
  const token = own ? src!.token! : process.env.WHATSAPP_TOKEN;
  const phoneNumberId = own ? src!.phoneNumberId! : process.env.WHATSAPP_PHONE_NUMBER_ID;
  const wabaId = own ? src!.businessAccountId! : process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  return {
    live: Boolean(token && phoneNumberId && wabaId),
    own,
    token,
    phoneNumberId,
    wabaId,
    appId: process.env.META_APP_ID,
    version: VERSION,
  };
}

export type WaConfig = ReturnType<typeof waConfig>;

export class MetaError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function graph<T>(cfg: WaConfig, path: string, init: RequestInit = {}): Promise<T> {
  const { token } = cfg;
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new MetaError(e.error_user_msg || e.message || `Meta API error (${res.status})`, e.code);
  }
  return json as T;
}

/**
 * Uploads an image directly to Meta's WhatsApp Media endpoint (`/{phone_number_id}/media`) and returns its `media_id`.
 * Sending `image: { id: mediaId }` instead of `image: { link }` guarantees Meta already holds the verified binary
 * before queueing the message, permanently preventing asynchronous webhook error 131053.
 */
export async function uploadWhatsAppMedia(cfg: WaConfig, imageUrl: string): Promise<string | null> {
  if (!cfg.live || !cfg.phoneNumberId || !cfg.token) return null;
  const normalizedKey = absoluteUrl(imageUrl) ?? imageUrl.trim();
  const cacheKey = `${cfg.phoneNumberId}:${normalizedKey}`;
  const cached = mediaIdCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.id;
  }

  try {
    const resolved = await resolveImageBytes(imageUrl);
    if (!resolved) return null;

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", resolved.mimeType);
    form.append("file", new Blob([new Uint8Array(resolved.bytes)], { type: resolved.mimeType }), resolved.filename);

    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}` },
      body: form,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    if (res.ok && json.id) {
      mediaIdCache.set(cacheKey, { id: json.id, expiresAt: Date.now() + MEDIA_TTL_MS });
      return json.id;
    }
  } catch (e) {
    console.warn("WhatsApp direct media upload failed, falling back to link:", e instanceof Error ? e.message : e);
  }
  return null;
}

export type SendInput = {
  to: string;
  templateName: string;
  language: string;
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerMediaUrl?: string | null;
  headerParams: string[];
  bodyParams: string[];
  /** Position of a "View catalog" button; Meta needs a parameter for it on every send. */
  catalogButtonIndex?: number;
  /** Optional SKU (retailer_id) to display as the thumbnail on a CATALOG button. */
  catalogThumbnailProductId?: string | null;
  /** Dynamic URL button parameters (index + suffix value for {{1}}). */
  urlButtonParams?: { index: number; value: string }[];
  /** One-time passcode for AUTHENTICATION (OTP) templates. */
  otpCode?: string | null;
};

export async function sendTemplateMessage(cfg: WaConfig, input: SendInput): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };

  const components: Record<string, unknown>[] = [];
  if (input.otpCode) {
    components.push({ type: "body", parameters: [{ type: "text", text: input.otpCode }] });
    components.push({
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [{ type: "text", text: input.otpCode }],
    });
  } else {
    if (input.headerType === "IMAGE" && input.headerMediaUrl) {
      const mediaId = await uploadWhatsAppMedia(cfg, input.headerMediaUrl);
      const fallbackLink = absoluteUrl(input.headerMediaUrl) ?? input.headerMediaUrl;
      components.push({
        type: "header",
        parameters: [{ type: "image", image: mediaId ? { id: mediaId } : { link: fallbackLink } }],
      });
    } else if (input.headerType === "TEXT" && input.headerParams.length) {
      components.push({ type: "header", parameters: input.headerParams.map((text) => ({ type: "text", text })) });
    }
    if (input.bodyParams.length) {
      components.push({ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) });
    }
    if (input.catalogButtonIndex != null && input.catalogButtonIndex >= 0) {
      const action = input.catalogThumbnailProductId
        ? { thumbnail_product_retailer_id: input.catalogThumbnailProductId }
        : {};
      components.push({
        type: "button",
        sub_type: "CATALOG",
        index: input.catalogButtonIndex,
        parameters: [{ type: "action", action }],
      });
    }
    for (const ub of input.urlButtonParams ?? []) {
      components.push({
        type: "button",
        sub_type: "url",
        index: ub.index,
        parameters: [{ type: "text", text: ub.value }],
      });
    }
  }

  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "template",
      template: { name: input.templateName, language: { code: input.language }, components },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/** A plain text message. WhatsApp only allows it within 24 hours of the customer's last message. */
export async function sendTextMessage(cfg: WaConfig, to: string, body: string): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: false } }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/** Sends an image or document inside the customer's 24-hour service window. */
export async function sendMediaMessage(
  cfg: WaConfig,
  to: string,
  mediaUrl: string,
  caption?: string,
): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const isPdf = /\.pdf(\?|$)/i.test(mediaUrl);
  const type = isPdf ? "document" : "image";
  const normalizedUrl = absoluteUrl(mediaUrl) ?? mediaUrl;
  const mediaId = await uploadWhatsAppMedia(cfg, mediaUrl);
  const payload = isPdf
    ? mediaId
      ? { id: mediaId, ...(caption ? { caption } : {}), filename: "attachment.pdf" }
      : { link: normalizedUrl, ...(caption ? { caption } : {}), filename: "attachment.pdf" }
    : mediaId
      ? { id: mediaId, ...(caption ? { caption } : {}) }
      : { link: normalizedUrl, ...(caption ? { caption } : {}) };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type,
      [type]: payload,
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

export type CallAction = "pre_accept" | "accept" | "reject" | "terminate";

/** Answers, rejects or hangs up a WhatsApp voice call; accepting sends the browser's SDP answer. */
export async function callAction(cfg: WaConfig, callId: string, action: CallAction, sdp?: string) {
  if (!cfg.live) return;
  await graph(cfg, `${cfg.phoneNumberId}/calls`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", call_id: callId, action, ...(sdp && { session: { sdp_type: "answer", sdp } }) }),
  });
}

/** Rings a customer on WhatsApp with the browser's SDP offer; their answer arrives on the calls webhook. */
export async function startMetaCall(cfg: WaConfig, to: string, sdp: string): Promise<string> {
  if (!cfg.live) throw new MetaError("Calling needs the WhatsApp Cloud API connected.");
  const res = await graph<{ calls?: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/calls`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, action: "connect", session: { sdp_type: "offer", sdp } }),
  });
  const id = res.calls?.[0]?.id;
  if (!id) throw new MetaError("Meta did not return a call id.");
  return id;
}

/**
 * Asks a customer to allow calls from us. Like a typed message, WhatsApp only allows it
 * within 24 hours of the customer's last message.
 */
export async function sendCallPermissionRequest(cfg: WaConfig, to: string, body: string): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: { type: "call_permission_request", action: { name: "call_permission_request" }, body: { text: body } },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/** Rupees as WhatsApp payment amounts: an integer with offset 100 (paise). */
const paise = (n: number) => ({ value: Math.round(n * 100), offset: 100 });

export type PaymentRequest = {
  /** Unique per order; Meta echoes it back on the payment webhook. Max 35 characters. */
  referenceId: string;
  configuration: string;
  items: { id: string; name: string; quantity: number; price: number }[];
  total: number;
  /** The catalogue the items came from; WhatsApp then shows each product's picture. */
  catalogId?: string | null;
};

/** The order_details parameters behind WhatsApp's "Review and pay" button (UPI). */
function orderDetails(p: PaymentRequest) {
  const lines = p.items.filter((i) => i.quantity > 0);
  const itemsTotal = lines.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shippingAmount = itemsTotal > 0 ? Math.max(0, Math.round((p.total - itemsTotal) * 100) / 100) : 0;
  // Meta checks that items + shipping + tax == total_amount; when item prices are missing, send one line for the order.
  const itemized = itemsTotal > 0 && Math.abs(itemsTotal + shippingAmount - p.total) < 0.01;
  const items = itemized
    ? lines.map((i) => ({ retailer_id: i.id.slice(0, 50), name: i.name.slice(0, 60), amount: paise(i.price), quantity: i.quantity }))
    : [{ retailer_id: "order", name: "Your order", amount: paise(p.total), quantity: 1 }];
  return {
    reference_id: p.referenceId,
    type: "physical-goods",
    payment_type: "upi",
    payment_configuration: p.configuration,
    currency: "INR",
    total_amount: paise(p.total),
    // Only itemized carts can point at the catalogue: every retailer_id must be one of its products.
    order: {
      status: "pending",
      ...(itemized && p.catalogId && { catalog_id: p.catalogId }),
      items,
      subtotal: paise(itemized ? itemsTotal : p.total),
      ...(itemized && shippingAmount > 0 ? { shipping: { ...paise(shippingAmount), description: "Shipping" } } : {}),
      tax: { ...paise(0), description: "Included" },
    },
  };
}

/** Within the 24-hour window: an interactive order_details message with the "Review and pay" button. */
export async function sendPaymentRequest(cfg: WaConfig, to: string, body: string, p: PaymentRequest): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: { type: "order_details", body: { text: body.slice(0, 1024) }, action: { name: "review_and_pay", parameters: orderDetails(p) } },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/**
 * Outside the window: an approved template with WhatsApp's "Review and pay" button, either our own
 * or one added from Meta's template library (those are approved straight away).
 */
export async function sendPaymentTemplate(
  cfg: WaConfig,
  to: string,
  template: { name: string; language: string; bodyParams: string[]; headerParams: string[]; headerImage?: string | null },
  p: PaymentRequest,
): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const mediaId = template.headerImage ? await uploadWhatsAppMedia(cfg, template.headerImage) : null;
  const fallbackLink = template.headerImage ? (absoluteUrl(template.headerImage) ?? template.headerImage) : null;
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: [
          ...(template.headerImage
            ? [
                {
                  type: "header",
                  parameters: [{ type: "image", image: mediaId ? { id: mediaId } : { link: fallbackLink } }],
                },
              ]
            : []),
          ...(template.headerParams.length ? [{ type: "header", parameters: template.headerParams.map((text) => ({ type: "text", text })) }] : []),
          ...(template.bodyParams.length ? [{ type: "body", parameters: template.bodyParams.map((text) => ({ type: "text", text })) }] : []),
          { type: "button", sub_type: "order_details", index: 0, parameters: [{ type: "action", action: { order_details: orderDetails(p) } }] },
        ],
      },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/**
 * Updates the order card in the customer's chat after a "Review and pay" message, e.g. to "processing"
 * once paid. Sent as a reply to their payment, inside the window it opens.
 */
export async function sendOrderStatus(cfg: WaConfig, to: string, referenceId: string, status: "processing" | "partially-shipped" | "shipped" | "completed" | "canceled", body: string, description?: string) {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "order_status",
        body: { text: body.slice(0, 1024) },
        action: { name: "review_order", parameters: { reference_id: referenceId, order: { status, ...(description && { description: description.slice(0, 120) }) } } },
      },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

/**
 * WhatsApp's "View catalog" message: opens the catalogue linked to the sending number. Free inside the
 * customer's 24-hour window (a service message), unlike a catalogue template.
 */
export async function sendCatalogMessage(cfg: WaConfig, to: string, body: string): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };
  const res = await graph<{ messages: { id: string }[] }>(cfg, `${cfg.phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: { type: "catalog_message", body: { text: body.slice(0, 1024) }, action: { name: "catalog_message" } },
    }),
  });
  return { id: res.messages[0].id, simulated: false };
}

export type MetaTemplate = {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  rejected_reason?: string;
  components: MetaComponent[];
};

export type MetaPhoneNumber = { id: string; display_phone_number: string; verified_name: string; quality_rating?: string };

/** The sending numbers in a WhatsApp Business Account. Only the token in `cfg` is used. */
export async function listPhoneNumbers(cfg: WaConfig, businessAccountId: string) {
  const res = await graph<{ data: MetaPhoneNumber[] }>(cfg, `${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`);
  return res.data;
}

export async function listMetaTemplates(cfg: WaConfig) {
  const { wabaId } = cfg;
  const all: MetaTemplate[] = [];
  let path: string | null =
    `${wabaId}/message_templates?fields=id,name,language,status,category,rejected_reason,components&limit=100`;
  while (path) {
    const page: { data: MetaTemplate[]; paging?: { next?: string } } = await graph(cfg, path);
    all.push(...page.data);
    path = page.paging?.next ? page.paging.next.replace(`${GRAPH}/`, "") : null;
  }
  return all;
}

export async function createMetaTemplate(cfg: WaConfig, t: { name: string; language: string; category: string; components: unknown[] }) {
  const { wabaId } = cfg;
  return graph<{ id: string; status: string; category: string }>(cfg, `${wabaId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ ...t, allow_category_change: true }),
  });
}

export async function editMetaTemplate(cfg: WaConfig, metaId: string, components: unknown[]) {
  return graph<{ success: boolean }>(cfg, metaId, { method: "POST", body: JSON.stringify({ components }) });
}

export async function deleteMetaTemplate(cfg: WaConfig, name: string, metaId: string) {
  const { wabaId } = cfg;
  return graph(cfg, `${wabaId}/message_templates?name=${encodeURIComponent(name)}&hsm_id=${metaId}`, { method: "DELETE" });
}

/** Uploads an image through the Resumable Upload API and returns the handle Meta needs as an example. */
export async function uploadHeaderSample(cfg: WaConfig, imageUrl: string) {
  const { token } = cfg;
  let { appId } = cfg;

  const resolved = await resolveImageBytes(imageUrl);
  let bytes: ArrayBuffer;
  let type = "image/jpeg";
  if (resolved) {
    bytes = resolved.bytes.buffer.slice(resolved.bytes.byteOffset, resolved.bytes.byteOffset + resolved.bytes.byteLength) as ArrayBuffer;
    type = resolved.mimeType;
  } else {
    const img = await fetch(absoluteUrl(imageUrl) ?? imageUrl, { cache: "no-store" });
    if (!img.ok) throw new MetaError("Could not download the header image. Check the URL is public.");
    bytes = await img.arrayBuffer();
    type = img.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
  }

  // Resolve the exact Meta App ID that issued this token if not matching or missing
  try {
    const appInfo = await graph<{ id?: string }>(cfg, "app");
    if (appInfo?.id) appId = appInfo.id;
  } catch {
    // Fallback to configured appId
  }
  if (!appId) throw new MetaError("Set META_APP_ID to use image headers.");

  const session = await graph<{ id: string }>(
    cfg,
    `${appId}/uploads?file_length=${bytes.byteLength}&file_type=${encodeURIComponent(type)}`,
    { method: "POST" },
  );
  const res = await fetch(`${GRAPH}/${session.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_offset: "0" },
    body: bytes,
  });
  const json = await res.json();
  if (!res.ok || !json.h) throw new MetaError(json.error?.message ?? "Image upload to Meta failed.");
  return json.h as string;
}

export function mapMetaStatus(s: string) {
  switch (s) {
    case "APPROVED":
      return "APPROVED" as const;
    case "REJECTED":
      return "REJECTED" as const;
    case "PAUSED":
      return "PAUSED" as const;
    case "DISABLED":
      return "DISABLED" as const;
    default:
      return "PENDING" as const; // PENDING, IN_APPEAL, PENDING_DELETION…
  }
}

/**
 * Product names for retailer ids in a catalogue. Carts only carry ids, so orders look them up here.
 * Needs the token to have catalog_management (or business_management) permission.
 */
export async function catalogProductNames(cfg: WaConfig, catalogId: string, retailerIds: string[]) {
  const names = new Map<string, string>();
  if (!cfg.live || !retailerIds.length) return names;
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { is_any: retailerIds } }));
  const res = await graph<{ data: { retailer_id: string; name: string }[] }>(cfg, `${catalogId}/products?fields=retailer_id,name&limit=100&filter=${filter}`);
  for (const p of res.data ?? []) if (p.retailer_id && p.name) names.set(p.retailer_id, p.name);
  return names;
}

/** Syncs the WhatsApp Business Profile (about/tagline, website, description) on a phone number in Meta. */
export async function syncMetaBusinessProfile(
  cfg: WaConfig,
  profile: { about?: string | null; description?: string | null; website?: string | null; address?: string | null; email?: string | null },
) {
  if (!cfg.live || !cfg.phoneNumberId) return false;
  const body: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (profile.about?.trim()) body.about = profile.about.trim().slice(0, 139);
  if (profile.description?.trim()) body.description = profile.description.trim().slice(0, 512);
  if (profile.address?.trim()) body.address = profile.address.trim().slice(0, 256);
  if (profile.email?.trim()) body.email = profile.email.trim().slice(0, 128);
  if (profile.website?.trim()) body.websites = [profile.website.trim()];
  if (Object.keys(body).length <= 1) return false;
  try {
    await graph(cfg, `${cfg.phoneNumberId}/whatsapp_business_profile`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return true;
  } catch (e) {
    console.warn("Meta business profile sync skipped:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Ensures WhatsApp Cloud API voice calling is enabled on a phone number in Meta. */
export async function enableMetaCalling(cfg: WaConfig) {
  if (!cfg.live || !cfg.phoneNumberId) return false;
  try {
    await graph(cfg, `${cfg.phoneNumberId}/settings`, {
      method: "POST",
      body: JSON.stringify({
        calling: {
          status: "ENABLED",
          call_icon_visibility: "DEFAULT",
          callback_permission_status: "ENABLED",
        },
      }),
    });
    return true;
  } catch (e) {
    console.warn("Meta calling settings sync skipped:", e instanceof Error ? e.message : e);
    return false;
  }
}
