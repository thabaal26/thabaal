import { db } from "./db";

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
export const SYNC_NOTE_PREFIX = "[META_SYNC]";

export type MetaAccountRecord = {
  accountName: string;
  wabaId: string;
  paymentAccountId: string;
  businessId: string;
  currency: string;
  liveBalance: number;
  lastSyncedAt: string;
  syncedBy: string;
  billingUrl: string;
};

export type MetaAccountAlert = {
  id: string;
  wabaId: string | null;
  clientId: string | null;
  field: "account_update" | "account_alerts";
  title: string;
  detail: string;
  receivedAt: string;
};

const recentAccountAlerts: MetaAccountAlert[] = [];
let alertsTableEnsured = false;

async function ensureAlertsTable() {
  if (alertsTableEnsured) return;
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PortalMetaAlert" (
        "id" TEXT PRIMARY KEY,
        "wabaId" TEXT,
        "clientId" TEXT,
        "field" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "detail" TEXT NOT NULL,
        "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    alertsTableEnsured = true;
    const rows = await db.$queryRaw<MetaAccountAlert[]>`
      SELECT "id", "wabaId", "clientId", "field", "title", "detail", "receivedAt"::text AS "receivedAt"
      FROM "PortalMetaAlert"
      ORDER BY "receivedAt" DESC
      LIMIT 30
    `;
    if (rows.length && recentAccountAlerts.length === 0) {
      recentAccountAlerts.push(...rows);
    }
  } catch {
    // ignore if DB not reachable during startup
  }
}

