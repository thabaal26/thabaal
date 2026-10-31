import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { after } from "next/server";
import { db } from "./db";
import { APP_TZ } from "./format";
import { itemsText, orderRef, type OrderItem } from "./orders";
import { methodLabel, methodOf } from "./payment-state";
import { orderStage } from "./order-flow";
import { logSheetActivity, syncClientSheet } from "./gsheet/sync";

// The client's Google Sheet live log (deploy/google-sheets/Code.gs): each event lands in its own tab.

export type SheetLiveEvent = "NEW_CHAT" | "BUTTON_CLICK" | "NEW_ORDER" | "ORDER_UPDATE" | "CAMPAIGN_STATUS" | "TEST";

type Hook = { url: string; secret?: string };

async function send(hook: Hook, event: SheetLiveEvent, data: Record<string, unknown>) {
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      // The script checks `secret` when its SECRET property is set, so only the portal can write.
      body: JSON.stringify({ event, data, secret: hook.secret || undefined }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[GoogleSheetLive] ${event}: webhook returned status ${res.status}`);
  } catch (err) {
    console.warn(`[GoogleSheetLive] ${event}: push failed`, err);
  }
}

/** Runs `job` after the response, keeping a serverless function alive until it's done; directly outside a request. */
function later(job: () => Promise<void>) {
  try {
    after(job);
  } catch {
    void job();
  }
}

/**
 * The Apps Script web app URL, found inside whatever was pasted: the URL itself (with quotes or spaces),
 * a whole "NAME=https://…" line, or just the deployment ID (AKfycb…). Only script.google.com /exec links pass.
 */
export function parseSheetHook(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  const url = v.match(/https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec/)?.[0];
  if (url) return url;
  const id = v.replace(/^["'\s]+|["'\s]+$/g, "").match(/^AKfycb[\w-]{20,}$/)?.[0];
  return id ? `https://script.google.com/macros/s/${id}/exec` : null;
}

/** Why a pasted value isn't a web app link, in words. */
export function explainBadHook(raw: string): string {
  return /script\.google\.com\/home|projects\//.test(raw)
    ? "That's the Apps Script editor's address, not the web app link"
    : /^1[\w-]{40,}$/.test(raw)
      ? "That's the Script ID, not the web app link"
      : /\/dev/.test(raw)
        ? "That's the test (/dev) link; use the deployment's /exec link"
        : /script\.google\.com/.test(raw)
          ? "That's a script.google.com address that isn't a web app /exec link"
          : "That isn't an Apps Script web app link";
}

// The deployment-wide sheet (set up before each client had its own) belongs to one client only:
// GOOGLE_SHEET_CLIENT_ID, or else the first client created. Other clients' data never goes there.
let envOwner: Promise<string | null> | null = null;
function envSheetOwner(): Promise<string | null> {
  const pinned = process.env.GOOGLE_SHEET_CLIENT_ID?.trim();
  if (pinned) return Promise.resolve(pinned);
  envOwner ??= db.client
    .findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } })
    .then((c) => c?.id ?? null)
    .catch(() => {
      envOwner = null;
      return null;
    });
  return envOwner;
}

type HookSource = { hook: Hook | null; source: "own" | "shared" | "none"; invalid?: string };

async function resolveHook(clientId: string | null | undefined): Promise<HookSource> {
  if (!clientId) return { hook: null, source: "none" };
  const c = await db.client.findUnique({ where: { id: clientId }, select: { sheetHookUrl: true, sheetHookSecret: true } }).catch(() => null);
  if (!c) return { hook: null, source: "none" };
  if (c.sheetHookUrl) {
    const url = parseSheetHook(c.sheetHookUrl);
    return url ? { hook: { url, secret: c.sheetHookSecret || undefined }, source: "own" } : { hook: null, source: "none", invalid: explainBadHook(c.sheetHookUrl) };
  }
  const raw = (process.env.GOOGLE_SHEET_WEBHOOK_URL ?? "").trim();
  if (!raw || (await envSheetOwner()) !== clientId) return { hook: null, source: "none" };
  const url = parseSheetHook(raw);
  if (!url) return { hook: null, source: "none", invalid: `GOOGLE_SHEET_WEBHOOK_URL: ${explainBadHook(raw)}` };
  return { hook: { url, secret: process.env.GOOGLE_SHEET_WEBHOOK_SECRET || undefined }, source: "shared" };
}

/** Whether this client's events go to a sheet, for the Sheet page. Never reveals the link or secret. */
export async function sheetHookStatus(clientId: string): Promise<{ state: "on" | "off" | "invalid"; hint: string; source: HookSource["source"]; hasSecret: boolean }> {
  const r = await resolveHook(clientId);
  if (r.invalid) return { state: "invalid", hint: `${r.invalid}. Use Deploy → Manage deployments → Web app URL (ends in /exec).`, source: r.source, hasSecret: false };
  if (!r.hook) return { state: "off", hint: "No live-log sheet is linked for this business yet.", source: "none", hasSecret: false };
  const where = r.source === "shared" ? "Using the link set in the deployment settings." : "Using this business's own link.";
  return {
    state: "on",
    hint: `${where} ${r.hook.secret ? "Protected with a secret." : "No secret yet: anyone who finds the link could add rows. Add a secret below."}`,
    source: r.source,
    hasSecret: Boolean(r.hook.secret),
  };
}

