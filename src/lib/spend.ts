import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import {
  fetchMetaLivePricing,
  getMetaAccountInfo,
  SYNC_NOTE_PREFIX,
  type MetaAccountRecord,
  type MetaPricingPoint,
} from "./meta-balance";

/**
 * Meta's per-message rates for India, in rupees, before 18% GST:
 * https://developers.facebook.com/docs/whatsapp/pricing
 *
 * Official Meta India Pricing Rules (Oct 2026):
 * - Marketing templates: ₹0.8631 per delivered message
 * - Utility templates: ₹0.1150 per delivered message (volume tiers available; charged in & out of 24h window)
 * - Authentication templates: ₹0.1150 per delivered message (volume tiers available)
 * - Service messages (free-form 24h window replies): First 1,000 delivered service messages per month
 *   per business phone number are FREE (₹0.00). Above 1,000/month/number, charged at ₹0.1150/msg.
 * - Free Entry Point Window (Click-to-WhatsApp Ads & FB Page CTA): 72 hours free when replied within 24h.
 * - Billing trigger: Charged ONLY when a message is delivered (DELIVERED or READ), never on SENT or FAILED.
 */
export const RATES: Record<string, number> = {
  marketing: 0.8631,
  utility: 0.115,
  authentication: 0.115,
  service: 0.115,
};
export const INDIA_GST_RATE = 0.18;
export const FREE_SERVICE_QUOTA_PER_NUMBER = 1000;

export const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing (campaigns, win-back)",
  utility: "Utility (order updates, payments)",
  authentication: "Authentication (OTP)",
  service: "Service (24h customer replies · 1,000 free/mo)",
};

export type SpendRow = { category: string; charged: number; free: number; cost: number };
export type PhoneSpendRow = { phone: string; charged: number; free: number; cost: number };
export type ServiceQuotaInfo = {
  limitPerNumber: number;
  phoneCount: number;
  totalFreeLimit: number;
  usedTotal: number;
  freeUsed: number;
  freeRemaining: number;
  overQuotaCharged: number;
  rateAfterQuota: number;
};
export type DailySpendPoint = {
  key: string;
  label: string;
  sub: string;
  marketingCost: number;
  utilityCost: number;
  authCost: number;
  serviceCost: number;
  totalCost: number;
  chargedVolume: number;
  freeVolume: number;
};

/** Start of this month and last month in the app's time zone. */
function monthStarts(now = new Date()) {
  const ym = formatInTimeZone(now, APP_TZ, "yyyy-MM");
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { thisMonth: fromZonedTime(`${ym}-01T00:00:00`, APP_TZ), lastMonth: fromZonedTime(`${prev}-01T00:00:00`, APP_TZ) };
}

/**
 * Charged and free messages per Meta pricing category from local DB (fallback when Meta API is unreachable).
 * Enforces Meta's delivery-only billing (excludes FAILED/QUEUED/SKIPPED) and the 1,000 free service messages/month quota per number.
 */
async function spendBetweenLocal(clientId: string, from: Date, to?: Date, phoneCount = 1): Promise<SpendRow[]> {
  const groups = await db.message.groupBy({
    by: ["pricingCategory", "billable"],
    where: {
      customer: { clientId },
      pricingCategory: { not: null },
      status: { notIn: ["QUEUED", "FAILED", "SKIPPED"] },
      createdAt: { gte: from, ...(to && { lt: to }) },
    },
    _count: true,
  });
  const rows = new Map<string, SpendRow>();
  for (const g of groups) {
    const category = g.pricingCategory!;
    const row = rows.get(category) ?? { category, charged: 0, free: 0, cost: 0 };
    if (category === "service") {
      // Service messages use the monthly 1,000 free allowance per phone number first
      row.free += g._count;
    } else if (g.billable) {
      row.charged += g._count;
      row.cost += g._count * (RATES[category] ?? 0);
    } else {
      row.free += g._count;
    }
    rows.set(category, row);
  }
  const srv = rows.get("service");
  if (srv) {
    const freeLimit = Math.max(1, phoneCount) * FREE_SERVICE_QUOTA_PER_NUMBER;
    const totalSrv = srv.free + srv.charged;
    const freeUsed = Math.min(totalSrv, freeLimit);
    const overQuota = Math.max(0, totalSrv - freeLimit);
    srv.free = freeUsed;
    srv.charged = overQuota;
    srv.cost = overQuota * RATES.service;
  }
  return [...rows.values()].sort((a, b) => b.cost - a.cost || b.charged - a.charged);
}

