import fs from "node:fs";
import path from "node:path";
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

export type MetaBalanceStore = {
  activeWabaId: string;
  accounts: Record<string, MetaAccountRecord>;
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

export function getMetaAccountAlerts(clientId?: string | null): MetaAccountAlert[] {
  void ensureAlertsTable();
  if (!clientId) return recentAccountAlerts;
  return recentAccountAlerts.filter((a) => !a.clientId || a.clientId === clientId);
}

const DEFAULT_ACCOUNTS: Record<string, MetaAccountRecord> = {
  "2326100124852715": {
    accountName: "R.G. Food Products",
    wabaId: "2326100124852715",
    paymentAccountId: "2115188602426162",
    businessId: "1707942536053094",
    currency: "INR",
    liveBalance: 18.89,
    lastSyncedAt: new Date(0).toISOString(),
    syncedBy: "Meta Business Suite Billing Hub",
    billingUrl:
      "https://business.facebook.com/latest/billing_hub/accounts/?payment_account_id=2115188602426162&asset_id=2326100124852715&business_id=1707942536053094",
  },
  "1124232406755071": {
    accountName: "Test WhatsApp Business Account",
    wabaId: "1124232406755071",
    paymentAccountId: "2115188602426162",
    businessId: "1707942536053094",
    currency: "INR",
    liveBalance: 39.99,
    lastSyncedAt: new Date(0).toISOString(),
    syncedBy: "Meta Business Suite Billing Hub",
    billingUrl:
      "https://business.facebook.com/latest/billing_hub/accounts/?payment_account_id=2115188602426162&asset_id=1124232406755071&business_id=1707942536053094",
  },
  "340280433875610": {
    accountName: "R.G. Food Products (Thenan oils)",
    wabaId: "340280433875610",
    paymentAccountId: "2115188602426162",
    businessId: "1707942536053094",
    currency: "INR",
    liveBalance: 50.0,
    lastSyncedAt: new Date(0).toISOString(),
    syncedBy: "Meta Business Suite Billing Hub",
    billingUrl:
      "https://business.facebook.com/latest/billing_hub/accounts/?payment_account_id=2115188602426162&asset_id=340280433875610&business_id=1707942536053094",
  },
};

const STORE_PATH = path.join(process.cwd(), "prisma", "data", "meta-balance-sync.json");

/** Reads stored Meta balance data from disk or initializes defaults. */
export function getMetaBalanceStore(): MetaBalanceStore {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as MetaBalanceStore;
      if (parsed?.accounts) {
        return {
          activeWabaId: parsed.activeWabaId || "2326100124852715",
          accounts: { ...DEFAULT_ACCOUNTS, ...parsed.accounts },
        };
      }
    }
  } catch {
    // fallback if file read error
  }
  return {
    activeWabaId: "2326100124852715",
    accounts: { ...DEFAULT_ACCOUNTS },
  };
}

/** Saves Meta balance data to disk (best-effort for local dev; DB is primary in production). */
export function saveMetaBalanceStore(store: MetaBalanceStore) {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Serverless filesystems are read-only; DB persistence via TopUp handles production
  }
}

/** Gets the active Meta account record for a given WABA ID or client, merging any DB balance sync. */
export async function getMetaAccountInfo(wabaId?: string | null, clientId?: string | null): Promise<MetaAccountRecord> {
  const store = getMetaBalanceStore();
  const targetId = wabaId || store.activeWabaId;
  const base: MetaAccountRecord = store.accounts[targetId]
    ? { ...store.accounts[targetId] }
    : {
        ...(store.accounts[store.activeWabaId] || DEFAULT_ACCOUNTS["2326100124852715"]),
        wabaId: targetId,
      };

  // Check if there is a newer balance snapshot saved in the database (TopUp with [META_SYNC] prefix)
  const resolvedClientId =
    clientId ??
    (wabaId
      ? (await db.whatsAppNumber.findFirst({ where: { businessAccountId: wabaId }, select: { clientId: true } }).catch(() => null))?.clientId
      : null);

  if (resolvedClientId) {
    const latestSync = await db.topUp
      .findFirst({
        where: { clientId: resolvedClientId, note: { startsWith: SYNC_NOTE_PREFIX } },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => null);

    if (latestSync && latestSync.createdAt.getTime() >= new Date(base.lastSyncedAt).getTime()) {
      base.liveBalance = latestSync.amount;
      base.lastSyncedAt = latestSync.createdAt.toISOString();
      base.syncedBy = latestSync.addedBy || "Portal Manager";
    }
  }

  return base;
}

/** Updates the synced balance for a Meta WhatsApp Business Account in both DB and local store. */
export async function setMetaAccountBalance(
  wabaId: string,
  balance: number,
  updatedBy = "Portal User",
  clientId?: string | null,
): Promise<MetaAccountRecord> {
  const store = getMetaBalanceStore();
  const acc = store.accounts[wabaId] || {
    ...DEFAULT_ACCOUNTS["2326100124852715"],
    wabaId,
  };

  const rounded = Math.round(Number(balance) * 100) / 100;
  const nowIso = new Date().toISOString();

  const updated: MetaAccountRecord = {
    ...acc,
    liveBalance: rounded,
    lastSyncedAt: nowIso,
    syncedBy: updatedBy,
  };

  store.accounts[wabaId] = updated;
  saveMetaBalanceStore(store);

  const resolvedClientId =
    clientId ??
    (await db.whatsAppNumber.findFirst({ where: { businessAccountId: wabaId }, select: { clientId: true } }).catch(() => null))?.clientId;

  if (resolvedClientId) {
    await db.topUp
      .create({
        data: {
          clientId: resolvedClientId,
          amount: rounded,
          note: `${SYNC_NOTE_PREFIX} Balance synced for WABA ${wabaId}`,
          addedBy: updatedBy,
        },
      })
      .catch(() => null);
  }

  pricingCache.delete(wabaId);
  return updated;
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

    const token = number?.token || client?.waToken || process.env.WHATSAPP_TOKEN;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
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

    const token = number?.token || client?.waToken || process.env.WHATSAPP_TOKEN;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const phoneId = number?.phoneNumberId || client?.waPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !wabaId || !phoneId) {
      return {
        liveConnected: false,
        reason: "Missing WhatsApp access token, WABA ID, or Phone Number ID.",
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


