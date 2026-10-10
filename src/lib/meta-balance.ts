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

/** Records an account_update or account_alerts webhook event from Meta so it surfaces in dashboard notifications. */
export async function recordMetaAccountAlert(params: {
  wabaId?: string | null;
  field: "account_update" | "account_alerts";
  value: Record<string, unknown>;
}) {
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
  return alert;
}

export function getMetaAccountAlerts(clientId?: string | null): MetaAccountAlert[] {
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

  return updated;
}

/**
 * Checks live Meta Graph API connection status for the client's WABA and phone numbers.
 * Fetches verified name, quality rating, messaging tier, and account status in real-time,
 * and updates the stored WhatsAppNumber record when connected.
 */
export async function fetchMetaLiveStatus(clientId: string) {
  try {
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { name: true, waToken: true, waBusinessAccountId: true, waPhoneNumberId: true },
    });
    const number = await db.whatsAppNumber.findFirst({
      where: { clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    const token = number?.token || client?.waToken || process.env.WHATSAPP_TOKEN;
    const wabaId = number?.businessAccountId || client?.waBusinessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const phoneId = number?.phoneNumberId || client?.waPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !wabaId || !phoneId) {
      return {
        liveConnected: false,
        reason: "Missing WhatsApp access token, WABA ID, or Phone Number ID.",
      };
    }

    const [wabaRes, phoneRes] = await Promise.all([
      fetch(`https://graph.facebook.com/${VERSION}/${wabaId}?fields=id,name,currency,timezone_id,account_review_status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`https://graph.facebook.com/${VERSION}/${phoneId}?fields=id,verified_name,display_phone_number,quality_rating,messaging_limit_tier`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    if (wabaRes?.error && phoneRes?.error) {
      return {
        liveConnected: false,
        reason: phoneRes.error.message || wabaRes.error.message || "Meta Graph API rejected the request.",
      };
    }

    const liveConnected = Boolean((wabaRes?.id && !wabaRes?.error) || (phoneRes?.id && !phoneRes?.error));
    if (!liveConnected) {
      return {
        liveConnected: false,
        reason: "Could not reach Meta Graph API or invalid credentials.",
      };
    }

    if (number && phoneRes?.id && !phoneRes?.error) {
      await db.whatsAppNumber
        .update({
          where: { id: number.id },
          data: {
            qualityRating: phoneRes.quality_rating ?? number.qualityRating,
            messagingTier: phoneRes.messaging_limit_tier ?? number.messagingTier,
            ...(phoneRes.display_phone_number && { displayPhone: phoneRes.display_phone_number }),
            ...(phoneRes.verified_name && { verifiedName: phoneRes.verified_name }),
            statusCheckedAt: new Date(),
          },
        })
        .catch(() => null);
    }

    return {
      liveConnected: true,
      wabaId: wabaRes?.id || wabaId,
      wabaName: wabaRes?.name || client?.name || "WhatsApp Business Account",
      currency: wabaRes?.currency || "INR",
      phoneNumberId: phoneRes?.id || phoneId,
      verifiedName: phoneRes?.verified_name || number?.verifiedName || client?.name || "Verified Business",
      displayPhone: phoneRes?.display_phone_number || number?.displayPhone || phoneId,
      qualityRating: phoneRes?.quality_rating || number?.qualityRating || "GREEN",
    };
  } catch (e: unknown) {
    return {
      liveConnected: false,
      reason: e instanceof Error ? e.message : "Failed to connect to Meta Graph API.",
    };
  }
}

