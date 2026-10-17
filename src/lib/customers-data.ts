import "server-only";
import { db } from "./db";
import { computeCustomerLoyalty, isInternalLoyaltyTag } from "./loyalty";

/*
 * Customers page (portal design): one row per customer with what they bought, how much, when last,
 * their own usual gap between orders, any unpaid cart, and whether they ever chatted. Tier and
 * buying status follow the design's rules (worked out here from real orders); loyalty points come
 * from the app's own loyalty rules (lib/loyalty.ts).
 */

const DAY = 86_400_000;

export type Tier = "Platinum" | "Gold" | "Silver" | "New" | "No orders";
export type Status = "Active" | "Slipping" | "Lost" | "—";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  area: string | null;
  region: string | null;
  optedOut: boolean;
  unreachable: boolean;
  orders: number;
  spend: number;
  /** Days since the last bought order (null: never ordered). */
  lastDays: number | null;
  /** The customer's own usual gap between orders, in days (null: fewer than 2 orders). */
  gapDays: number | null;
  cart: number;
  chatted: boolean;
  tier: Tier;
  status: Status;
  points: number;
  pointsWorth: number;
  redeemable: number;
  products: string[];
  tags: string[];
  badPhone: boolean;
};

export const TIER_TONE: Record<Tier, "ok" | "warn" | "mute" | "info"> = { Platinum: "ok", Gold: "warn", Silver: "mute", New: "info", "No orders": "mute" };
export const STATUS_TONE: Record<Status, "ok" | "warn" | "bad" | "mute"> = { Active: "ok", Slipping: "warn", Lost: "bad", "—": "mute" };

/** Without a customer's own rhythm yet, this gap (days) stands in. */
const DEFAULT_GAP = 30;

export async function customersData(clientId: string, opts: { clientName?: string | null } = {}) {
  const now = Date.now();
  const rows = await db.$queryRaw<
    {
      id: string;
      name: string;
      phone: string;
      location: string | null;
      region: string | null;
      optedOut: boolean;
      unreachable: boolean;
      tags: string[];
      purchases: string | null;
      orders: bigint;
      spend: number | null;
      last_at: Date | null;
      first_at: Date | null;
      cart: number | null;
      redeemed: bigint | null;
      replies: bigint;
    }[]
  >`
    SELECT c.id, c.name, c.phone, c.location, c.region, c."optedOut", c.unreachable, c.tags, c.purchases,
      count(o.id) FILTER (WHERE o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED')) AS orders,
      sum(o.total) FILTER (WHERE o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED')) AS spend,
      max(o."createdAt") FILTER (WHERE o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED')) AS last_at,
      min(o."createdAt") FILTER (WHERE o."paidAt" IS NOT NULL OR o.status IN ('CONFIRMED','PAID','DISPATCHED','DELIVERED')) AS first_at,
      sum(o.total) FILTER (WHERE o."paidAt" IS NULL AND o.status IN ('NEW','CONFIRMED')) AS cart,
      sum(o."pointsRedeemed") AS redeemed,
      (SELECT count(*) FROM "Reply" r WHERE r."customerId" = c.id) AS replies
    FROM "Customer" c
    LEFT JOIN "Order" o ON o."customerId" = c.id AND o.status <> 'CANCELLED'
    WHERE c."clientId" = ${clientId}
    GROUP BY c.id
    ORDER BY max(o."createdAt") DESC NULLS LAST, c."createdAt" DESC
    LIMIT 5000
  `;

  // Tier cut-offs: top 10% of spend (with 3+ orders) is Platinum, the next 20% Gold.
  const spends = rows.map((r) => Number(r.spend ?? 0)).filter((s) => s > 0).sort((a, b) => b - a);
  const cut = (share: number) => spends[Math.max(0, Math.ceil(spends.length * share) - 1)] ?? Infinity;
  const platinumCut = cut(0.1);
  const goldCut = cut(0.3);
  const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const clientTag = opts.clientName ? plain(opts.clientName) : "";

  const customers: CustomerRow[] = rows.map((r) => {
    const orders = Number(r.orders);
    const spend = Number(r.spend ?? 0);
    const lastDays = r.last_at ? Math.floor((now - r.last_at.getTime()) / DAY) : null;
    const gapDays = orders >= 2 && r.first_at && r.last_at ? Math.max(1, Math.round((r.last_at.getTime() - r.first_at.getTime()) / DAY / (orders - 1))) : null;
    const tier: Tier =
      orders === 0 ? "No orders" : orders === 1 && (lastDays ?? 999) <= 30 ? "New" : spend >= platinumCut && orders >= 3 ? "Platinum" : spend >= goldCut ? "Gold" : "Silver";
    const g = gapDays ?? DEFAULT_GAP;
    const status: Status = lastDays === null ? "—" : lastDays > 180 || lastDays > g * 3 ? "Lost" : lastDays > g * 1.5 ? "Slipping" : "Active";
    const loyalty = computeCustomerLoyalty({
      name: r.name,
      paidOrdersCount: orders,
      totalSpent: spend,
      sheetPurchases: r.purchases,
      tags: r.tags,
      redeemedPoints: Number(r.redeemed ?? 0),
    });
    const digits = r.phone.replace(/\D/g, "");
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      area: r.location,
      region: r.region,
      optedOut: r.optedOut,
      unreachable: r.unreachable,
      orders,
      spend,
      lastDays,
      gapDays,
      cart: Number(r.cart ?? 0),
      chatted: Number(r.replies) > 0,
      tier,
      status,
      points: loyalty.totalPoints,
      pointsWorth: loyalty.rewardRupees,
      redeemable: loyalty.redeemableRupees,
      products: r.tags.filter((t) => t.startsWith("product:")).map((t) => t.slice(8)),
      tags: r.tags.filter((t) => !t.startsWith("product:") && !isInternalLoyaltyTag(t) && plain(t) !== clientTag),
      badPhone: digits.length < 10,
    };
  });

  return { customers, platinumCut, goldCut };
}

export type CustomersData = Awaited<ReturnType<typeof customersData>>;
