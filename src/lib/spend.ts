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
 * Service replies (within 24 hours of the customer writing) are free.
 */
export const RATES: Record<string, number> = { marketing: 0.8631, utility: 0.115, authentication: 0.115 };
export const INDIA_GST_RATE = 0.18;

export const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing (campaigns, win-back)",
  utility: "Utility (order updates, payments)",
  authentication: "Authentication",
  service: "Service (replies within 24h)",
};

export type SpendRow = { category: string; charged: number; free: number; cost: number };
export type PhoneSpendRow = { phone: string; charged: number; free: number; cost: number };

/** Start of this month and last month in the app's time zone. */
function monthStarts(now = new Date()) {
  const ym = formatInTimeZone(now, APP_TZ, "yyyy-MM");
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { thisMonth: fromZonedTime(`${ym}-01T00:00:00`, APP_TZ), lastMonth: fromZonedTime(`${prev}-01T00:00:00`, APP_TZ) };
}

/** Charged and free messages per Meta pricing category from local DB (fallback when Meta API is unreachable). */
async function spendBetweenLocal(clientId: string, from: Date, to?: Date): Promise<SpendRow[]> {
  const groups = await db.message.groupBy({
    by: ["pricingCategory", "billable"],
    where: { customer: { clientId }, pricingCategory: { not: null }, createdAt: { gte: from, ...(to && { lt: to }) } },
    _count: true,
  });
  const rows = new Map<string, SpendRow>();
  for (const g of groups) {
    const category = g.pricingCategory!;
    const row = rows.get(category) ?? { category, charged: 0, free: 0, cost: 0 };
    if (g.billable) {
      row.charged += g._count;
      row.cost += g._count * (RATES[category] ?? 0);
    } else row.free += g._count;
    rows.set(category, row);
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

export const total = (rows: SpendRow[]) => rows.reduce((sum, r) => sum + r.cost, 0);

/** This month's and last month's spend synced live from Meta `pricing_analytics`, plus prepaid balance and top-ups. */
export async function spendSummary(clientId: string) {
  const now = new Date();
  const { thisMonth, lastMonth } = monthStarts(now);
  const thisMonthSec = Math.floor(thisMonth.getTime() / 1000);
  const lastMonthSec = Math.floor(lastMonth.getTime() / 1000);
  const nowSec = Math.floor(now.getTime() / 1000) + 86400;

  const [localCurrent, localPrevious, allTimeGroups, clientNumber, allTopUps, liveMeta] = await Promise.all([
    spendBetweenLocal(clientId, thisMonth),
    spendBetweenLocal(clientId, lastMonth, thisMonth),
    db.message.groupBy({
      by: ["pricingCategory"],
      where: { customer: { clientId }, billable: true, pricingCategory: { not: null } },
      _count: true,
    }),
    db.whatsAppNumber.findFirst({
      where: { clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    db.topUp
      .findMany({
        where: { clientId },
        orderBy: { createdAt: "desc" },
        take: 25,
      })
      .catch(() => []),
    fetchMetaLivePricing(clientId, lastMonthSec, nowSec),
  ]);

  // Use Meta's live pricing_analytics when connected and non-empty; otherwise fall back to local DB.
  const useLiveMeta = liveMeta.live && liveMeta.points.length > 0;
  // Slightly wider window (-12h for timezone alignment of Meta's daily UTC/IST buckets)
  const current = useLiveMeta ? spendFromMetaPoints(liveMeta.points, thisMonthSec - 12 * 3600) : localCurrent;
  const previous = useLiveMeta ? spendFromMetaPoints(liveMeta.points, lastMonthSec - 12 * 3600, thisMonthSec - 12 * 3600) : localPrevious;
  const byPhone = useLiveMeta ? spendByPhoneFromMetaPoints(liveMeta.points, thisMonthSec - 12 * 3600) : [];

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
      : total(await spendBetweenLocal(clientId, syncDate))
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


