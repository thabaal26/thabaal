import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { after } from "next/server";
import { db } from "./db";
import { APP_TZ } from "./format";
import { itemsText, orderRef, type OrderItem } from "./orders";

// The client's Google Sheet live log (deploy/google-sheets/Code.gs): each event lands in its own tab.

export type SheetLiveEvent = "NEW_CHAT" | "BUTTON_CLICK" | "NEW_ORDER" | "ORDER_UPDATE" | "CAMPAIGN_STATUS" | "TEST";

async function send(url: string, event: SheetLiveEvent, data: Record<string, unknown>) {
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      // The script checks `secret` when its SECRET property is set, so only the portal can write.
      body: JSON.stringify({ event, data, secret: process.env.GOOGLE_SHEET_WEBHOOK_SECRET || undefined }),
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

/** The webhook URL, forgiving the usual paste mistakes (surrounding quotes or spaces). */
const rawHook = () => (process.env.GOOGLE_SHEET_WEBHOOK_URL ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

const hook = () => {
  const url = rawHook();
  return url.startsWith("https://script.google.com/") ? url : null;
};

/** Whether this deployment can send to the sheet, for the Sheet page. Never reveals the URL. */
export function sheetHookStatus(): { state: "on" | "off" | "invalid"; hint: string } {
  const raw = rawHook();
  if (!raw) return { state: "off", hint: "GOOGLE_SHEET_WEBHOOK_URL isn't set in this deployment's environment variables." };
  if (!hook()) return { state: "invalid", hint: "GOOGLE_SHEET_WEBHOOK_URL is set but isn't an Apps Script web app link (it must start with https://script.google.com/)." };
  return { state: "on", hint: process.env.GOOGLE_SHEET_WEBHOOK_SECRET ? "Sending with a shared secret." : "Sending without a shared secret." };
}

/** Sends a test event right away and reports the script's own answer, so the setup can be checked from the portal. */
export async function testSheetPush(): Promise<{ ok: boolean; message: string }> {
  const url = hook();
  const status = sheetHookStatus();
  if (!url) return { ok: false, message: status.hint };
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "TEST", data: { note: "Test from the portal's Google Sheet page" }, secret: process.env.GOOGLE_SHEET_WEBHOOK_SECRET || undefined }),
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
 * Sends an event to the configured Google Apps Script webhook without slowing the request down.
 * It runs in `after()`: a fire-and-forget promise is dropped on Vercel once the response has gone,
 * so rows never arrived. Failures are logged, never thrown.
 */
export function pushToGoogleSheet(event: SheetLiveEvent, data: Record<string, unknown>): void {
  const url = hook();
  if (url) later(() => send(url, event, data));
}

const STATUS_WORD: Record<string, string> = { NEW: "New", CONFIRMED: "Confirmed", PAID: "Paid", DISPATCHED: "Dispatched", DELIVERED: "Delivered", CANCELLED: "Cancelled" };

/**
 * The order's full, current row for the sheet's Live Orders tab (one row per order, updated in place)
 * and a line in Order History. Reads the order after the change, so the sheet always matches the portal.
 */
export function pushOrderToSheet(orderId: string, event: "NEW_ORDER" | "ORDER_UPDATE", change?: string): void {
  const url = hook();
  if (!url) return;
  later(async () => {
    const o = await db.order
      .findUnique({ where: { id: orderId }, include: { customer: { select: { name: true, phone: true, location: true } }, client: { select: { name: true } } } })
      .catch(() => null);
    if (!o) return;
    const status = STATUS_WORD[o.status] ?? o.status;
    await send(url, event, {
      orderId: orderRef(o),
      created: formatInTimeZone(o.createdAt, APP_TZ, "yyyy-MM-dd HH:mm:ss"),
      status,
      name: o.customer.name,
      phone: o.customer.phone,
      items: itemsText((o.items as OrderItem[] | null) ?? []),
      total: o.total,
      paid: o.paidAt ? `Yes, ${formatInTimeZone(o.paidAt, APP_TZ, "d MMM h:mm a")}${o.paymentTxnId ? ` (${o.paymentTxnId})` : ""}` : "No",
      address: o.note || o.customer.location || "",
      client: o.client.name,
      change: change ?? status,
    });
  });
}
