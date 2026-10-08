import "server-only";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { getSettings } from "./provider";
import { replyWindowEnd } from "./replies";
import { senderFor } from "./senders";
import { sendCatalogMessage, sendTextMessage, type WaConfig } from "./whatsapp";

// The free way to show the catalogue: a catalogue message inside the customer's 24-hour window
// (a service message), instead of a paid marketing template.

const LOG_NAME = "Catalogue";
/** Replies to greetings and first messages go to the same customer at most once in this long. */
const AUTO_GAP_MS = 12 * 3_600_000;
/** A customer who asks (button tap, price question) always gets it; this only ignores double taps. */
const ASKED_GAP_MS = 2 * 60_000;

/** Asking what things cost: answered with a price list, then the catalogue. */
const WANTS_PRICES = /\b(price|prices|rate|rates|cost|list)\b|விலை|பட்டியல்/i;
/** Asking to order or browse: answered with the catalogue. */
const WANTS_CATALOGUE = /\b(catalog|catalogue|menu|products?|order now)\b/i;

/** "Hi", "Hello", "Vanakkam", "Good morning"… the usual way customers open a chat. */
const GREETING = /^\s*(hi+|hello+|helo|hey+|hai+|vanakkam|good\s*(morning|afternoon|evening))\b|வணக்கம்/i;

export type CatalogueTrigger = "prices" | "asked" | "greeting";

/** "prices" for a price question or "Send price list", "asked" to order or browse, "greeting" for a hello, else null. */
export function catalogueTrigger(text: string, kind: string): CatalogueTrigger | null {
  if (kind !== "button" && kind !== "text") return null;
  if (WANTS_PRICES.test(text)) return "prices";
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
export async function autoSendCatalogue(customerId: string, trigger: CatalogueTrigger) {
  const gap = trigger === "greeting" ? AUTO_GAP_MS : ASKED_GAP_MS;
  const recent = await db.message.findFirst({ where: { customerId, templateName: LOG_NAME, createdAt: { gte: new Date(Date.now() - gap) } }, select: { id: true } });
  if (recent) return;
  // A price question gets the list first; the catalogue below it is how they order.
  if (trigger === "prices") await sendPriceList(customerId).catch((e) => console.warn("Price list not sent", e));
  const r = await sendCatalogueTo(customerId);
  if (!r.ok) console.warn(`Automatic catalogue reply not sent: ${r.message}`);
}

/**
 * Quick-reply buttons on campaign templates that get a fixed answer instead of the catalogue.
 * `then: "catalogue"` also sends the catalogue so the customer can start choosing.
 */
const BUTTON_REPLIES: { match: RegExp; reply: (first: string, business: string) => string; then?: "catalogue" }[] = [
  {
    match: /^\s*make a gift pack\s*$/i,
    reply: (first, business) =>
      `நன்றி ${first}! 🎁 உங்கள் தீபாவளி பரிசுப் பெட்டியை தயார் செய்ய எங்கள் குழு விரைவில் உங்களை அழைக்கும்.

Thank you! Our ${business} team will call you shortly to put together your Deepavali gift pack. Meanwhile, browse our products below. 🪔`,
    then: "catalogue",
  },
  {
    match: /^\s*happy (deepavali|diwali)\s*$/i,
    reply: (first, business) =>
      `நன்றி ${first}! 🪔✨ உங்களுக்கும் உங்கள் குடும்பத்தினருக்கும் இனிய தீபாவளி நல்வாழ்த்துக்கள்! 💛

Thank you, and a very Happy Deepavali to you and your family from all of us at ${business}! 🙏`,
  },
];

/**
 * Answers a campaign button that has its own reply (e.g. "Make a gift pack"). Returns true when the tap
 * was one of those, so the caller doesn't also treat it as a greeting. Double taps within 2 minutes are ignored.
 */
export async function autoReplyToButton(customerId: string, text: string, kind: string) {
  if (kind !== "button" && kind !== "text") return false;
  const rule = BUTTON_REPLIES.find((r) => r.match.test(text));
  if (!rule) return false;
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true, clientId: true, optedOut: true, client: { select: { name: true } } } });
  if (!c || c.optedOut || (await getSettings()).provider !== "META") return true;
  const recent = await db.message.findFirst({ where: { customerId, templateName: "Auto reply", createdAt: { gte: new Date(Date.now() - ASKED_GAP_MS) } }, select: { id: true } });
  if (recent) return true;
  const last = await db.reply.findFirst({ where: { customerId }, orderBy: { receivedAt: "desc" }, select: { senderId: true } });
  const { number, cfg } = await senderFor(c.clientId, last?.senderId);
  const body = rule.reply(c.name.trim().split(/\s+/)[0] || "", c.client.name);
  const res = await sendTextMessage(cfg, c.phone, body);
  await db.message.create({
    data: { customerId: c.id, templateName: "Auto reply", body, status: "SENT", waMessageId: res.id, simulated: res.simulated, provider: "META", sentAt: new Date(), senderId: number?.id ?? null },
  });
  if (rule.then === "catalogue") await autoSendCatalogue(c.id, "asked");
  return true;
}

