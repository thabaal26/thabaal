import "server-only";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { db } from "./db";
import { getSettings } from "./provider";
import { replyWindowEnd } from "./replies";
import { senderFor } from "./senders";
import { sendCatalogMessage } from "./whatsapp";

// The free way to show the catalogue: a catalogue message inside the customer's 24-hour window
// (a service message), instead of a paid marketing template.

const LOG_NAME = "Catalogue";
/** An automatic catalogue reply goes to the same customer at most once in this long. */
const AUTO_GAP_MS = 12 * 3_600_000;

/** A button tap or message asking to see products or prices. */
const WANTS_CATALOGUE = /\b(price|prices|rate|rates|catalog|catalogue|menu|list|products?|order now)\b|விலை|பட்டியல்/i;

export function wantsCatalogue(text: string, kind: string) {
  return (kind === "button" || kind === "text") && WANTS_CATALOGUE.test(text);
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

/** The customer asked about products or prices (e.g. tapped "Send price list"): send the catalogue, at most twice a day. */
export async function autoSendCatalogue(customerId: string) {
  const recent = await db.message.findFirst({ where: { customerId, templateName: LOG_NAME, createdAt: { gte: new Date(Date.now() - AUTO_GAP_MS) } }, select: { id: true } });
  if (recent) return;
  const r = await sendCatalogueTo(customerId);
  if (!r.ok) console.warn(`Automatic catalogue reply not sent: ${r.message}`);
}
