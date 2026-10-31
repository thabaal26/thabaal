import "server-only";
import fs from "node:fs";
import path from "node:path";
import { explainSendError } from "@/app/dashboard/actions/send-helpers";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";
import { APP_HOST, currentAppUrl, isOldAppUrl } from "./app-host";
import { chooseCatalogId } from "./catalog-pick";
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
  const body = `Hi ${first}, here is the full ${c.client.name} range. Tap "View catalog", add what you need to your cart and send it here. We'll take it from there: delivery and payment, right in this chat.`;
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
  whatsappStatus?: "APPROVED" | "PENDING" | "REJECTED" | "OUTDATED" | null;
};

/**
 * A product's group for reports: the catalogue's own product type when the business set one in Meta's
 * Commerce Manager, else a guess from common words across retail, food, beauty and services.
 */
export function detectCategory(name: string, productType?: string | null): string {
  const own = productType?.split(">").pop()?.trim();
  if (own) return own;
  const rules: [RegExp, string][] = [
    [/\b(combo|pack of|kit|gift|bundle|hamper)\b/i, "Combos & Gifts"],
    [/\b(oil|ghee|butter)\b/i, "Oils & Ghee"],
    [/(jaggery|sugar|honey|karupatti|sakkarai|sweet)/i, "Sweeteners"],
    [/(powder|masala|chilli|coriander|turmeric|spice|pickle)/i, "Spices & Masalas"],
    [/(rice|dal|flour|atta|millet|ragi|kambu|wheat|corn|grain|pulses)/i, "Grains & Flours"],
    [/(soap|shampoo|wash|cream|lotion|hair|skin|face)/i, "Personal Care"],
    [/(shirt|saree|kurti|dress|t-?shirt|jeans|top|wear|shoe|sandal)/i, "Clothing & Footwear"],
    [/(biryani|meal|thali|pizza|burger|dosa|idli|juice|coffee|tea|cake|snack)/i, "Food & Drinks"],
    [/(service|session|appointment|consult|class|haircut|spa|repair)/i, "Services"],
  ];
  return rules.find(([re]) => re.test(name))?.[1] ?? "Other";
}

/** The demo catalogue for portals not yet connected to Meta (sends are simulated). Made-up products. */
const DEFAULT_PRODUCTS: CatalogProductDetail[] = [
  ["001", "Basmati rice 5kg", 520, "Long-grain aged basmati rice", "Groceries"],
  ["002", "Toor dal 1kg", 160, "Unpolished toor dal", "Groceries"],
  ["003", "Wheat atta 5kg", 260, "Whole wheat chakki atta", "Groceries"],
  ["004", "Sunflower oil 1L", 150, "Refined sunflower oil", "Groceries"],
  ["005", "Coffee powder 500g", 310, "Filter coffee blend", "Groceries"],
  ["006", "Tea powder 250g", 140, "Strong CTC tea", "Groceries"],
  ["007", "Turmeric powder 100g", 45, "Sun-dried turmeric powder", "Groceries"],
  ["008", "Steel water bottle 1L", 449, "Leak-proof stainless steel bottle", "Home & Kitchen"],
  ["009", "Cotton bath towel", 299, "Soft, quick-dry cotton towel", "Home & Kitchen"],
  ["010", "Handwash refill 750ml", 120, "Gentle handwash, refill pack", "Personal Care"],
].map(([n, name, price, description, category]) => ({
  id: `DEMO-${n}-item`,
  retailerId: `SKU-${n}`,
  name: name as string,
  price: `₹ ${Number(price).toFixed(2)}`,
  priceAmount: price as number,
  currency: "INR",
  inStock: true,
  description: description as string,
  imageUrl: null,
  category: category as string,
}));

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

/**
 * The made-up grocery items are shown only when DEMO_CATALOGUE=1 (for trying the portal). Without it a business
 * that has no connected catalogue sees an empty list, never products it doesn't sell.
 */
const showDemoProducts = () => process.env.DEMO_CATALOGUE === "1";