/** Sends a test event right away and reports the script's own answer, so the setup can be checked from the portal. */
export async function testSheetPush(clientId: string): Promise<{ ok: boolean; message: string }> {
  const r = await resolveHook(clientId);
  if (!r.hook) return { ok: false, message: r.invalid ?? "Link this business's live-log sheet first." };
  try {
    const res = await fetch(r.hook.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "TEST", data: { note: "Test from the portal's Google Sheet page" }, secret: r.hook.secret || undefined }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let reply: { status?: string; message?: string; version?: string } | null = null;
    try {
      reply = JSON.parse(text);
    } catch {}
    if (!res.ok || !reply) return { ok: false, message: `The script didn't answer as expected (HTTP ${res.status}). Check it's deployed as a web app with access "Anyone".` };
    if (reply.status !== "success") return { ok: false, message: `The script refused it: ${reply.message ?? "unknown reason"}.` };
    return { ok: true, message: `Connected: the sheet saved a test row in "Other Events"${reply.version ? ` (${reply.version})` : ""}.` };
  } catch (e) {
    return { ok: false, message: `Couldn't reach the script: ${e instanceof Error ? e.message : "network error"}.` };
  }
}

/**
 * Sends an event to the client's own Google Apps Script webhook without slowing the request down.
 * It runs in `after()`: a fire-and-forget promise is dropped on Vercel once the response has gone,
 * so rows never arrived. Failures are logged, never thrown. No client, no sheet: events never cross clients.
 */
export function pushToGoogleSheet(clientId: string | null | undefined, event: SheetLiveEvent, data: Record<string, unknown>): void {
  if (!clientId) return;
  later(async () => {
    // The connected Google Sheet (lib/gsheet): a line in Activity for a button, then the sheet catches up.
    if (event === "BUTTON_CLICK")
      await logSheetActivity(clientId, {
        event: `Tapped "${String(data.buttonText ?? "a button").slice(0, 60)}"`,
        phone: typeof data.phone === "string" ? data.phone : null,
        customer: typeof data.name === "string" ? data.name : null,
        by: "Customer",
      });
    // Campaign messages arrive by the thousand: they show in Chats on the scheduler's next sync, not one by one.
    if (event !== "CAMPAIGN_STATUS") await syncClientSheet(clientId, 20_000).catch((e) => console.warn("[gsheet] sync failed", e));
    const { hook } = await resolveHook(clientId);
    if (hook) await send(hook, event, data);
  });
}

/** The order's step in the sheet, the same words as Orders (lib/order-flow.ts). */
const STATUS_WORD: Record<string, string> = {
  RECEIVED: "Order received",
  PAYMENT: "Payment processing",
  VERIFY: "Payment verification",
  CONFIRMED: "Order confirmed",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/**
 * The order's full, current row for the sheet's Live Orders tab (one row per order, updated in place)
 * and a line in Order History. Reads the order after the change, so the sheet always matches the portal.
 */
export function pushOrderToSheet(orderId: string, event: "NEW_ORDER" | "ORDER_UPDATE", change?: string): void {
  later(async () => {
    const o = await db.order
      .findUnique({ where: { id: orderId }, include: { customer: { select: { name: true, phone: true, location: true } }, client: { select: { name: true } } } })
      .catch(() => null);
    if (!o) return;
    const stage = orderStage(o);
    const status = STATUS_WORD[stage] ?? stage;
    // The connected Google Sheet (lib/gsheet): the step in Activity, then the sheet catches up.
    const items = (Array.isArray(o.items) ? (o.items as { name?: string; id?: string; quantity?: number }[]) : []).map((i) => `${Number(i.quantity) || 1} × ${i.name ?? i.id ?? "item"}`).join(", ");
    await logSheetActivity(o.clientId, {
      event: event === "NEW_ORDER" ? "Order placed" : (change ?? `Order: ${status}`),
      details: event === "NEW_ORDER" ? `${items} · ₹${Math.round(o.total).toLocaleString("en-IN")}`.slice(0, 400) : `Now: ${status}`,
      phone: o.customer.phone,
      customer: o.customer.name,
      orderRef: orderRef(o),
      by: event === "NEW_ORDER" || /^customer/i.test(change ?? "") ? "Customer" : "Shop",
    });
    await syncClientSheet(o.clientId, 20_000).catch((e) => console.warn("[gsheet] sync failed", e));
    const { hook } = await resolveHook(o.clientId);
    if (!hook) return;
    await send(hook, event, {
      orderId: orderRef(o),
      created: formatInTimeZone(o.createdAt, APP_TZ, "yyyy-MM-dd HH:mm:ss"),
      status,
      name: o.customer.name,
      phone: o.customer.phone,
      items: itemsText((o.items as OrderItem[] | null) ?? []),
      total: o.total,
      paid: o.paidAt
        ? `Yes, ${formatInTimeZone(o.paidAt, APP_TZ, "d MMM h:mm a")} ${methodOf(o) ? `· ${methodLabel(methodOf(o), true)}` : ""}${o.paymentTxnId ? ` (${o.paymentTxnId})` : ""}${o.refundAmount ? ` · refunded ${o.refundAmount}` : ""}`
        : (o.paidAmount ?? 0) > 0
          ? `Part: ${o.paidAmount} of ${o.total}`
          : methodOf(o) === "cod"
            ? "COD (to collect)"
            : o.paymentClaimedAt
              ? "Customer says paid (check)"
              : "No",
      address: o.note || o.customer.location || "",
      client: o.client.name,
      change: change ?? status,
    });
  });
}