/** Records an account_update or account_alerts webhook event from Meta so it surfaces in dashboard notifications. */
export async function recordMetaAccountAlert(params: {
  wabaId?: string | null;
  field: "account_update" | "account_alerts";
  value: Record<string, unknown>;
}) {
  await ensureAlertsTable();
  const wabaId = params.wabaId ? String(params.wabaId) : null;
  const num = wabaId
    ? await db.whatsAppNumber.findFirst({ where: { businessAccountId: wabaId }, select: { clientId: true, label: true } }).catch(() => null)
    : null;
  const event = String(params.value.event ?? params.value.alert_type ?? params.field).replace(/_/g, " ");
  const desc = String(
    (params.value.alert_description as string | undefined) ||
      (params.value.ban_info ? JSON.stringify(params.value.ban_info) : "") ||
      (params.value.restriction_info ? JSON.stringify(params.value.restriction_info) : "") ||
      (params.value.violation_info ? JSON.stringify(params.value.violation_info) : "") ||
      JSON.stringify(params.value),
  ).slice(0, 300);

  const alert: MetaAccountAlert = {
    id: `${params.field}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    wabaId,
    clientId: num?.clientId ?? null,
    field: params.field,
    title: `Meta ${params.field === "account_alerts" ? "account alert" : "account update"}: ${event}`,
    detail: num?.label ? `${num.label} · ${desc}` : desc,
    receivedAt: new Date().toISOString(),
  };
  recentAccountAlerts.unshift(alert);
  if (recentAccountAlerts.length > 50) recentAccountAlerts.length = 50;
  await db.$executeRaw`
    INSERT INTO "PortalMetaAlert" ("id", "wabaId", "clientId", "field", "title", "detail", "receivedAt")
    VALUES (${alert.id}, ${alert.wabaId}, ${alert.clientId}, ${alert.field}, ${alert.title}, ${alert.detail}, NOW())
    ON CONFLICT ("id") DO NOTHING
  `.catch(() => null);
  return alert;
}

/** Meta account events in plain words. Routine set-up events (null) aren't shown to the shop at all. */
const META_EVENTS: Record<string, { title: string; detail: string } | null> = {
  WEBHOOK_CONFIG_UPDATED: null,
  MM_LITE_TERMS_SIGNED: null,
  PARTNER_ADDED: null,
  AUTH_INTL_PRICE_ELIGIBILITY_UPDATE: null,
  BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE: null,
  VERIFIED_ACCOUNT: { title: "WhatsApp account verified", detail: "Meta verified your WhatsApp Business account." },
  PARTNER_REMOVED: { title: "Thabaal removed from your WhatsApp account", detail: "Messages can't be sent until it is added again in Meta Business settings." },
  ACCOUNT_DELETED: { title: "WhatsApp account deleted", detail: "Meta deleted this WhatsApp Business account. Messages can't be sent." },
  DISABLED_UPDATE: { title: "WhatsApp account disabled", detail: "Meta disabled this WhatsApp Business account. Check Meta Business Support." },
  ACCOUNT_VIOLATION: { title: "Meta flagged a policy problem", detail: "Meta says some messages broke WhatsApp rules. Check Meta Business Support." },
  ACCOUNT_RESTRICTION: { title: "WhatsApp sending restricted", detail: "Meta has limited what this account can send for now. Check Meta Business Support." },
  ACCOUNT_UPDATE: { title: "WhatsApp account updated", detail: "Meta changed something on your WhatsApp Business account." },
};

/** A stored alert in plain words (older rows saved Meta's raw event and JSON); null for routine events. */
function plainAlert(a: MetaAccountAlert): MetaAccountAlert | null {
  const raw = `${a.title} ${a.detail}`;
  const code = raw.match(/"event"\s*:\s*"([A-Z_]+)"/)?.[1] ?? a.title.replace(/^Meta account (?:update|alert):\s*/i, "").trim().replace(/\s+/g, "_").toUpperCase();
  if (code in META_EVENTS) {
    const m = META_EVENTS[code];
    return m ? { ...a, title: m.title, detail: m.detail } : null;
  }
  // Unknown event: keep Meta's own words, never a JSON dump.
  const detail = /^[\s\S]*?[{[]/.test(a.detail) && /[{}]/.test(a.detail) ? "Meta sent an update about your WhatsApp account. Details are in Meta Business Support." : a.detail;
  const what = code.replace(/_/g, " ").toLowerCase();
  return { ...a, title: `WhatsApp account ${a.field === "account_alerts" ? "alert" : "update"}: ${what}`, detail };
}

export function getMetaAccountAlerts(clientId?: string | null): MetaAccountAlert[] {
  void ensureAlertsTable();
  const mine = clientId ? recentAccountAlerts.filter((a) => !a.clientId || a.clientId === clientId) : recentAccountAlerts;
  return mine.map(plainAlert).filter((a): a is MetaAccountAlert => a !== null);
}

/** The WhatsApp Business Account a client sends from: its default number's, else the one saved on the client. */
async function clientAccount(clientId: string | null | undefined, wabaId?: string | null) {
  if (!clientId) return null;
  const [client, number] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { name: true, waBusinessAccountId: true } }),
    db.whatsAppNumber.findFirst({
      where: { clientId, ...(wabaId && { businessAccountId: wabaId }) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { businessAccountId: true, verifiedName: true },
    }),
  ]);
  if (!client) return null;
  return { name: number?.verifiedName || client.name, wabaId: number?.businessAccountId || client.waBusinessAccountId || null };
}

/**
 * This client's Meta account and the last balance someone copied in from Meta's Billing Hub (a [META_SYNC]
 * top-up). Built only from the client's own records: nothing is hard-coded and nothing is shared between clients.
 */
export async function getMetaAccountInfo(wabaId?: string | null, clientId?: string | null): Promise<MetaAccountRecord> {
  const acc = await clientAccount(clientId, wabaId);
  const id = acc?.wabaId ?? wabaId ?? "";
  const base: MetaAccountRecord = {
    accountName: acc?.name ?? "Not connected",
    wabaId: id,
    paymentAccountId: "",
    businessId: "",
    currency: "INR",
    liveBalance: 0,
    lastSyncedAt: new Date(0).toISOString(),
    syncedBy: "",
    billingUrl: id ? `https://business.facebook.com/latest/billing_hub/accounts/?asset_id=${id}` : "https://business.facebook.com/latest/billing_hub/accounts/",
  };
  if (!clientId) return base;
  const latestSync = await db.topUp
    .findFirst({ where: { clientId, note: { startsWith: SYNC_NOTE_PREFIX } }, orderBy: { createdAt: "desc" } })
    .catch(() => null);
  if (latestSync) {
    base.liveBalance = latestSync.amount;
    base.lastSyncedAt = latestSync.createdAt.toISOString();
    base.syncedBy = latestSync.addedBy || "Portal Manager";
  }
  return base;
}

/** Records the balance shown in Meta's Billing Hub for this client's account (kept as a [META_SYNC] top-up). */
export async function setMetaAccountBalance(
  wabaId: string,
  balance: number,
  updatedBy = "Portal User",
  clientId?: string | null,
): Promise<MetaAccountRecord> {
  const rounded = Math.round(Number(balance) * 100) / 100;
  if (clientId) {
    await db.topUp.create({
      data: { clientId, amount: rounded, note: `${SYNC_NOTE_PREFIX} Balance synced for WABA ${wabaId}`, addedBy: updatedBy },
    });
  }
  pricingCache.clear();
  costSinceCache.clear();
  return getMetaAccountInfo(wabaId, clientId);
}

export type MetaPricingPoint = {
  start: number;
  end: number;
  phoneNumber: string;
  category: "marketing" | "utility" | "authentication" | "service";
  billable: boolean;
  volume: number;
  cost: number;
};

export type MetaLiveAnalyticsResult = {
  live: boolean;
  wabaId: string | null;
  wabaName: string | null;
  currency: string;
  points: MetaPricingPoint[];
  totalSent: number;
  totalDelivered: number;
  checkedAt: string;
};