/** The demo catalogue (sends simulated) with any edits made in demo mode. */
function demoProducts(clientId: string) {
  const overrides = getOverrides(clientId);
  const base = (showDemoProducts() ? DEFAULT_PRODUCTS : []).map((p) => {
    const ovr = overrides[p.id] || overrides[p.retailerId];
    return ovr ? { ...p, ...ovr } : p;
  }).filter((p) => !(p as { deleted?: boolean }).deleted);

  const defaultKeys = new Set(DEFAULT_PRODUCTS.flatMap((p) => [p.id, p.retailerId]));
  const addedMap = new Map<string, CatalogProductDetail>();
  for (const [key, val] of Object.entries(overrides)) {
    if (!defaultKeys.has(key) && !(val as { deleted?: boolean }).deleted && val.retailerId) {
      const existing = addedMap.get(val.retailerId);
      const merged = existing ? { ...existing, ...val } : (val as CatalogProductDetail);
      addedMap.set(val.retailerId, merged);
    }
  }
  return [...base, ...addedMap.values()];
}

/**
 * The catalogue this WhatsApp Business Account works with, or null when none is reachable.
 * First the catalogue Meta lists as connected; when that list is empty (Meta can return it empty even though
 * the catalogue is connected in WhatsApp Manager), the only catalogue owned by the same business.
 */
async function catalogIdFor(cfg: WaConfig): Promise<string | null> {
  const connected = await metaGet<{ data?: { id: string }[] }>(cfg, `${cfg.wabaId}/product_catalogs?fields=id`);
  const connectedIds = (connected.data ?? []).map((c) => c.id).filter(Boolean);
  if (connectedIds.length > 0) return chooseCatalogId(connectedIds, []);
  return chooseCatalogId([], await ownedCatalogIds(cfg));
}

/** Catalogues owned by the business that owns this WhatsApp account; empty when they can't be read. */
async function ownedCatalogIds(cfg: WaConfig): Promise<string[]> {
  try {
    const waba = await metaGet<{ owner_business_info?: { id?: string } }>(cfg, `${cfg.wabaId}?fields=owner_business_info`);
    const businessId = waba.owner_business_info?.id;
    if (!businessId) return [];
    const owned = await metaGet<{ data?: { id: string }[] }>(cfg, `${businessId}/owned_product_catalogs?fields=id&limit=5`);
    return (owned.data ?? []).map((c) => c.id).filter(Boolean);
  } catch (e) {
    console.warn("Could not read the business's catalogues:", e);
    return [];
  }
}

type MetaProduct = {
  id: string;
  retailer_id: string;
  name?: string;
  price?: string;
  availability?: string;
  description?: string;
  image_url?: string;
  capability_to_review_status?: { key: string; value: string }[];
  product_type?: string;
};

function toDetail(p: MetaProduct): CatalogProductDetail {
  // Items created without a title (e.g. by a bad upsert) have no name; show their SKU instead of crashing.
  const name = p.name?.trim() || p.retailer_id;
  const waReview = p.capability_to_review_status?.find((c) => c.key === "WHATSAPP")?.value as
    | "APPROVED"
    | "PENDING"
    | "REJECTED"
    | "OUTDATED"
    | undefined;

  return {
    id: p.id,
    retailerId: p.retailer_id,
    name,
    price: p.price ?? null,
    priceAmount: p.price ? Number(p.price.replace(/[^\d.]/g, "")) || 0 : 0,
    currency: "INR",
    inStock: p.availability !== "out of stock",
    description: p.description ?? null,
    imageUrl: currentAppUrl(p.image_url ?? null),
    category: detectCategory(name, p.product_type),
    whatsappStatus: waReview ?? null,
  };
}

/** One product of the catalogue by its SKU (retailer id), or null if it isn't there. */
async function findByRetailerId(cfg: WaConfig, catalogId: string, retailerId: string) {
  const filter = encodeURIComponent(JSON.stringify({ retailer_id: { eq: retailerId } }));
  const res = await metaGet<{ data: MetaProduct[] }>(cfg, `${catalogId}/products?fields=id,retailer_id,name,image_url&filter=${filter}`);
  return res.data?.find((p) => p.retailer_id === retailerId) ?? null;
}

