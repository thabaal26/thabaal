import "server-only";
import type { Setting, Template } from "@prisma/client";
import { db } from "./db";
import { renderFor, toPlainText, type TemplateButton, type VarMap } from "./template";
import { getSession, sendImage, sendText, type WahaConfig } from "./waha";
import { sendTemplateMessage, waConfig, type WaConfig } from "./whatsapp";

export type ProviderName = "META" | "LOCAL";

export async function getSettings(): Promise<Setting> {
  return db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function wahaConfig(s: Setting): WahaConfig | null {
  return s.wahaUrl && s.wahaApiKey ? { url: s.wahaUrl, apiKey: s.wahaApiKey, session: s.wahaSession || "default" } : null;
}

/** Whether the active provider can really send from this number, or sends are simulated. */
export function isSimulated(s: Setting, cfg: WaConfig = waConfig()) {
  return s.provider === "META" ? !cfg.live : !wahaConfig(s);
}

/** Ready to send right now? Local sessions must be linked and online. */
export async function readiness(s: Setting, cfg?: WaConfig): Promise<{ ok: boolean; reason?: string }> {
  if (isSimulated(s, cfg) || s.provider === "META") return { ok: true };
  const session = await getSession(wahaConfig(s)!);
  if (session.status === "WORKING") return { ok: true };
  return {
    ok: false,
    reason:
      session.status === "UNREACHABLE" ? "The WAHA server can't be reached."
      : session.status === "SCAN_QR_CODE" ? "The WhatsApp session needs its QR code scanned."
      : `The WhatsApp session is ${session.status.toLowerCase().replace(/_/g, " ")}.`,
  };
}

export type Sendable = Pick<
  Template,
  "name" | "language" | "category" | "headerType" | "headerText" | "headerMediaUrl" | "body" | "footer" | "variables" | "buttons" | "codeExpiryMins" | "securityNote"
>;

/** Sends one rendered template to one customer through the active provider, from the given number. */
export async function deliver(s: Setting, t: Sendable, customer: { name: string; phone: string }, cfg: WaConfig = waConfig()) {
  const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, customer);
  const provider = s.provider as ProviderName;

  if (provider === "LOCAL") {
    const text = toPlainText(r, t.buttons as TemplateButton[]);
    const cfg = wahaConfig(s);
    if (!cfg) return { id: `demo.${crypto.randomUUID()}`, simulated: true, provider, text };
    const id =
      t.headerType === "IMAGE" && t.headerMediaUrl
        ? await sendImage(cfg, customer.phone, t.headerMediaUrl, text)
        : await sendText(cfg, customer.phone, text);
    return { id, simulated: false, provider, text };
  }

  // Meta rejects an image-header template sent without its image (error 132012), so say what's missing.
  if (cfg.live && t.headerType === "IMAGE" && !t.headerMediaUrl?.trim())
    throw new Error(`"${t.name}" has an image header but no image link. Open the template, paste the image URL and save.`);

  const text = [r.header, r.body, r.footer].filter(Boolean).join("\n\n");
  const res = await sendTemplateMessage(cfg, {
    to: customer.phone,
    templateName: t.name,
    language: t.language,
    headerType: t.headerType,
    headerMediaUrl: t.headerMediaUrl,
    headerParams: r.headerParams,
    bodyParams: r.bodyParams,
  });
  return { ...res, provider, text };
}

/** Meta needs an approved template; the local session can send any saved one. */
export function templateSendable(s: Setting, t: Pick<Template, "status" | "category">) {
  if (t.category === "AUTHENTICATION") return false;
  return s.provider === "LOCAL" || t.status === "APPROVED";
}

/** Secret in the WAHA webhook URL, derived from AUTH_SECRET so it needs no extra setup. */
export async function wahaWebhookKey() {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update("waha-webhook").digest("hex").slice(0, 32);
}