const pricingCache = new Map<string, { expiresAt: number; data: MetaLiveAnalyticsResult }>();

/**
 * Fetches authoritative live message volume and INR cost directly from Meta's `pricing_analytics`
 * and `analytics` Graph API endpoints for the client's WhatsApp Business Account.
 */
export async function fetchMetaLivePricing(
  clientId: string,
  startUnix: number,
  endUnix: number,
  forceRefresh = false,
): Promise<MetaLiveAnalyticsResult> {
  const empty: MetaLiveAnalyticsResult = {
    live: false,
    wabaId: null,
    wabaName: null,
    currency: "INR",
    points: [],
    totalSent: 0,
    totalDelivered: 0,
    checkedAt: new Date().toISOString(),
  };

  try {
    const [client, number] = await Promise.all([
      db.client.findUnique({
        where: { id: clientId },
        select: { name: true, waToken: true, waBusinessAccountId: true },
      }),
      db.whatsAppNumber.findFirst({
        where: { clientId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }),
    ]);

    // Only this client's own credentials: never the deployment's number, which belongs to another business.
    const token = number?.token || client?.waToken;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId;
    if (!token || !wabaId) return empty;

    const cacheKey = `${wabaId}:${Math.floor(startUnix / 3600)}`;
    const cached = !forceRefresh ? pricingCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const fields = [
      "id",
      "name",
      "currency",
      `pricing_analytics.start(${startUnix}).end(${endUnix}).granularity(DAILY).dimensions(["PRICING_CATEGORY","PRICING_TYPE","TIER","COUNTRY","PHONE"])`,
      `analytics.start(${startUnix}).end(${endUnix}).granularity(DAY)`,
    ].join(",");

    const res = await fetch(`https://graph.facebook.com/${VERSION}/${wabaId}?fields=${encodeURIComponent(fields)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch(() => null);

    if (!res || res.error || !res.id) return empty;

    const rawPoints: {
      start?: number;
      end?: number;
      phone_number?: string;
      pricing_type?: string;
      pricing_category?: string;
      volume?: number;
      cost?: number;
    }[] = res.pricing_analytics?.data?.[0]?.data_points ?? [];

    const points: MetaPricingPoint[] = rawPoints.map((p) => {
      const rawCat = String(p.pricing_category ?? "SERVICE").toLowerCase();
      const category: MetaPricingPoint["category"] =
        rawCat === "marketing" || rawCat === "utility" || rawCat === "authentication" ? rawCat : "service";
      const cost = Number(p.cost ?? 0);
      const billable = cost > 0 || (p.pricing_type === "REGULAR" && category !== "service");
      return {
        start: Number(p.start ?? 0),
        end: Number(p.end ?? 0),
        phoneNumber: String(p.phone_number ?? ""),
        category,
        billable,
        volume: Number(p.volume ?? 0),
        cost,
      };
    });

    const delivPoints: { sent?: number; delivered?: number }[] = res.analytics?.data_points ?? [];
    const totalSent = delivPoints.reduce((s, d) => s + Number(d.sent ?? 0), 0);
    const totalDelivered = delivPoints.reduce((s, d) => s + Number(d.delivered ?? 0), 0);

    const out: MetaLiveAnalyticsResult = {
      live: true,
      wabaId: String(res.id),
      wabaName: res.name || client?.name || "WhatsApp Business Account",
      currency: res.currency || "INR",
      points,
      totalSent,
      totalDelivered,
      checkedAt: new Date().toISOString(),
    };

    pricingCache.set(cacheKey, { expiresAt: Date.now() + 45_000, data: out });
    return out;
  } catch {
    return empty;
  }
}

const costSinceCache = new Map<string, { expiresAt: number; cost: number }>();

/**
 * What Meta charged this client's WhatsApp account (ex-GST) from `fromSec` until now, read from
 * `pricing_analytics` in half-hour buckets so spend on the day of a balance sync is counted from the sync on.
 * Null when Meta can't be asked (no token, API error): the caller falls back to its own estimate.
 */
export async function fetchMetaCostSince(clientId: string, fromSec: number): Promise<number | null> {
  try {
    const [client, number] = await Promise.all([
      db.client.findUnique({ where: { id: clientId }, select: { waToken: true, waBusinessAccountId: true } }),
      db.whatsAppNumber.findFirst({ where: { clientId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    ]);
    const token = number?.token || client?.waToken;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId;
    if (!token || !wabaId) return null;
    const start = Math.floor(fromSec / 1800) * 1800;
    const key = `${wabaId}:${start}`;
    const hit = costSinceCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.cost;
    const end = Math.ceil(Date.now() / 1000 / 1800) * 1800 + 1800;
    // Meta keeps half-hour data for a limited time; a sync older than ~90 days needs daily buckets.
    const granularity = Date.now() / 1000 - start > 80 * 86400 ? "DAILY" : "HALF_HOUR";
    const field = `pricing_analytics.start(${start}).end(${end}).granularity(${granularity}).dimensions(["PRICING_CATEGORY"])`;
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${wabaId}?fields=${encodeURIComponent(field)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .catch(() => null);
    if (!res || res.error || !res.id) return null;
    const points: { start?: number; cost?: number }[] = res.pricing_analytics?.data?.[0]?.data_points ?? [];
    const cost = Math.round(points.filter((p) => Number(p.start ?? 0) >= start).reduce((n, p) => n + Number(p.cost ?? 0), 0) * 100) / 100;
    costSinceCache.set(key, { expiresAt: Date.now() + 60_000, cost });
    return cost;
  } catch {
    return null;
  }
}

/**
 * Checks live Meta Graph API connection status for the client's WABA and all phone numbers.
 * Fetches verified name, quality rating, messaging tier, account status, and live pricing analytics in real-time,
 * and updates all stored WhatsAppNumber records when connected.
 */
export async function fetchMetaLiveStatus(clientId: string) {
  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { name: true, waToken: true, waBusinessAccountId: true, waPhoneNumberId: true },
    });
    const numbers = await db.whatsAppNumber.findMany({
      where: { clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const number = numbers[0];

    const token = number?.token || client?.waToken;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId;
    const phoneId = number?.phoneNumberId || client?.waPhoneNumberId;

    if (!token || !wabaId || !phoneId) {
      return {
        liveConnected: false,
        reason: "This business hasn't connected its own WhatsApp number and access token yet.",
      };
    }

    pricingCache.clear();
    const nowSec = Math.floor(Date.now() / 1000);
    const monthStartSec = nowSec - 30 * 86400;

    const [wabaRes, phonesRes, livePricing] = await Promise.all([
      fetch(`https://graph.facebook.com/${VERSION}/${wabaId}?fields=id,name,currency,timezone_id,account_review_status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`https://graph.facebook.com/${VERSION}/${wabaId}/phone_numbers?fields=id,verified_name,display_phone_number,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null),
      fetchMetaLivePricing(clientId, monthStartSec, nowSec, true),
    ]);

    if (wabaRes?.error && phonesRes?.error) {
      return {
        liveConnected: false,
        reason: phonesRes.error.message || wabaRes.error.message || "Meta Graph API rejected the request.",
      };
    }

    const remotePhones: {
      id: string;
      verified_name?: string;
      display_phone_number?: string;
      quality_rating?: string;
      messaging_limit_tier?: string;
    }[] = phonesRes?.data ?? [];

    const liveConnected = Boolean((wabaRes?.id && !wabaRes?.error) || remotePhones.length > 0);
    if (!liveConnected) {
      return {
        liveConnected: false,
        reason: "Could not reach Meta Graph API or invalid credentials.",
      };
    }

    for (const localNum of numbers) {
      const remote = remotePhones.find((p) => p.id === localNum.phoneNumberId);
      if (remote) {
        await db.whatsAppNumber
          .update({
            where: { id: localNum.id },
            data: {
              qualityRating: remote.quality_rating ?? localNum.qualityRating,
              messagingTier: remote.messaging_limit_tier ?? localNum.messagingTier,
              ...(remote.display_phone_number && { displayPhone: remote.display_phone_number }),
              ...(remote.verified_name && { verifiedName: remote.verified_name }),
              statusCheckedAt: new Date(),
            },
          })
          .catch(() => null);
      }
    }

    const primaryRemote = remotePhones.find((p) => p.id === phoneId) ?? remotePhones[0];
    const totalLiveCost = livePricing.points.reduce((s, p) => s + p.cost, 0);

    return {
      liveConnected: true,
      wabaId: wabaRes?.id || wabaId,
      wabaName: wabaRes?.name || client?.name || "WhatsApp Business Account",
      currency: wabaRes?.currency || "INR",
      phoneNumberId: primaryRemote?.id || phoneId,
      verifiedName: primaryRemote?.verified_name || number?.verifiedName || client?.name || "Verified Business",
      displayPhone: primaryRemote?.display_phone_number || number?.displayPhone || phoneId,
      qualityRating: primaryRemote?.quality_rating || number?.qualityRating || "GREEN",
      numbersSynced: remotePhones.length || 1,
      liveCost30d: Math.round(totalLiveCost * 100) / 100,
    };
  } catch (e: unknown) {
    return {
      liveConnected: false,
      reason: e instanceof Error ? e.message : "Failed to connect to Meta Graph API.",
    };
  }
}