/**
 * Meta's catalogue batch API: items are identified by their SKU (`data.id` is the retailer id, never
 * Meta's own product id). `allow_upsert: false` makes an UPDATE of an unknown SKU fail instead of
 * quietly creating a new, nameless product. Meta applies batches asynchronously, so this waits briefly
 * for the outcome and reports Meta's own errors.
 */
async function runBatch(cfg: WaConfig, catalogId: string, request: { method: "CREATE" | "UPDATE" | "DELETE"; data: Record<string, unknown> }) {
  const res = await metaPost<{ handles?: string[]; validation_status?: { retailer_id?: string; errors?: { message: string }[] }[] }>(cfg, `${catalogId}/items_batch`, {
    item_type: "PRODUCT_ITEM",
    allow_upsert: false,
    requests: [request],
  });
  const invalid = (res.validation_status ?? []).flatMap((v) => v.errors ?? []).map((e) => e.message);
  if (invalid.length) return { ok: false as const, message: `Meta rejected the change: ${invalid.join("; ")}` };
  const handle = res.handles?.[0];
  if (!handle) return { ok: false as const, message: "Meta didn't accept the change. Try again in a minute." };

  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await metaGet<{ data?: { status?: string; errors_total_count?: number; errors?: { message: string }[] }[] }>(
      cfg,
      `${catalogId}/check_batch_request_status?handle=${encodeURIComponent(handle)}&fields=status,errors,errors_total_count`,
    ).catch(() => null);
    const s = st?.data?.[0];
    if (!s) continue;
    if (s.errors_total_count) return { ok: false as const, message: `Meta rejected the change: ${s.errors?.map((e) => e.message).join("; ") || "unknown error"}` };
    if (s.status === "finished") return { ok: true as const, pending: false };
  }
  return { ok: true as const, pending: true };
}

/** Meta downloads product photos itself, so only a public https link can be sent (on the portal's current address). */
const publicImage = (url: string | null | undefined) => {
  const u = currentAppUrl(url);
  return u && /^https:\/\//i.test(u) ? u : null;
};

/**
 * Product photos saved in Meta while the portal ran on an old address: point them at the current address
 * (same file). One batch request to Meta after a catalogue read, at most once per product per server instance;
 * Meta applies it in the background and the next read shows the new links.
 */
const relinked = new Set<string>();
async function relinkOldPhotos(cfg: WaConfig, catalogId: string, products: MetaProduct[]) {
  const stale = products.filter((p) => p.retailer_id && isOldAppUrl(p.image_url) && !relinked.has(`${catalogId}:${p.retailer_id}`));
  if (!stale.length) return;
  for (const p of stale) relinked.add(`${catalogId}:${p.retailer_id}`);
  try {
    await metaPost(cfg, `${catalogId}/items_batch`, {
      item_type: "PRODUCT_ITEM",
      allow_upsert: false,
      requests: stale.map((p) => ({ method: "UPDATE", data: { id: p.retailer_id, image_link: currentAppUrl(p.image_url) } })),
    });
  } catch (e) {
    for (const p of stale) relinked.delete(`${catalogId}:${p.retailer_id}`);
    console.warn(`Could not move product photo links to ${APP_HOST}:`, e instanceof Error ? e.message : e);
  }
}

/* Catalogue snapshot for product lists, filters and charts: live from Meta, kept in Next's shared data
   cache for a minute (every page and every server instance reuses it instead of waiting on Meta), and
   dropped as soon as the portal edits the catalogue. Failed reads are never cached. */
const CATALOG_TTL_S = 60;
const catalogTag = (clientId: string) => `catalog:${clientId}`;

/** Forgets the cached catalogue so the next page shows Meta's latest. */
function forgetCatalog(clientId: string) {
  try {
    revalidateTag(catalogTag(clientId), { expire: 0 });
  } catch {
    // Outside a request (scripts): nothing cached to forget.
  }
}