/** Aggregates live Meta `pricing_analytics` points into SpendRow[] for a [fromSec, toSec) window. */
function spendFromMetaPoints(points: MetaPricingPoint[], fromSec: number, toSec?: number): SpendRow[] {
  const rows = new Map<string, SpendRow>();
  for (const p of points) {
    if (p.start < fromSec) continue;
    if (toSec !== undefined && p.start >= toSec) continue;
    const row = rows.get(p.category) ?? { category: p.category, charged: 0, free: 0, cost: 0 };
    if (p.billable) {
      row.charged += p.volume;
      row.cost += p.cost;
    } else {
      row.free += p.volume;
    }
    rows.set(p.category, row);
  }
  return [...rows.values()].sort((a, b) => b.cost - a.cost || b.charged - a.charged);
}

/** Aggregates live Meta `pricing_analytics` points by sender phone number. */
function spendByPhoneFromMetaPoints(points: MetaPricingPoint[], fromSec: number): PhoneSpendRow[] {
  const byPhone = new Map<string, PhoneSpendRow>();
  for (const p of points) {
    if (p.start < fromSec || !p.phoneNumber) continue;
    const row = byPhone.get(p.phoneNumber) ?? { phone: p.phoneNumber, charged: 0, free: 0, cost: 0 };
    if (p.billable) {
      row.charged += p.volume;
      row.cost += p.cost;
    } else {
      row.free += p.volume;
    }
    byPhone.set(p.phoneNumber, row);
  }
  return [...byPhone.values()].sort((a, b) => b.cost - a.cost || b.charged - a.charged);
}

/** Builds a 14-day daily spend & volume timeline for Apache ECharts. */
function buildDailySeries(
  now: Date,
  useLiveMeta: boolean,
  points: MetaPricingPoint[],
  localMsgs: { createdAt: Date; pricingCategory: string | null; billable: boolean | null }[],
): DailySpendPoint[] {
  const days = 14;
  const map = new Map<string, DailySpendPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    const key = formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
    const noon = new Date(`${key}T12:00:00Z`);
    map.set(key, {
      key,
      label: formatInTimeZone(noon, "UTC", "d MMM"),
      sub: formatInTimeZone(noon, "UTC", "EEE"),
      marketingCost: 0,
      utilityCost: 0,
      authCost: 0,
      serviceCost: 0,
      totalCost: 0,
      chargedVolume: 0,
      freeVolume: 0,
    });
  }

  if (useLiveMeta) {
    for (const p of points) {
      const key = formatInTimeZone(new Date((p.start + 12 * 3600) * 1000), APP_TZ, "yyyy-MM-dd");
      const entry = map.get(key);
      if (!entry) continue;
      if (p.billable) {
        entry.chargedVolume += p.volume;
        entry.totalCost = Math.round((entry.totalCost + p.cost) * 100) / 100;
        if (p.category === "marketing") entry.marketingCost = Math.round((entry.marketingCost + p.cost) * 100) / 100;
        else if (p.category === "utility") entry.utilityCost = Math.round((entry.utilityCost + p.cost) * 100) / 100;
        else if (p.category === "authentication") entry.authCost = Math.round((entry.authCost + p.cost) * 100) / 100;
        else if (p.category === "service") entry.serviceCost = Math.round((entry.serviceCost + p.cost) * 100) / 100;
      } else {
        entry.freeVolume += p.volume;
      }
    }
  } else {
    for (const m of localMsgs) {
      if (!m.pricingCategory) continue;
      const key = formatInTimeZone(m.createdAt, APP_TZ, "yyyy-MM-dd");
      const entry = map.get(key);
      if (!entry) continue;
      const rate = RATES[m.pricingCategory] ?? 0;
      if (m.billable && m.pricingCategory !== "service") {
        entry.chargedVolume += 1;
        entry.totalCost = Math.round((entry.totalCost + rate) * 100) / 100;
        if (m.pricingCategory === "marketing") entry.marketingCost = Math.round((entry.marketingCost + rate) * 100) / 100;
        else if (m.pricingCategory === "utility") entry.utilityCost = Math.round((entry.utilityCost + rate) * 100) / 100;
        else if (m.pricingCategory === "authentication") entry.authCost = Math.round((entry.authCost + rate) * 100) / 100;
      } else {
        entry.freeVolume += 1;
      }
    }
  }

  return [...map.values()];
}

