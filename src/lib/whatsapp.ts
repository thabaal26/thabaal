import "server-only";
import type { MetaComponent } from "./template";

// WhatsApp Cloud API client. When the Meta variables are missing the portal runs in
// demo mode: sends are simulated and templates are approved locally.

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSION}`;

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

export type SendInput = {
  to: string;
  templateName: string;
  language: string;
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerMediaUrl?: string | null;
  headerParams: string[];
  bodyParams: string[];
};

export async function sendTemplateMessage(cfg: WaConfig, input: SendInput): Promise<{ id: string; simulated: boolean }> {
  if (!cfg.live) return { id: `demo.${crypto.randomUUID()}`, simulated: true };

  const components: Record<string, unknown>[] = [];
  if (input.headerType === "IMAGE" && input.headerMediaUrl) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: input.headerMediaUrl } }] });
  } else if (input.headerType === "TEXT" && input.headerParams.length) {
    components.push({ type: "header", parameters: input.headerParams.map((text) => ({ type: "text", text })) });
  }
  if (input.bodyParams.length) {
    components.push({ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) });
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
  const { appId, token } = cfg;
  if (!appId) throw new MetaError("Set META_APP_ID to use image headers.");
  const img = await fetch(imageUrl);
  if (!img.ok) throw new MetaError("Could not download the header image. Check the URL is public.");
  const bytes = await img.arrayBuffer();
  const type = img.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";

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
