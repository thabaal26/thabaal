import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "./db";
import { APP_TZ } from "./format";
import { getMetaAccountInfo, type MetaAccountRecord } from "./meta-balance";

/**
 * Meta's per-message rates for India, in rupees, before tax. Update these when Meta changes its prices:
 * https://developers.facebook.com/docs/whatsapp/pricing
 * Service replies (within 24 hours of the customer writing) are free.
 */
export const RATES: Record<string, number> = { marketing: 0.7846, utility: 0.115, authentication: 0.115 };

export const CATEGORY_LABEL: Record<string, string> = {
  marketing: "Marketing (campaigns, win-back)",
  utility: "Utility (order updates, payments)",
  authentication: "Authentication",
  service: "Service (replies within 24h)",
};

export type SpendRow = { category: string; charged: number; free: number; cost: number };

/** Start of this month and last month in the app's time zone. */
function monthStarts(now = new Date()) {
  const ym = formatInTimeZone(now, APP_TZ, "yyyy-MM");
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { thisMonth: fromZonedTime(`${ym}-01T00:00:00`, APP_TZ), lastMonth: fromZonedTime(`${prev}-01T00:00:00`, APP_TZ) };
}

/** Charged and free messages per Meta pricing category, with estimated cost. */
async function spendBetween(clientId: string, from: Date, to?: Date): Promise<SpendRow[]> {
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

export const total = (rows: SpendRow[]) => rows.reduce((sum, r) => sum + r.cost, 0);

/** This month's and last month's spend, plus the live remaining balance synced from Meta. */
export async function spendSummary(clientId: string) {
  const { thisMonth, lastMonth } = monthStarts();
  const [current, previous, allTimeGroups, clientNumber] = await Promise.all([
    spendBetween(clientId, thisMonth),
    spendBetween(clientId, lastMonth, thisMonth),
    db.message.groupBy({
      by: ["pricingCategory"],
      where: { customer: { clientId }, billable: true, pricingCategory: { not: null } },
      _count: true,
    }),
    db.whatsAppNumber.findFirst({
      where: { clientId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  let allTimeSpent = 0;
  for (const g of allTimeGroups) {
    allTimeSpent += g._count * (RATES[g.pricingCategory!] ?? 0);
  }

  // Fetch verified Meta account info and live synced balance
  const metaAccount: MetaAccountRecord = await getMetaAccountInfo(clientNumber?.businessAccountId);

  // Compute messages charged since the last balance sync timestamp
  const syncDate = new Date(metaAccount.lastSyncedAt);
  const validSyncDate = isNaN(syncDate.getTime()) ? thisMonth : syncDate;
  const spentSinceSync = total(await spendBetween(clientId, validSyncDate));

  // The true live balance starts from Meta's prepaid balance minus messages since sync
  const remainingBalance = Math.max(0, metaAccount.liveBalance - spentSinceSync);
  const prepaidFunds = metaAccount.liveBalance;

  return {
    current,
    previous,
    monthLabel: formatInTimeZone(thisMonth, APP_TZ, "MMMM"),
    lastMonthLabel: formatInTimeZone(lastMonth, APP_TZ, "MMMM"),
    totalMonthSpent: total(current),
    allTimeSpent,
    prepaidFunds,
    remainingBalance,
    metaAccount,
    lastSyncedAt: metaAccount.lastSyncedAt,
    syncedBy: metaAccount.syncedBy,
    balance: {
      added: prepaidFunds,
      spent: allTimeSpent,
      left: remainingBalance,
      since: validSyncDate,
    },
  };
}
