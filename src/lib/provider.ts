import "server-only";
import { headerImageFor } from "./media";
import type { Setting, Template } from "@prisma/client";
import { db } from "./db";
import { placeholders, renderFor, resolveVar, toPlainText, unmappedVars, type TemplateButton, type VarMap } from "./template";
import { getSession, sendImage, sendText, type WahaConfig } from "./waha";
import { NOT_CONNECTED, sendTemplateMessage, waConfig, type WaConfig } from "./whatsapp";

export type ProviderName = "META" | "LOCAL";

/** The single settings row. A plain read (pages ask for it on every load); created on first use. */
export async function getSettings(): Promise<Setting> {
  return (await db.setting.findUnique({ where: { id: 1 } })) ?? db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export function wahaConfig(s: Setting): WahaConfig | null {
  return s.wahaUrl && s.wahaApiKey ? { url: s.wahaUrl, apiKey: s.wahaApiKey, session: s.wahaSession || "default" } : null;
}

/** Whether the active provider can really send from this number, or sends are simulated. */
export function isSimulated(s: Setting, cfg: WaConfig = waConfig()) {
  return s.provider === "META" ? !cfg.live : !wahaConfig(s);
}

/** Ready to send right now? Local sessions must be linked and online. */
export async function readiness(s: Setting, cfg?: WaConfig): Promise<{ ok: boolean; reason?: string; notConnected?: boolean }> {
  if (s.provider === "META" && cfg?.notConnected) return { ok: false, reason: NOT_CONNECTED, notConnected: true };
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
  "clientId" | "name" | "language" | "category" | "headerType" | "headerText" | "headerMediaUrl" | "body" | "footer" | "variables" | "buttons" | "codeExpiryMins" | "securityNote"
>;

/** Sends one rendered template to one customer through the active provider, from the given number. */
export async function deliver(
  s: Setting,
  t: Sendable,
  customer: { name: string; phone: string; location?: string | null; purchases?: string | null },
  cfg: WaConfig = waConfig(),
  otpCode?: string,
) {
  const isAuth = t.category === "AUTHENTICATION";
  const resolvedOtp = isAuth ? (otpCode?.trim() || String(Math.floor(100000 + Math.random() * 900000))) : null;
  const varMap = (t.variables ?? {}) as VarMap;
  // Never send a guessed value: a {{2}} with nothing set would otherwise go out as the customer's name.
  const missing = unmappedVars({ category: t.category, body: t.body, variables: varMap });
  if (missing.length) throw new Error(`"${t.name}" has no value set for ${missing.map((n) => `{{${n}}}`).join(", ")}. Set it in Templates, then send again.`);
  const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: varMap }, customer);
  const provider = s.provider as ProviderName;
  // A template without its own picture uses the client's default image.
  const image = isAuth ? null : await headerImageFor(t);

  if (provider === "LOCAL") {
    const text = isAuth
      ? `${resolvedOtp} is your verification code.${t.securityNote ? " For your security, do not share this code." : ""}`
      : toPlainText(r, t.buttons as TemplateButton[]);
    const cfg = wahaConfig(s);
    if (!cfg) return { id: `demo.${crypto.randomUUID()}`, simulated: true, provider, text };
    const id =
      image
        ? await sendImage(cfg, customer.phone, image, text)
        : await sendText(cfg, customer.phone, text);
    return { id, simulated: false, provider, text };
  }

  // Meta rejects an image-header template sent without its image (error 132012), so say what's missing.
  if (cfg.live && !isAuth && t.headerType === "IMAGE" && !image)
    throw new Error(`"${t.name}" has an image header but no image. Set a default image on the Templates page, or add one to this template.`);

  const buttons = (t.buttons as TemplateButton[]) ?? [];
  const catIdx = buttons.findIndex((b) => b.type === "CATALOG");
  const catBtn = catIdx >= 0 ? buttons[catIdx] : null;
  const catalogThumbnailProductId =
    catBtn && catBtn.type === "CATALOG" ? (catBtn.thumbnailProductId?.trim() || null) : null;

  const urlButtonParams = buttons
    .map((b, index) => {
      if (b.type !== "URL" || !placeholders(b.url ?? "").length) return null;
      const value = b.urlExample?.trim() || resolveVar(varMap[`b${index}`] ?? { source: "phone" }, customer);
      return { index, value };
    })
    .filter((x): x is { index: number; value: string } => x !== null);

  const text = isAuth
    ? `${resolvedOtp} is your verification code.${t.securityNote ? " For your security, do not share this code." : ""}`
    : [r.header, r.body, r.footer].filter(Boolean).join("\n\n");
  const res = await sendTemplateMessage(cfg, {
    to: customer.phone,
    templateName: t.name,
    language: t.language,
    headerType: t.headerType,
    headerMediaUrl: image,
    headerParams: r.headerParams,
    bodyParams: r.bodyParams,
    catalogButtonIndex: catIdx,
    catalogThumbnailProductId,
    urlButtonParams,
    otpCode: resolvedOtp,
  });
  return { ...res, provider, text };
}

/** Meta needs an approved template; the local session can send any saved one. */
export function templateSendable(s: Setting, t: Pick<Template, "status" | "category">) {
  return s.provider === "LOCAL" || t.status === "APPROVED";
}

/** Secret in the WAHA webhook URL, derived from AUTH_SECRET so it needs no extra setup. */
export async function wahaWebhookKey() {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update("waha-webhook").digest("hex").slice(0, 32);
}
