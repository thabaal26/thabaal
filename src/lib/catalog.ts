import "server-only";
import fs from "node:fs";
import path from "node:path";
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

/** A write to Meta's Graph API with this number's token. */
async function metaPost<T>(cfg: WaConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta API error (${res.status})`);
  return json as T;
}

export type CatalogProduct = { retailerId: string; name: string; price: string | null; inStock: boolean };

export type CatalogProductDetail = {
  id: string;
  retailerId: string;
  name: string;
  price: string | null;
  priceAmount: number;
  currency: string;
  inStock: boolean;
  description: string | null;
  imageUrl: string | null;
  category: string;
};

export function detectCategory(name: string): string {
  if (/oil/i.test(name)) return "Oils";
  if (/ghee|karupatti|nattusakkarai|jaggery|sugar/i.test(name)) return "Ghee & Sweeteners";
  if (/powder|masala|chilli|coriander|turmeric/i.test(name)) return "Masala Powders";
  if (/flour|atta|millet|ragi|kambu|wheat|corn/i.test(name)) return "Flours & Millets";
  return "General";
}

const DEFAULT_PRODUCTS: CatalogProductDetail[] = [
  { id: "28533919819570391", retailerId: "THN-006", name: "Gingelly oil", price: "₹ 460.00", priceAmount: 460, currency: "INR", inStock: true, description: "With pure karupatti, No filter", imageUrl: "https://thenanoils.com/wp-content/uploads/2020/07/gingelly-tb1.jpg", category: "Oils" },
  { id: "28961811863435175", retailerId: "THN-004", name: "Groundnut oil 1l", price: "₹ 360.00", priceAmount: 360, currency: "INR", inStock: true, description: "With Farm fresh Sun-dried Groundnut", imageUrl: "https://thenanoils.com/wp-content/uploads/2020/07/groundt-tb1.jpg", category: "Oils" },
  { id: "29177042811888422", retailerId: "THN-003", name: "Sulphur free Coconut oil", price: "₹ 510.00", priceAmount: 510, currency: "INR", inStock: true, description: "Sulphur free Coconut oil", imageUrl: "https://thenanoils.com/wp-content/uploads/2020/07/coconut-tb1.jpg", category: "Oils" },
  { id: "29237072485885455", retailerId: "THN-013", name: "Moringa oil 100ml", price: "₹ 450.00", priceAmount: 450, currency: "INR", inStock: true, description: "Cold pressed Moringa oil", imageUrl: null, category: "Oils" },
  { id: "28740068018961461", retailerId: "THN-002", name: "Almond oil", price: "₹ 320.00", priceAmount: 320, currency: "INR", inStock: true, description: "100% pure Almonds are cold pressed", imageUrl: null, category: "Oils" },
  { id: "28751526634532891", retailerId: "THN-001", name: "Black Cumin oil 50ml", price: "₹ 130.00", priceAmount: 130, currency: "INR", inStock: true, description: "100% Black cumin is cold pressed", imageUrl: null, category: "Oils" },
  { id: "28984058941281149", retailerId: "THN-014", name: "Cold pressed Castor oil 100ml", price: "₹ 150.00", priceAmount: 150, currency: "INR", inStock: true, description: "100% pure castor seeds are cold pressed", imageUrl: null, category: "Oils" },
  { id: "28978223988477530", retailerId: "THN-005", name: "Flax seed oil 100ml", price: "₹ 130.00", priceAmount: 130, currency: "INR", inStock: true, description: "100% pure Flaxseeds are cold pressed", imageUrl: null, category: "Oils" },
  { id: "28475377258789174", retailerId: "THN-020", name: "Neem oil 100ml", price: "₹ 120.00", priceAmount: 120, currency: "INR", inStock: true, description: "100% Pure cold pressed Neem oil", imageUrl: null, category: "Oils" },
  { id: "29017221287967440", retailerId: "THN-008", name: "Turmeric Powder 100g", price: "₹ 60.00", priceAmount: 60, currency: "INR", inStock: true, description: "100% Pure. Sun-dried turmeric", imageUrl: "https://thenanoils.com/wp-content/uploads/2021/02/turmericpowder.jpg", category: "Masala Powders" },
  { id: "28940097145615164", retailerId: "THN-018", name: "Karupatti", price: "₹ 550.00", priceAmount: 550, currency: "INR", inStock: true, description: "Farm fresh, try it for the purity", imageUrl: "https://thenanoils.com/wp-content/uploads/2021/02/karupetti.jpg", category: "Ghee & Sweeteners" },
  { id: "28543900408594949", retailerId: "THN-021", name: "Corn Flour 1kg", price: "₹ 90.00", priceAmount: 90, currency: "INR", inStock: true, description: "Corn Flour", imageUrl: null, category: "Flours & Millets" },
  { id: "THN-007-item", retailerId: "THN-007", name: "Coriander powder", price: "₹ 40.00", priceAmount: 40, currency: "INR", inStock: true, description: "Pure ground coriander seeds", imageUrl: null, category: "Masala Powders" },
  { id: "THN-010-item", retailerId: "THN-010", name: "Chilli powder 100g", price: "₹ 55.00", priceAmount: 55, currency: "INR", inStock: true, description: "Pure sun-dried red chilli powder", imageUrl: null, category: "Masala Powders" },
  { id: "THN-011-item", retailerId: "THN-011", name: "Ghee 100ml", price: "₹ 150.00", priceAmount: 150, currency: "INR", inStock: true, description: "Pure traditional cow ghee", imageUrl: null, category: "Ghee & Sweeteners" },
  { id: "THN-012-item", retailerId: "THN-012", name: "Wheat atta 1kg", price: "₹ 80.00", priceAmount: 80, currency: "INR", inStock: true, description: "Stone ground whole wheat atta", imageUrl: null, category: "Flours & Millets" },
];

function getOverrides(clientId: string): Record<string, Partial<CatalogProductDetail>> {
  try {
    const file = path.join(process.cwd(), "prisma", "data", "catalog-overrides.json");
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf8");
    const data = JSON.parse(raw);
    return data[clientId] || {};
  } catch {
    return {};
  }
}

function saveOverride(clientId: string, productId: string, updates: Partial<CatalogProductDetail>) {
  try {
    const dir = path.join(process.cwd(), "prisma", "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "catalog-overrides.json");
    let data: Record<string, Record<string, Partial<CatalogProductDetail>>> = {};
    if (fs.existsSync(file)) {
      data = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
    }
    if (!data[clientId]) data[clientId] = {};
    data[clientId][productId] = { ...(data[clientId][productId] || {}), ...updates };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn("Failed saving catalog override:", e);
  }
}

/** Fetches full catalog products with stock, price, category and descriptions for the client. */
export async function getCatalogWithProducts(clientId: string): Promise<{
  catalogId: string | null;
  products: CatalogProductDetail[];
  commerceManagerUrl: string | null;
  isLive: boolean;
}> {
  const { cfg } = await senderFor(clientId);
  const overrides = getOverrides(clientId);

  if (!cfg.live) {
    const merged = DEFAULT_PRODUCTS.map((p) => {
      const ovr = overrides[p.id] || overrides[p.retailerId];
      return ovr ? { ...p, ...ovr } : p;
    });
    return { catalogId: "1074235682263970", products: merged, commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
  }

  try {
    const catalogs = await metaGet<{ data: { id: string }[] }>(cfg, `${cfg.wabaId}/product_catalogs?fields=id`);
    const catalogId = catalogs.data?.[0]?.id ?? null;
    if (!catalogId) {
      const merged = DEFAULT_PRODUCTS.map((p) => {
        const ovr = overrides[p.id] || overrides[p.retailerId];
        return ovr ? { ...p, ...ovr } : p;
      });
      return { catalogId: null, products: merged, commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
    }

    const out: CatalogProductDetail[] = [];
    let path: string | null = `${catalogId}/products?fields=id,retailer_id,name,price,availability,description,image_url&limit=100`;

    while (path) {
      const page: {
        data: { id: string; retailer_id: string; name: string; price?: string; availability?: string; description?: string; image_url?: string }[];
        paging?: { next?: string };
      } = await metaGet(cfg, path);

      for (const p of page.data ?? []) {
        const priceNum = p.price ? Number(p.price.replace(/[^\d.]/g, "")) || 0 : 0;
        const item: CatalogProductDetail = {
          id: p.id,
          retailerId: p.retailer_id,
          name: p.name,
          price: p.price ?? null,
          priceAmount: priceNum,
          currency: "INR",
          inStock: p.availability !== "out of stock",
          description: p.description ?? null,
          imageUrl: p.image_url ?? null,
          category: detectCategory(p.name),
        };
        const ovr = overrides[item.id] || overrides[item.retailerId];
        out.push(ovr ? { ...item, ...ovr } : item);
      }
      path = page.paging?.next ? page.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : null;
    }

    return {
      catalogId,
      products: out.length ? out : DEFAULT_PRODUCTS,
      commerceManagerUrl: `https://business.facebook.com/commerce_manager/${catalogId}/products`,
      isLive: true,
    };
  } catch (e) {
    console.warn("Could not fetch Meta catalog, using cached:", e);
    const merged = DEFAULT_PRODUCTS.map((p) => {
      const ovr = overrides[p.id] || overrides[p.retailerId];
      return ovr ? { ...p, ...ovr } : p;
    });
    return { catalogId: "1074235682263970", products: merged, commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
  }
}