/** A read from Meta's Graph API with this number's token. */
async function metaGet<T>(cfg: WaConfig, path: string): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${path}`, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta API error (${res.status})`);
  return json as T;
}

export type CatalogProduct = { retailerId: string; name: string; price: string | null; inStock: boolean };

/** Every product in the catalogue linked to this WhatsApp Business Account, with its display price. */
export async function listCatalogProducts(cfg: WaConfig): Promise<CatalogProduct[]> {
  if (!cfg.live) return [];
  const catalogs = await metaGet<{ data: { id: string }[] }>(cfg, `${cfg.wabaId}/product_catalogs?fields=id`);
  const catalogId = catalogs.data?.[0]?.id;
  if (!catalogId) return [];
  const out: CatalogProduct[] = [];
  let path: string | null = `${catalogId}/products?fields=retailer_id,name,price,availability&limit=100`;
  while (path) {
    const page: { data: { retailer_id: string; name: string; price?: string; availability?: string }[]; paging?: { next?: string } } = await metaGet(cfg, path);
    for (const p of page.data ?? []) out.push({ retailerId: p.retailer_id, name: p.name, price: p.price ?? null, inStock: p.availability !== "out of stock" });
    path = page.paging?.next ? page.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : null;
  }
  return out;
}

const GROUPS: { title: string; match: RegExp }[] = [
  { title: "🫒 *Oils*", match: /oil/i },
  { title: "🍯 *Ghee & Sweeteners*", match: /ghee|karupatti|nattusakkarai|jaggery|sugar/i },
  { title: "🌶️ *Masala Powders*", match: /powder|masala/i },
  { title: "🌾 *Flours & Millets*", match: /flour|atta|millet|ragi|kambu/i },
];

/** "₹ 460.00" → "₹460"; Meta formats prices with the currency symbol and decimals. */
const shortPrice = (p: string | null) => (p ? p.replace(/\s+/g, "").replace(/\.00$/, "") : "");

/** The catalogue as a WhatsApp text, grouped by kind of product; out-of-stock items are left out. */
export function formatPriceList(business: string, products: CatalogProduct[]) {
  const items = products.filter((p) => p.inStock && p.price);
  const used = new Set<CatalogProduct>();
  const sections: string[] = [];
  for (const g of [...GROUPS, { title: "🧀 *More*", match: /./ }]) {
    const rows = items.filter((p) => !used.has(p) && g.match.test(p.name)).sort((a, b) => a.name.localeCompare(b.name));
    rows.forEach((p) => used.add(p));
    if (rows.length) sections.push(`${g.title}\n${rows.map((p) => `• ${p.name} – ${shortPrice(p.price)}`).join("\n")}`);
  }
  return `🛒 *${business} – Price List*\nவிலைப் பட்டியல்\n\n${sections.join("\n\n")}\n\nTap *View catalog* below to order 👇`;
}

/** Sends today's prices, read live from the catalogue so they always match it. */
async function sendPriceList(customerId: string) {
  const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, phone: true, clientId: true, optedOut: true, client: { select: { name: true } } } });
  if (!c || c.optedOut) return;
  const last = await db.reply.findFirst({ where: { customerId }, orderBy: { receivedAt: "desc" }, select: { senderId: true } });
  const { number, cfg } = await senderFor(c.clientId, last?.senderId);
  const products = await listCatalogProducts(cfg);
  if (!products.length) return;
  const body = formatPriceList(c.client.name, products).slice(0, 4096);
  const res = await sendTextMessage(cfg, c.phone, body);
  await db.message.create({
    data: { customerId: c.id, templateName: "Price list", body, status: "SENT", waMessageId: res.id, simulated: res.simulated, provider: "META", sentAt: new Date(), senderId: number?.id ?? null },
  });
}