/** The live catalogue from Meta: null in demo mode, a null catalogId when no catalogue is connected. Throws on Meta errors. */
async function readLiveCatalog(clientId: string): Promise<{ catalogId: string | null; products: CatalogProductDetail[] } | null> {
  const { cfg } = await senderFor(clientId);
  if (!cfg.live) return null;
  const catalogId = await catalogIdFor(cfg);
  if (!catalogId) return { catalogId: null, products: [] };
  const out: CatalogProductDetail[] = [];
  const raw: MetaProduct[] = [];
  let path: string | null = `${catalogId}/products?fields=id,retailer_id,name,price,availability,description,image_url,capability_to_review_status,product_type&limit=100`;
  while (path) {
    const page: { data: MetaProduct[]; paging?: { next?: string } } = await metaGet(cfg, path);
    for (const p of page.data ?? []) {
      raw.push(p);
      out.push(toDetail(p));
    }
    path = page.paging?.next ? page.paging.next.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "") : null;
  }
  out.sort((a, b) => a.retailerId.localeCompare(b.retailerId, undefined, { numeric: true }));
  await relinkOldPhotos(cfg, catalogId, raw);
  return { catalogId, products: out };
}

const cachedLiveCatalog = (clientId: string) =>
  unstable_cache(() => readLiveCatalog(clientId), ["catalog-live", clientId], { revalidate: CATALOG_TTL_S, tags: [catalogTag(clientId)] })();

/** The client's catalogue products (live, at most a minute old). The only list of products. */
export async function catalogProducts(clientId: string): Promise<CatalogProductDetail[]> {
  return (await getCatalogWithProducts(clientId)).products;
}