/** Updates a product's price, stock, name or description on Meta WhatsApp Catalog and in local storage. */
export async function updateCatalogProductItem(
  clientId: string,
  params: {
    id: string;
    retailerId?: string;
    priceAmount?: number;
    inStock?: boolean;
    name?: string;
    description?: string;
    imageUrl?: string | null;
  }
): Promise<{ ok: boolean; message: string; metaUpdated: boolean }> {
  const { cfg } = await senderFor(clientId);
  let metaUpdated = false;

  saveOverride(clientId, params.id, {
    ...(params.priceAmount !== undefined && { priceAmount: params.priceAmount, price: `₹ ${params.priceAmount.toFixed(2)}` }),
    ...(params.inStock !== undefined && { inStock: params.inStock }),
    ...(params.name && { name: params.name }),
    ...(params.description !== undefined && { description: params.description }),
    ...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
  });

  if (cfg.live) {
    try {
      const catalogs = await metaGet<{ data: { id: string }[] }>(cfg, `${cfg.wabaId}/product_catalogs?fields=id`);
      const catalogId = catalogs.data?.[0]?.id;
      if (catalogId) {
        const updateData: Record<string, unknown> = { id: params.id };
        if (params.priceAmount !== undefined) updateData.price = `${params.priceAmount.toFixed(2)} INR`;
        if (params.inStock !== undefined) updateData.availability = params.inStock ? "in stock" : "out of stock";
        if (params.name) updateData.name = params.name;
        if (params.description !== undefined) updateData.description = params.description;

        await metaPost(cfg, `${catalogId}/items_batch`, {
          item_type: "PRODUCT_ITEM",
          requests: [{ method: "UPDATE", data: updateData }],
        });
        metaUpdated = true;
      }
    } catch (e) {
      console.warn("Meta batch update error:", e);
    }
  }

  return {
    ok: true,
    metaUpdated,
    message: metaUpdated ? "Updated and synced directly with Meta WhatsApp Catalog." : "Product saved and updated in catalogue.",
  };
}

