"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getSettings, wahaConfig, wahaWebhookKey } from "@/lib/provider";
import { requireAdmin } from "@/lib/session";
import { getQr, getSession, logoutSession, startSession, stopSession, type WahaStatus } from "@/lib/waha";
import type { ActionResult } from "./templates";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export async function setProvider(provider: "META" | "LOCAL"): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  await db.setting.upsert({ where: { id: 1 }, update: { provider }, create: { id: 1, provider } });
  revalidatePath("/dashboard", "layout");
  return {
    ok: true,
    message: provider === "META" ? "Now sending through Meta's WhatsApp Cloud API." : "Now sending through your local WhatsApp session.",
  };
}

export async function saveWahaSettings(input: { url: string; apiKey: string; session: string }): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const url = input.url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/.test(url)) return { ok: false, message: "Enter the WAHA server address, e.g. https://waha.yourdomain.com" };
  const session = input.session.trim() || "default";
  if (!/^[\w-]{1,64}$/.test(session)) return { ok: false, message: "Session name can use letters, numbers, - and _." };
  const current = await getSettings();
  const apiKey = input.apiKey.trim() || current.wahaApiKey;
  if (!apiKey) return { ok: false, message: "Enter the WAHA API key." };
  await db.setting.update({ where: { id: 1 }, data: { wahaUrl: url, wahaApiKey: apiKey, wahaSession: session } });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "WAHA details saved." };
}

export type SessionState = { status: WahaStatus | "NOT_CONFIGURED"; phone?: string; name?: string; qr?: string | null; error?: string };

/** Polled by the settings page while linking a phone. */
export async function getSessionState(): Promise<SessionState> {
  const scope = await requireAdmin();
  if ("denied" in scope) return { status: "NOT_CONFIGURED", error: scope.denied };
  const cfg = wahaConfig(await getSettings());
  if (!cfg) return { status: "NOT_CONFIGURED" };
  const s = await getSession(cfg);
  if (s.status !== "SCAN_QR_CODE") return s;
  try {
    return { ...s, qr: await getQr(cfg) };
  } catch (e) {
    return { ...s, qr: null, error: errText(e) };
  }
}

export async function connectSession(): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const cfg = wahaConfig(await getSettings());
  if (!cfg) return { ok: false, message: "Save the WAHA details first." };
  const h = await headers();
  const origin = process.env.PUBLIC_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  try {
    await startSession(cfg, `${origin}/api/waha/webhook?key=${await wahaWebhookKey()}`);
    return { ok: true, message: "Session starting. Scan the QR code when it appears." };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}

export async function disconnectSession(mode: "logout" | "stop"): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const cfg = wahaConfig(await getSettings());
  if (!cfg) return { ok: false, message: "WAHA isn't set up." };
  try {
    if (mode === "logout") await logoutSession(cfg);
    else await stopSession(cfg);
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: mode === "logout" ? "Phone unlinked. Scan a new QR code to link again." : "Session stopped." };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}
