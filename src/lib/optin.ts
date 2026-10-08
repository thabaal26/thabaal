import "server-only";
import { db } from "./db";
import { receivingNumber } from "./replies";
import { numberConfig } from "./senders";
import { sendTextMessage } from "./whatsapp";

// Opt-in links and QR codes: a customer scans, WhatsApp opens with "JOIN van" typed in,
// and sending it adds them as an opted-in customer tagged with where they found us.

/** "JOIN", or "JOIN <source>" where source is a short word like van, shop or website. */
export const JOIN_RE = /^\s*join(?:\s+([a-z0-9][\w-]{0,29}))?\s*$/i;

export const joinText = (source: string) => (source ? `JOIN ${source}` : "JOIN");

/** wa.me link that opens WhatsApp to this number with the join message ready to send. */
export function joinLink(phoneDigits: string, source: string) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(joinText(source))}`;
}

/**
 * Adds (or re-subscribes) the customer who sent a JOIN message to the client that owns the
 * receiving number, then welcomes them. Customers who once replied STOP opt back in, since
 * sending JOIN is fresh consent.
 */
export async function joinFromWhatsApp(m: { phone: string; profileName?: string; source?: string; phoneNumberId?: string }) {
  const { number, customers } = await receivingNumber(m.phoneNumberId);
  // The shared env number can serve several clients; only add when it's unambiguous.
  const clients = number
    ? [{ id: number.clientId }]
    : await db.client.findMany({ where: { numbers: { none: {} } }, select: { id: true }, take: 2 });
  if (clients.length !== 1) return null;
  const clientId = clients[0].id;

  const source = (m.source ?? "whatsapp").toLowerCase();
  const tag = `joined-${source}`;
  const existing = await db.customer.findFirst({ where: { phone: m.phone, ...customers, clientId }, select: { id: true, tags: true, optInSource: true } });
  const customer = existing
    ? await db.customer.update({
        where: { id: existing.id },
        data: {
          optedOut: false,
          tags: existing.tags.includes(tag) ? existing.tags : [...existing.tags, tag],
          ...(!existing.optInSource && { optInSource: `WhatsApp JOIN (${source})`, optInAt: new Date() }),
        },
        select: { id: true },
      })
    : await db.customer.create({
        data: {
          clientId,
          phone: m.phone,
          name: m.profileName?.trim() || `+${m.phone}`,
          tags: [tag],
          optInSource: `WhatsApp JOIN (${source})`,
          optInAt: new Date(),
        },
        select: { id: true },
      });

  await welcome(clientId, number?.id ?? null, customer.id, m.phone).catch((e) => console.error("Could not send welcome message", e));
  return { customerId: customer.id, isNew: !existing };
}

/** A typed welcome from the number they wrote to; allowed without a template because they just wrote to us. */
async function welcome(clientId: string, numberId: string | null, customerId: string, phone: string) {
  const [client, number] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { name: true, waToken: true } }),
    numberId ? db.whatsAppNumber.findUnique({ where: { id: numberId } }) : null,
  ]);
  if (!client) return;
  const cfg = numberConfig(number, client.waToken);
  const body = `Welcome to ${client.name}! 🎉 You'll now get our offers and updates here on WhatsApp. Reply STOP anytime to unsubscribe.`;
  const { id, simulated } = await sendTextMessage(cfg, phone, body);
  await db.message.create({
    data: { customerId, templateName: "Welcome", body, status: "SENT", waMessageId: id, simulated, provider: "META", sentAt: new Date(), senderId: numberId },
  });
}