/** Every product in the catalogue linked to this WhatsApp Business Account, with its display price. */
export async function listCatalogProducts(cfg: WaConfig): Promise<CatalogProduct[]> {
  if (!cfg.live) return DEFAULT_PRODUCTS.map((p) => ({ retailerId: p.retailerId, name: p.name, price: p.price, inStock: p.inStock }));
  const catalogs = await metaGet<{ data: { id: string }[] }>(cfg, `${cfg.wabaId}/product_catalogs?fields=id`).catch(() => ({ data: [] }));
  const catalogId = catalogs.data?.[0]?.id;
  if (!catalogId) return DEFAULT_PRODUCTS.map((p) => ({ retailerId: p.retailerId, name: p.name, price: p.price, inStock: p.inStock }));
  const out: CatalogProduct[] = [];
  let path: string | null = `${catalogId}/products?fields=retailer_id,name,price,availability&limit=100`;
  while (path) {
    const page: { data: { retailer_id: string; name: string; price?: string; availability?: string }[]; paging?: { next?: string } } = await metaGet(cfg, path);
    for (const p of page.data ?? []) out.push({ retailerId: p.retailer_id, name: p.name, price: p.price ?? null, inStock: p.availability !== "out of stock" });
    path = page.paging?.next ? page.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : null;
  }
  return out.length ? out : DEFAULT_PRODUCTS.map((p) => ({ retailerId: p.retailerId, name: p.name, price: p.price, inStock: p.inStock }));
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
