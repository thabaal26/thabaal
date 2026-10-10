import "server-only";
import { after } from "next/server";

export type SheetLiveEvent = "NEW_CHAT" | "BUTTON_CLICK" | "NEW_ORDER" | "CAMPAIGN_STATUS";

async function send(url: string, event: SheetLiveEvent, data: Record<string, unknown>) {
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.warn(`[GoogleSheetLive] ${event}: webhook returned status ${res.status}`);
  } catch (err) {
    console.warn(`[GoogleSheetLive] ${event}: push failed`, err);
  }
}

/**
 * Sends an event to the configured Google Apps Script webhook without slowing the request down.
 * It runs in `after()`, which keeps a serverless function alive until the send finishes: a
 * fire-and-forget promise is dropped on Vercel once the response has gone, so rows never arrived.
 * Outside a request (scripts), it's sent directly. Failures are logged, never thrown.
 */
export function pushToGoogleSheet(event: SheetLiveEvent, data: Record<string, unknown>): void {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url || !url.startsWith("https://script.google.com")) return;
  try {
    after(() => send(url, event, data));
  } catch {
    void send(url, event, data);
  }
}