/** Full catalogue products with stock, price, category and descriptions for the client (once per request). */
export const getCatalogWithProducts = cache(async (clientId: string): Promise<{
  catalogId: string | null;
  products: CatalogProductDetail[];
  commerceManagerUrl: string | null;
  isLive: boolean;
  /** Meta couldn't be read just now (the list is empty for this request). */
  readError?: boolean;
}> => {
  const { cfg } = await senderFor(clientId);
  if (!cfg.live) {
    return { catalogId: null, products: demoProducts(clientId), commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
  }

  try {
    const live = await cachedLiveCatalog(clientId);
    // Live: Meta is the only source of truth. Local demo edits are never layered on top.
    if (live?.catalogId) return { catalogId: live.catalogId, products: live.products, commerceManagerUrl: `https://business.facebook.com/commerce_manager/${live.catalogId}/products`, isLive: true };
    // A live account with no catalogue connected has no products; the demo list is only for demo mode.
    if (live) return { catalogId: null, products: [], commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
  } catch (e) {
    // Only live accounts read Meta, so never fall back to the demo products here.
    console.warn("Could not fetch Meta catalog:", e);
    return { catalogId: null, products: [], commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false, readError: true };
  }
  return { catalogId: null, products: demoProducts(clientId), commerceManagerUrl: "https://business.facebook.com/commerce_manager", isLive: false };
});

type Result = { ok: boolean; message: string; metaUpdated: boolean };

/** Updates a product's price, stock, name, description or photo, identified by its SKU. */
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
): Promise<Result> {
  forgetCatalog(clientId);
  const { cfg } = await senderFor(clientId);

  // Demo mode (no WhatsApp Cloud API): edits are kept locally so the screens can be tried.
  if (!cfg.live) {
    const key = params.retailerId || params.id;
    const patch = {
      ...(params.priceAmount !== undefined && { priceAmount: params.priceAmount, price: `₹ ${params.priceAmount.toFixed(2)}` }),
      ...(params.inStock !== undefined && { inStock: params.inStock }),
      ...(params.name && { name: params.name }),
      ...(params.description !== undefined && { description: params.description }),
      ...(params.imageUrl !== undefined && { imageUrl: params.imageUrl }),
    };
    saveOverride(clientId, key, patch);
    if (params.id && params.id !== key) {
      saveOverride(clientId, params.id, patch);
    }
    return { ok: true, metaUpdated: false, message: "Saved in demo mode. Connect the WhatsApp Cloud API to change the real catalogue." };
  }

  if (!params.retailerId) return { ok: false, metaUpdated: false, message: "This product has no SKU, so it can't be updated. Refresh the page and try again." };
  if (params.priceAmount !== undefined && !(params.priceAmount > 0)) return { ok: false, metaUpdated: false, message: "Enter a price above ₹0." };

  try {
    const catalogId = await catalogIdFor(cfg);
    if (!catalogId) return { ok: false, metaUpdated: false, message: "No catalogue is connected to this WhatsApp account in Meta." };
    const current = await findByRetailerId(cfg, catalogId, params.retailerId);
    if (!current) return { ok: false, metaUpdated: false, message: `${params.retailerId} is no longer in the catalogue. Refresh the page.` };

    const data: Record<string, unknown> = { id: params.retailerId };
    if (params.priceAmount !== undefined) data.price = `${params.priceAmount.toFixed(2)} INR`;
    if (params.inStock !== undefined) data.availability = params.inStock ? "in stock" : "out of stock";
    if (params.name?.trim()) data.title = params.name.trim().slice(0, 100);
    if (params.description !== undefined) data.description = (params.description.trim() || params.name?.trim() || current.name || params.retailerId).slice(0, 5000);
    // The client sends imageUrl only when the user picked a different photo.
    const image = publicImage(params.imageUrl);
    const changedImage = params.imageUrl !== undefined;
    if (image) data.image_link = image;

    const r = await runBatch(cfg, catalogId, { method: "UPDATE", data });
    if (!r.ok) return { ok: false, metaUpdated: false, message: r.message };
    forgetCatalog(clientId);
    const photoNote = !changedImage || image
      ? ""
      : params.imageUrl
        ? " The photo wasn't changed: Meta can only use a public https:// image link."
        : " The photo wasn't changed: Meta needs a photo, so replace it with another one instead of removing it.";
    return {
      ok: true,
      metaUpdated: true,
      message: (r.pending ? "Sent to Meta. It can take a minute to show in WhatsApp." : "Updated in your WhatsApp catalogue.") + photoNote,
    };
  } catch (e) {
    return { ok: false, metaUpdated: false, message: `Couldn't update the catalogue: ${e instanceof Error ? e.message : "Meta API error"}` };
  }
}

/** Adds a product to the live catalogue. Meta needs a SKU, title, price, description and a public photo. */
export async function createCatalogProductItem(
  clientId: string,
  p: { retailerId: string; name: string; priceAmount: number; inStock: boolean; description: string; imageUrl: string | null; brand: string; link: string },
): Promise<Result> {
  forgetCatalog(clientId);
  const retailerId = p.retailerId.trim();
  if (!/^[\w.-]{1,50}$/.test(retailerId)) return { ok: false, metaUpdated: false, message: "SKU can use letters, numbers, dots, dashes and underscores (up to 50)." };
  if (!p.name.trim()) return { ok: false, metaUpdated: false, message: "Enter a product name." };
  if (!(p.priceAmount > 0)) return { ok: false, metaUpdated: false, message: "Enter a price above ₹0." };

  const { cfg } = await senderFor(clientId);
  if (!cfg.live) {
    const newItem: CatalogProductDetail & { deleted?: boolean } = {
      id: retailerId,
      retailerId,
      name: p.name.trim(),
      price: `₹ ${p.priceAmount.toFixed(2)}`,
      priceAmount: p.priceAmount,
      currency: "INR",
      inStock: p.inStock,
      description: p.description.trim() || p.name.trim(),
      imageUrl: p.imageUrl,
      category: detectCategory(p.name.trim()),
      whatsappStatus: "APPROVED",
      deleted: false,
    };
    saveOverride(clientId, retailerId, newItem);
    forgetCatalog(clientId);
    return { ok: true, metaUpdated: false, message: "Product added to catalogue." };
  }

  const image = publicImage(p.imageUrl);
  if (!image) return { ok: false, metaUpdated: false, message: "Upload a photo: WhatsApp shows every product with one." };

  try {
    const catalogId = await catalogIdFor(cfg);
    if (!catalogId) return { ok: false, metaUpdated: false, message: "No catalogue is connected to this WhatsApp account in Meta." };
    if (await findByRetailerId(cfg, catalogId, retailerId)) return { ok: false, metaUpdated: false, message: `SKU ${retailerId} is already used by another product.` };

    const r = await runBatch(cfg, catalogId, {
      method: "CREATE",
      data: {
        id: retailerId,
        title: p.name.trim().slice(0, 100),
        description: (p.description.trim() || p.name.trim()).slice(0, 5000),
        price: `${p.priceAmount.toFixed(2)} INR`,
        availability: p.inStock ? "in stock" : "out of stock",
        condition: "new",
        brand: p.brand.slice(0, 100),
        link: p.link,
        image_link: image,
      },
    });
    if (!r.ok) return { ok: false, metaUpdated: false, message: r.message };
    forgetCatalog(clientId);
    return { ok: true, metaUpdated: true, message: r.pending ? "Sent to Meta. The new product can take a minute to appear." : "Product added to your WhatsApp catalogue." };
  } catch (e) {
    return { ok: false, metaUpdated: false, message: `Couldn't add the product: ${e instanceof Error ? e.message : "Meta API error"}` };
  }
}

/** Removes a product (by SKU) from the live catalogue. Past orders keep their item names. */
export async function deleteCatalogProductItem(clientId: string, retailerId: string): Promise<Result> {
  forgetCatalog(clientId);
  const { cfg } = await senderFor(clientId);
  if (!cfg.live) {
    saveOverride(clientId, retailerId, { deleted: true } as never);
    forgetCatalog(clientId);
    return { ok: true, metaUpdated: false, message: "Product deleted from catalogue." };
  }

  try {
    const catalogId = await catalogIdFor(cfg);
    if (!catalogId) return { ok: false, metaUpdated: false, message: "No catalogue is connected to this WhatsApp account in Meta." };
    if (!(await findByRetailerId(cfg, catalogId, retailerId))) return { ok: false, metaUpdated: false, message: `${retailerId} is not in the catalogue any more. Refresh the page.` };
    const r = await runBatch(cfg, catalogId, { method: "DELETE", data: { id: retailerId } });
    if (!r.ok) return { ok: false, metaUpdated: false, message: r.message };
    forgetCatalog(clientId);
    return { ok: true, metaUpdated: true, message: r.pending ? "Sent to Meta. It can take a minute to disappear from WhatsApp." : "Product deleted from your WhatsApp catalogue." };
  } catch (e) {
    return { ok: false, metaUpdated: false, message: `Couldn't delete the product: ${e instanceof Error ? e.message : "Meta API error"}` };
  }
}

/** Every product in the catalogue linked to this WhatsApp Business Account, with its display price. */
export async function listCatalogProducts(cfg: WaConfig): Promise<CatalogProduct[]> {
  if (!cfg.live) return (showDemoProducts() ? DEFAULT_PRODUCTS : []).map((p) => ({ retailerId: p.retailerId, name: p.name, price: p.price, inStock: p.inStock }));
  const catalogId = await catalogIdFor(cfg).catch(() => null);
  if (!catalogId) return []; // a live account without a catalogue has no products (never the demo list)
  const out: CatalogProduct[] = [];
  let path: string | null = `${catalogId}/products?fields=retailer_id,name,price,availability&limit=100`;
  while (path) {
    const page: { data: { retailer_id: string; name: string; price?: string; availability?: string }[]; paging?: { next?: string } } = await metaGet(cfg, path);
    for (const p of page.data ?? []) if (p.name?.trim()) out.push({ retailerId: p.retailer_id, name: p.name, price: p.price ?? null, inStock: p.availability !== "out of stock" });
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
  for (const g of [...GROUPS, { title: "🛍️ *More products*", match: /./ }]) {
    const rows = items.filter((p) => !used.has(p) && g.match.test(p.name)).sort((a, b) => a.name.localeCompare(b.name));
    rows.forEach((p) => used.add(p));
    const title = g.match.source === "." && !sections.length ? "🛍️ *Products*" : g.title;
    if (rows.length) sections.push(`${title}\n${rows.map((p) => `• ${p.name} – ${shortPrice(p.price)}`).join("\n")}`);
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
