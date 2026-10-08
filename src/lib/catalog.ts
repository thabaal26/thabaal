import "server-only";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { getSettings } from "./provider";
import { replyWindowEnd } from "./replies";
import { senderFor } from "./senders";
import { sendCatalogMessage } from "./whatsapp";

// The free way to show the catalogue: a catalogue message inside the customer's 24-hour window
// (a service message), instead of a paid marketing template.

const LOG_NAME = "Catalogue";
/** Replies to greetings and first messages go to the same customer at most once in this long. */
const AUTO_GAP_MS = 12 * 3_600_000;
/** A customer who asks (button tap, price question) always gets it; this only ignores double taps. */
const ASKED_GAP_MS = 2 * 60_000;

/** A button tap or message asking to see products or prices. */
const WANTS_CATALOGUE = /\b(price|prices|rate|rates|catalog|catalogue|menu|list|products?|order now)\b|விலை|பட்டியல்/i;

/** "Hi", "Hello", "Vanakkam", "Good morning"… the usual way customers open a chat. */
const GREETING = /^\s*(hi+|hello+|helo|hey+|hai+|vanakkam|good\s*(morning|afternoon|evening))\b|வணக்கம்/i;

/** "asked" for an explicit request (button tap, price question), "greeting" for a hello, else null. */
export function catalogueTrigger(text: string, kind: string): "asked" | "greeting" | null {
  if (kind !== "button" && kind !== "text") return null;
  if (WANTS_CATALOGUE.test(text)) return "asked";
  return GREETING.test(text) ? "greeting" : null;
}

/** True when this is the customer's first message today (app time zone); call after saving the reply. */
export async function firstMessageToday(customerId: string) {
  const today = fromZonedTime(`${formatInTimeZone(new Date(), APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
  return (await db.reply.count({ where: { customerId, receivedAt: { gte: today } } })) <= 1;
}

/** Sends the "View catalogue" message to a customer whose 24-hour window is open. */
export async function sendCatalogueTo(customerId: string): Promise<{ ok: boolean; message: string }> {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true, clientId: true, optedOut: true, client: { select: { name: true } } } });
  if (!c) return { ok: false, message: "Customer not found." };
  if (c.optedOut) return { ok: false, message: "This customer opted out of messages." };
  if ((await getSettings()).provider !== "META") return { ok: false, message: "Catalogue messages need the WhatsApp Cloud API." };
  const last = await db.reply.findFirst({ where: { customerId: c.id }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true, senderId: true } });
  if (!replyWindowEnd(last?.receivedAt))
    return { ok: false, message: "WhatsApp only allows this within 24 hours of the customer's last message. Use a catalogue template instead (paid)." };

  const { number, cfg } = await senderFor(c.clientId, last?.senderId);
  const first = c.name.trim().split(/\s+/)[0] || "there";
  const body = `Hi ${first}, here is the full ${c.client.name} range. Tap "View catalog", add what you need to your cart and send it. We will send you a payment link right away.`;
  try {
    const res = await sendCatalogMessage(cfg, c.phone, body);
    await db.message.create({
      data: { customerId: c.id, templateName: LOG_NAME, body, status: "SENT", waMessageId: res.id, simulated: res.simulated, provider: "META", sentAt: new Date(), senderId: number?.id ?? null },
    });
    return { ok: true, message: res.simulated ? "Simulated catalogue message logged (demo mode)." : `Catalogue sent to ${c.name}.` };
  } catch (e) {
    return { ok: false, message: explainSendError(e).error };
  }
}

/**
 * Sends the catalogue when a customer asks for it (every time, bar double taps) or opens the chat with a
 * greeting or their first message of the day (at most once every 12 hours, so hellos don't repeat it).
 */
export async function autoSendCatalogue(customerId: string, trigger: "asked" | "greeting") {
  const gap = trigger === "asked" ? ASKED_GAP_MS : AUTO_GAP_MS;
  const recent = await db.message.findFirst({ where: { customerId, templateName: LOG_NAME, createdAt: { gte: new Date(Date.now() - gap) } }, select: { id: true } });
  if (recent) return;
  const r = await sendCatalogueTo(customerId);
  if (!r.ok) console.warn(`Automatic catalogue reply not sent: ${r.message}`);
}