export const total = (rows: SpendRow[]) => rows.reduce((sum, r) => sum + r.cost, 0);

/** This month's and last month's spend synced live from Meta `pricing_analytics`, plus prepaid balance, 1,000 free service quota, and top-ups. */
export async function spendSummary(clientId: string) {
  const now = new Date();
  const { thisMonth, lastMonth } = monthStarts(now);
  const thisMonthSec = Math.floor(thisMonth.getTime() / 1000);
  const lastMonthSec = Math.floor(lastMonth.getTime() / 1000);
  const nowSec = Math.floor(now.getTime() / 1000) + 86400;
  const fourteenDaysAgo = new Date(now.getTime() - 15 * 86400_000);

  const clientNumbers = await db.whatsAppNumber
    .findMany({
      where: { clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    })
    .catch(() => []);
  const clientNumber = clientNumbers[0] ?? null;
  const phoneCount = Math.max(1, clientNumbers.length);

  const [localCurrent, localPrevious, allTimeGroups, allTopUps, liveMeta, localRecentMsgs, monthOrders, localServiceRepliesCount] = await Promise.all([
    spendBetweenLocal(clientId, thisMonth, undefined, phoneCount),
    spendBetweenLocal(clientId, lastMonth, thisMonth, phoneCount),
    db.message.groupBy({
      by: ["pricingCategory"],
      where: { customer: { clientId }, billable: true, status: { notIn: ["QUEUED", "FAILED", "SKIPPED"] }, pricingCategory: { not: null } },
      _count: true,
    }),
    db.topUp
      .findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
      .catch(() => []),
    fetchMetaLivePricing(clientId, lastMonthSec, nowSec),
    db.message
      .findMany({
        where: { customer: { clientId }, pricingCategory: { not: null }, status: { notIn: ["QUEUED", "FAILED", "SKIPPED"] }, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true, pricingCategory: true, billable: true },
      })
      .catch(() => []),
    db.order
      .findMany({
        where: {
          customer: { clientId },
          createdAt: { gte: thisMonth },
          OR: [{ status: { in: ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"] } }, { paidAt: { not: null } }],
        },
        select: { total: true },
      })
      .catch(() => []),
    // Count all free-form 24h window replies ("Typed reply" / "Media reply" or pricingCategory="service") sent this month
    db.message
      .count({
        where: {
          customer: { clientId },
          createdAt: { gte: thisMonth },
          status: { notIn: ["QUEUED", "FAILED", "SKIPPED"] },
          OR: [{ pricingCategory: "service" }, { templateId: null, templateName: { in: ["Typed reply", "Media reply", "AI auto-reply"] } }],
        },
      })
      .catch(() => 0),
  ]);

  // Use Meta's live pricing_analytics when connected and non-empty; otherwise fall back to local DB.
  const useLiveMeta = liveMeta.live && liveMeta.points.length > 0;
  // Slightly wider window (-12h for timezone alignment of Meta's daily UTC/IST buckets)
  const current = useLiveMeta ? spendFromMetaPoints(liveMeta.points, thisMonthSec - 12 * 3600) : localCurrent;
  const previous = useLiveMeta ? spendFromMetaPoints(liveMeta.points, lastMonthSec - 12 * 3600, thisMonthSec - 12 * 3600) : localPrevious;
  const byPhone = useLiveMeta ? spendByPhoneFromMetaPoints(liveMeta.points, thisMonthSec - 12 * 3600) : [];
  const daily = buildDailySeries(now, useLiveMeta, liveMeta.points, localRecentMsgs);

  // Compute 1,000 Free Service Messages / Month Quota per phone number
  const srvRow = current.find((r) => r.category === "service");
  const metaServiceFree = srvRow?.free ?? 0;
  const metaServiceCharged = srvRow?.charged ?? 0;
  const totalServiceUsed = Math.max(metaServiceFree + metaServiceCharged, localServiceRepliesCount);
  const totalFreeLimit = phoneCount * FREE_SERVICE_QUOTA_PER_NUMBER;
  const freeUsed = Math.min(totalServiceUsed, totalFreeLimit);
  const overQuotaCharged = metaServiceCharged > 0 ? metaServiceCharged : Math.max(0, totalServiceUsed - totalFreeLimit);
  const freeRemaining = Math.max(0, totalFreeLimit - freeUsed);

  // Ensure `service` row in `current` reflects local 24h service replies even if Meta's pricing_analytics only returned billable template points
  if (!srvRow && totalServiceUsed > 0) {
    current.push({
      category: "service",
      free: freeUsed,
      charged: overQuotaCharged,
      cost: overQuotaCharged * RATES.service,
    });
  } else if (srvRow && srvRow.free === 0 && freeUsed > 0) {
    srvRow.free = freeUsed;
  }

  const serviceQuota: ServiceQuotaInfo = {
    limitPerNumber: FREE_SERVICE_QUOTA_PER_NUMBER,
    phoneCount,
    totalFreeLimit,
    usedTotal: totalServiceUsed,
    freeUsed,
    freeRemaining,
    overQuotaCharged,
    rateAfterQuota: RATES.service,
  };

  const monthOrdersCount = monthOrders.length;
  const monthOrderRevenue = Math.round(monthOrders.reduce((s, o) => s + o.total, 0));

  let localAllTimeSpent = 0;
  for (const g of allTimeGroups) {
    localAllTimeSpent += g._count * (RATES[g.pricingCategory!] ?? 0);
  }
  const totalMonthSpent = total(current);
  const totalLastMonthSpent = total(previous);
  const allTimeSpent = Math.max(localAllTimeSpent, totalMonthSpent + totalLastMonthSpent);

  // Fetch verified Meta account info and live synced balance
  const metaAccount: MetaAccountRecord = await getMetaAccountInfo(clientNumber?.businessAccountId, clientId);

  // Only deduct spend that happened AFTER a real balance sync timestamp (if lastSyncedAt is epoch 0, liveBalance is already current)
  const syncDate = new Date(metaAccount.lastSyncedAt);
  const hasExplicitSync = !isNaN(syncDate.getTime()) && syncDate.getTime() > 0;
  const spentSinceSync = hasExplicitSync
    ? useLiveMeta
      ? total(spendFromMetaPoints(liveMeta.points, Math.floor(syncDate.getTime() / 1000)))
      : total(await spendBetweenLocal(clientId, syncDate, undefined, phoneCount))
    : 0;

  // Manual top-ups (excluding internal [META_SYNC] snapshots) added after the balance snapshot
  const manualTopUps = allTopUps.filter((t) => !t.note?.startsWith(SYNC_NOTE_PREFIX));
  const addedSinceSync = manualTopUps
    .filter((t) => !hasExplicitSync || t.createdAt >= syncDate)
    .reduce((sum, t) => sum + t.amount, 0);

  const prepaidFunds = metaAccount.liveBalance + addedSinceSync;
  const remainingBalance = Math.max(0, Math.round((prepaidFunds - spentSinceSync) * 100) / 100);

  return {
    current,
    previous,
    byPhone,
    daily,
    serviceQuota,
    monthOrdersCount,
    monthOrderRevenue,
    liveSyncedFromMeta: useLiveMeta,
    metaTotalSent: liveMeta.totalSent,
    metaTotalDelivered: liveMeta.totalDelivered,
    monthLabel: formatInTimeZone(thisMonth, APP_TZ, "MMMM"),
    lastMonthLabel: formatInTimeZone(lastMonth, APP_TZ, "MMMM"),
    totalMonthSpent,
    totalMonthSpentWithGst: Math.round(totalMonthSpent * (1 + INDIA_GST_RATE) * 100) / 100,
    allTimeSpent,
    prepaidFunds,
    remainingBalance,
    metaAccount,
    topUps: manualTopUps.slice(0, 5),
    lastSyncedAt: metaAccount.lastSyncedAt,
    syncedBy: metaAccount.syncedBy,
    balance: {
      added: prepaidFunds,
      spent: allTimeSpent,
      left: remainingBalance,
      since: hasExplicitSync ? syncDate : thisMonth,
    },
  };
}


