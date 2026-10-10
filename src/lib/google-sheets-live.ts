import "server-only";

export type SheetLiveEvent = "NEW_CHAT" | "BUTTON_CLICK" | "NEW_ORDER" | "CAMPAIGN_STATUS";

/**
 * Dispatches an event payload in the background to the configured Google Apps Script Webhook.
 * Fails gracefully with a server log so it never blocks or slows down WhatsApp webhooks, 
 * database transactions, or customer messaging.
 */
export async function pushToGoogleSheet(event: SheetLiveEvent, data: Record<string, unknown>): Promise<void> {
  const url = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  if (!url || !url.startsWith("https://script.google.com")) {
    return;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
    if (!res.ok) {
      console.warn(`[GoogleSheetLive] Webhook returned status ${res.status}`);
    }
  } catch (err) {
    console.warn("[GoogleSheetLive] Background push failed:", err);
  }
}
