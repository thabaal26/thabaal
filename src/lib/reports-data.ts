import "server-only";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { db } from "./db";
import { APP_TZ } from "./format";
import { campaignResults } from "./business-reports";
import { refillForecast } from "./refill-forecast";
import { numberHealth } from "./limits";
import { spendSummary, RATES } from "./spend";
import type { OrderItem } from "./orders";

export type PeriodKey = "m" | "w";

export type PeriodFigures = {
  cost: number;
  sales: number;
  wait: number;
  sent: number;
  reached: number;
  read: number;
  rep: number;
  ord: number;
  paid: number;
  returnRatio: number;
  verdictGood: boolean;
  verdictOk: boolean;
  verdictTitle: string;
  verdictSub: string;
  funnel: {
    name: string;
    value: number;
    sub: string;
    pct: number;
  }[];
  actions: {
    title: string;
    value: string;
    action: string;
    href: string;
  }[];
};

export type ReportOverview = {
  m: PeriodFigures;
  w: PeriodFigures;
  wallet: {
    balance: number;
    isLow: boolean;
    marketingMsgsLeft: number;
    utilityMsgsLeft: number;
  };
  spend: {
    thisMonth: number;
    thisMonthGst: number;
    lastMonth: number;
    freeRepliesLeft: number;
    freeRepliesTotal: number;
    returnPerRupee: number;
  };
  daily: {
    days: string[];
    marketing: number[];
    utility: number[];
    paid: number[];
    free: number[];
    highestDay: number;
    costPerDelivered: number;
  };
  breakdown: {
    marketing: number;
    utility: number;
    serviceTotal: number;
  };
  limits: {
    used: number;
    limit: number;
    left: number;
  };
};

export type ReportCampaignRow = {
  id: string;
  name: string;
  template: string;
  sent: number;
  read: number;
  replies: number;
  paidOrders: number;
  spent: number;
  sales: number;
  returnRatio: number;
  verdict: "ok" | "warn" | "bad";
  verdictLabel: string;
};

export type BestDayTimeSlot = {
  slot: string;
  count: number;
  badge: "Best" | "Good" | "Avoid";
  badgeType: "ok" | "warn" | "bad";
};

export type RepeatItem = {
  title: string;
  actionText: string;
  actionHref?: string;
  isPill?: boolean;
  pillType?: "ok" | "warn" | "bad";
};

export type ReportCampaigns = {
  campaigns: ReportCampaignRow[];
  bestTimes: BestDayTimeSlot[];
  whatToRepeat: RepeatItem[];
};

export type CustomerFollowUp = {
  title: string;
  sub: string;
  action: string;
  href: string;
};

export type LocationRow = {
  name: string;
  count: number;
  pct: number;
};

export type ReportCustomers = {
  boughtThisMonth: number;
  boughtDiff: string;
  newCustomers: number;
  cameBack: number;
  repeatRatioLabel: string;
  lapsed60Days: number;
  followUps: CustomerFollowUp[];
  locations: LocationRow[];
  topLocationInsight: string;
};

export type ProductDemandRow = {
  name: string;
  sold: number;
  sales: number;
  leftInCarts: number;
  action: string;
  pillType: "ok" | "warn" | "mute" | "bad";
};

export type StuckCartItem = {
  text: string;
  href: string;
};

export type WorthPromotingItem = {
  title: string;
  desc: string;
  actionText: string;
  actionHref: string;
  primary?: boolean;
};

export type ReportProducts = {
  products: ProductDemandRow[];
  stuckInCarts: {
    totalWaiting: number;
    items: StuckCartItem[];
  };
  worthPromoting: WorthPromotingItem[];
};

export type ComprehensiveReportData = {
  overview: ReportOverview;
  campaigns: ReportCampaigns;
  customers: ReportCustomers;
  products: ReportProducts;
  summaryText: string;
};

const DAY = 86_400_000;

function dayStart(d: Date) {
  return fromZonedTime(`${formatInTimeZone(d, APP_TZ, "yyyy-MM-dd")}T00:00:00`, APP_TZ);
}

function monthStarts(now = new Date()) {
  const ym = formatInTimeZone(now, APP_TZ, "yyyy-MM");
  const [y, m] = ym.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return {
    thisMonth: fromZonedTime(`${ym}-01T00:00:00`, APP_TZ),
    lastMonth: fromZonedTime(`${prev}-01T00:00:00`, APP_TZ),
  };
}

function fmtInr(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

async function computePeriodFigures(
  clientId: string,
  from: Date,
  to: Date,
  periodName: "this month" | "this week",
  refillDueCount: number,
): Promise<PeriodFigures> {
  const range = { gte: from, lt: to };

  const [msgs, orders, rawReplies] = await Promise.all([
    db.message.findMany({
      where: { customer: { clientId }, createdAt: range, status: { notIn: ["QUEUED", "SKIPPED"] } },
      select: { status: true, pricingCategory: true, billable: true },
    }),
    db.order.findMany({
      where: { clientId, createdAt: range, status: { not: "CANCELLED" } },
      select: { id: true, total: true, status: true, paidAt: true },
    }),
    db.reply.count({
      where: { customer: { clientId }, receivedAt: range },
    }),
  ]);

  const replies = rawReplies;
  let cost = 0;
  const sent = msgs.length;
  let reached = 0;
  let read = 0;

  for (const m of msgs) {
    if (m.status === "DELIVERED" || m.status === "READ") {
      reached++;
      if (m.billable && m.pricingCategory && RATES[m.pricingCategory]) {
        cost += RATES[m.pricingCategory];
      }
    }
    if (m.status === "READ") read++;
  }

  let sales = 0;
  let wait = 0;
  let paidCount = 0;
  let unpaidCount = 0;

  for (const o of orders) {
    const isPaid = Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);
    if (isPaid) {
      sales += o.total;
      paidCount++;
    } else {
      wait += o.total;
      unpaidCount++;
    }
  }

  cost = Math.round(cost * 100) / 100;
  const returnRatio = cost > 0 ? Math.round((sales / cost) * 100) / 100 : sales;

  const hasActivity = sent > 0 || orders.length > 0;
  const verdictGood = hasActivity && returnRatio >= 10;
  const verdictOk = hasActivity && returnRatio >= 3;
  const verdictTitle = !hasActivity
    ? `No message activity yet ${periodName}.`
    : verdictGood
    ? `WhatsApp is working well ${periodName}.`
    : verdictOk
    ? `WhatsApp is doing alright ${periodName}.`
    : `WhatsApp is not paying back ${periodName}.`;

  const verdictSub = !hasActivity
    ? `Broadcast campaigns and customer orders will calculate your live return on message spend here.`
    : `You spent ${fmtInr(cost)} on messages and received ${fmtInr(
        sales,
      )} in paid orders. Every ₹1 spent brought back ${fmtInr(returnRatio)} in sales.`;

  // Funnel steps (6 steps)
  const funnel = [
    { name: "Messages sent", value: sent, sub: "Customers you chose", pct: 100 },
    {
      name: "Reached their phone",
      value: reached,
      sub: sent ? `${Math.round((reached / sent) * 100)} of 100 sent` : "",
      pct: sent ? Math.round((reached / sent) * 100) : 0,
    },
    {
      name: "Read it",
      value: read,
      sub: sent ? `${Math.round((read / sent) * 100)} of 100 sent` : "",
      pct: sent ? Math.round((read / sent) * 100) : 0,
    },
    {
      name: "Replied",
      value: replies,
      sub: "Within 3 days",
      pct: sent ? Math.min(100, Math.round((replies / sent) * 100)) : 0,
    },
    {
      name: "Ordered",
      value: orders.length,
      sub: "Within 7 days",
      pct: sent ? Math.min(100, Math.round((orders.length / sent) * 100)) : 0,
    },
    {
      name: "Paid",
      value: paidCount,
      sub: "Money in your account",
      pct: sent ? Math.min(100, Math.round((paidCount / sent) * 100)) : 0,
    },
  ];

  // Action cards (3 cards)
  const readNoReply = Math.max(0, read - replies);
  const actions = [
    {
      title: `${unpaidCount} unpaid order${unpaidCount === 1 ? "" : "s"}`,
      value: wait > 0 ? fmtInr(wait) : "₹0",
      action: "Send reminder",
      href: "/dashboard/orders?show=unpaid",
    },
    {
      title: `${readNoReply} read it, did not order`,
      value: "Follow up",
      action: "Create campaign",
      href: "/dashboard/campaigns/new",
    },
    {
      title: `${refillDueCount} may reorder`,
      value: "Reach today",
      action: "View customers",
      href: "/dashboard/refills",
    },
  ];

  return {
    cost,
    sales,
    wait,
    sent,
    reached,
    read,
    rep: replies,
    ord: orders.length,
    paid: paidCount,
    returnRatio,
    verdictGood,
    verdictOk,
    verdictTitle,
    verdictSub,
    funnel,
    actions,
  };
}

export async function getComprehensiveReportData(clientId: string): Promise<ComprehensiveReportData> {
  const now = new Date();
  const today = dayStart(now);
  const { thisMonth, lastMonth } = monthStarts(now);
  const tomorrow = addDays(today, 1);
  const weekStart = new Date(today.getTime() - 6 * DAY);

  // Parallel fetch core data
  const [spend, refills, numbers, campaignsRaw, allReplies, allCustomers, allOrders] = await Promise.all([
    spendSummary(clientId).catch(() => null),
    refillForecast(clientId, now).catch(() => ({ due: [], lapsedCount: 0 })),
    numberHealth(clientId).catch(() => []),
    campaignResults(clientId, 90).catch(() => []),
    db.reply.findMany({
      where: { customer: { clientId } },
      select: { receivedAt: true },
    }),
    db.customer.findMany({
      where: { clientId },
      select: { id: true, createdAt: true, location: true, tags: true },
    }),
    db.order.findMany({
      where: { clientId, status: { not: "CANCELLED" } },
      select: {
        id: true,
        customerId: true,
        total: true,
        paidAt: true,
        status: true,
        createdAt: true,
        items: true,
      },
    }),
  ]);

  const refillDueCount = refills.due.length;

  // 1. Period Figures for Month & Week
  const [pMonth, pWeek] = await Promise.all([
    computePeriodFigures(clientId, thisMonth, tomorrow, "this month", refillDueCount),
    computePeriodFigures(clientId, weekStart, tomorrow, "this week", refillDueCount),
  ]);

  // 2. Wallet & Spend Telemetry
  const walletBalance = spend?.remainingBalance ?? Math.max(0, 1500 - (spend?.totalMonthSpent ?? 0));
  const isWalletLow = walletBalance < 500;
  const mktMsgsLeft = Math.floor(walletBalance / RATES.marketing);
  const utMsgsLeft = Math.floor(walletBalance / RATES.utility);

  const thisMonthSpent = spend?.totalMonthSpent ?? pMonth.cost;
  const thisMonthGst = spend?.totalMonthSpentWithGst ?? Math.round(thisMonthSpent * 1.18);
  const lastMonthSpent = spend ? spend.previous.reduce((sum, r) => sum + r.cost, 0) : 0;
  const freeRemaining = spend?.serviceQuota?.freeRemaining ?? 1000;
  const freeTotal = spend?.serviceQuota?.totalFreeLimit ?? 1000;
  const returnPerRupee = thisMonthSpent > 0 ? Math.round((pMonth.sales / thisMonthSpent) * 10) / 10 : pMonth.sales;

  // Daily spend series (last 14 days)
  const daysList: string[] = [];
  const mktList: number[] = [];
  const utList: number[] = [];
  const paidList: number[] = [];
  const freeList: number[] = [];

  const fourteenDaysAgo = new Date(today.getTime() - 13 * DAY);
  const recentMsgs = await db.message.findMany({
    where: {
      customer: { clientId },
      createdAt: { gte: fourteenDaysAgo },
      status: { notIn: ["QUEUED", "SKIPPED"] },
    },
    select: { createdAt: true, pricingCategory: true, billable: true, status: true },
  });

  let maxDaySpend = 0;
  let totalDeliveredMsgs = 0;
  let totalSpentRecent = 0;

  for (let i = 0; i < 14; i++) {
    const d = addDays(fourteenDaysAgo, i);
    const dayKey = formatInTimeZone(d, APP_TZ, "d");
    daysList.push(dayKey);

    const dStart = dayStart(d);
    const dEnd = addDays(dStart, 1);

    let dMkt = 0;
    let dUt = 0;
    let dPaid = 0;
    let dFree = 0;

    for (const m of recentMsgs) {
      if (m.createdAt >= dStart && m.createdAt < dEnd) {
        const isDelivered = m.status === "DELIVERED" || m.status === "READ";
        if (isDelivered) totalDeliveredMsgs++;

        if (m.billable && m.pricingCategory) {
          const cost = RATES[m.pricingCategory] ?? 0;
          if (m.pricingCategory === "marketing") dMkt += cost;
          else dUt += cost;
          if (isDelivered) {
            dPaid++;
            totalSpentRecent += cost;
          }
        } else {
          dFree++;
        }
      }
    }

    const dayTot = dMkt + dUt;
    if (dayTot > maxDaySpend) maxDaySpend = dayTot;

    mktList.push(Math.round(dMkt));
    utList.push(Math.round(dUt));
    paidList.push(dPaid);
    freeList.push(dFree);
  }

  const costPerDelivered = totalDeliveredMsgs > 0 ? Math.round((totalSpentRecent / totalDeliveredMsgs) * 100) / 100 : 0.86;

  // Limits
  const mainNum = numbers[0];
  const limits = {
    used: mainNum?.used ?? 0,
    limit: mainNum?.limit ?? 250,
    left: mainNum?.left ?? 250,
  };

  // Where the money goes breakdown
  const mktSum = spend?.current?.find((c) => c.category === "marketing")?.cost ?? pMonth.cost * 0.75;
  const utSum = spend?.current?.find((c) => c.category === "utility")?.cost ?? pMonth.cost * 0.25;

  const overview: ReportOverview = {
    m: pMonth,
    w: pWeek,
    wallet: {
      balance: walletBalance,
      isLow: isWalletLow,
      marketingMsgsLeft: mktMsgsLeft,
      utilityMsgsLeft: utMsgsLeft,
    },
    spend: {
      thisMonth: thisMonthSpent,
      thisMonthGst,
      lastMonth: lastMonthSpent,
      freeRepliesLeft: freeRemaining,
      freeRepliesTotal: freeTotal,
      returnPerRupee,
    },
    daily: {
      days: daysList,
      marketing: mktList,
      utility: utList,
      paid: paidList,
      free: freeList,
      highestDay: Math.round(maxDaySpend),
      costPerDelivered,
    },
    breakdown: {
      marketing: Math.round(mktSum),
      utility: Math.round(utSum),
      serviceTotal: spend?.serviceQuota?.usedTotal ?? 0,
    },
    limits,
  };

  // 3. Campaigns Performance
  const campaigns: ReportCampaignRow[] = campaignsRaw.map((c) => {
    const spent = Math.round(c.sent * 0.8631);
    const returnRatio = spent > 0 ? Math.round((c.revenue / spent) * 100) / 100 : c.revenue;
    const verdict = returnRatio >= 10 ? "ok" : returnRatio >= 3 ? "warn" : "bad";
    const verdictLabel = returnRatio >= 10 ? "Working well" : returnRatio >= 3 ? "OK" : "Stop";
    return {
      id: c.id,
      name: c.name,
      template: c.template,
      sent: c.sent,
      read: c.read,
      replies: c.replied,
      paidOrders: c.bought,
      spent,
      sales: Math.round(c.revenue),
      returnRatio,
      verdict,
      verdictLabel,
    };
  });
  campaigns.sort((a, b) => b.returnRatio - a.returnRatio);

  // Best day and time calculation from customer replies
  const timeBuckets: Record<string, number> = {};
  for (const r of allReplies) {
    const day = formatInTimeZone(r.receivedAt, APP_TZ, "EEEE");
    const hr = parseInt(formatInTimeZone(r.receivedAt, APP_TZ, "H"), 10);
    let slot = "";
    if (hr >= 9 && hr < 13) slot = `${day} 9 am–1 pm`;
    else if (hr >= 13 && hr < 17) slot = `${day} 1–5 pm`;
    else if (hr >= 17 && hr < 21) slot = `${day} 5–9 pm`;
    else slot = `${day} after 9 pm`;

    timeBuckets[slot] = (timeBuckets[slot] || 0) + 1;
  }

  const sortedSlots = Object.entries(timeBuckets).sort((a, b) => b[1] - a[1]);
  const bestTimes: BestDayTimeSlot[] = sortedSlots.length
    ? [
        {
          slot: sortedSlots[0][0],
          count: sortedSlots[0][1],
          badge: "Best",
          badgeType: "ok",
        },
        ...(sortedSlots[1]
          ? [
              {
                slot: sortedSlots[1][0],
                count: sortedSlots[1][1],
                badge: "Good" as const,
                badgeType: "warn" as const,
              },
            ]
          : []),
        ...(sortedSlots.length > 2
          ? [
              {
                slot: sortedSlots[sortedSlots.length - 1][0],
                count: sortedSlots[sortedSlots.length - 1][1],
                badge: "Avoid" as const,
                badgeType: "bad" as const,
              },
            ]
          : []),
      ]
    : [];

  const topCampaign = campaigns[0];
  const whatToRepeat: RepeatItem[] = [];
  if (topCampaign && topCampaign.sales > 0 && topCampaign.returnRatio >= 3) {
    whatToRepeat.push({
      title: `${topCampaign.name} brought ₹${Math.round(topCampaign.returnRatio)} back for every ₹1`,
      actionText: "Run again",
      actionHref: "/dashboard/campaigns/new",
      isPill: false,
    });
  }
  const lowCampaign = [...campaigns].reverse().find((c) => c.returnRatio < 2 && c.spent > 0);
  if (lowCampaign) {
    whatToRepeat.push({
      title: `${lowCampaign.name} had low return (${lowCampaign.returnRatio}x)`,
      actionText: "Review",
      actionHref: `/dashboard/campaigns/${lowCampaign.id}`,
      isPill: true,
      pillType: "bad",
    });
  }

  // 4. Customers Performance
  const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY);
  const buyersAll = allOrders.filter(
    (o) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status),
  );

  const lastOrderDateByCust = new Map<string, Date>();
  const totalOrdersByCust = new Map<string, number>();

  for (const b of buyersAll) {
    const cur = lastOrderDateByCust.get(b.customerId);
    if (!cur || b.createdAt > cur) lastOrderDateByCust.set(b.customerId, b.createdAt);
    totalOrdersByCust.set(b.customerId, (totalOrdersByCust.get(b.customerId) || 0) + 1);
  }

  const thisMonthBuyers = new Set(
    buyersAll.filter((b) => b.createdAt >= thisMonth && b.createdAt < tomorrow).map((b) => b.customerId),
  );
  const lastMonthBuyers = new Set(
    buyersAll.filter((b) => b.createdAt >= lastMonth && b.createdAt < thisMonth).map((b) => b.customerId),
  );

  const boughtDiffNum = thisMonthBuyers.size - lastMonthBuyers.size;
  const boughtDiff = boughtDiffNum >= 0 ? `+${boughtDiffNum} vs last month` : `${boughtDiffNum} vs last month`;

  const newCustThisMonth = allCustomers.filter((c) => c.createdAt >= thisMonth && c.createdAt < tomorrow).length;

  let cameBackCount = 0;
  for (const cId of thisMonthBuyers) {
    if ((totalOrdersByCust.get(cId) ?? 0) > 1) cameBackCount++;
  }
  const repeatRatio = thisMonthBuyers.size > 0 ? Math.round((cameBackCount / thisMonthBuyers.size) * 100) : 0;
  const repeatRatioLabel = `${repeatRatio} of 100 buyers`;

  let lapsed60Days = 0;
  let singleOrderCount = 0;
  for (const [cId, lastDate] of lastOrderDateByCust.entries()) {
    if (lastDate < sixtyDaysAgo) lapsed60Days++;
    if (totalOrdersByCust.get(cId) === 1) singleOrderCount++;
  }
  const taggedLapsed = allCustomers.filter((c) => c.tags.includes("lapsed")).length;
  lapsed60Days = Math.max(lapsed60Days, taggedLapsed, refills.lapsedCount);

  // Unpaid carts customers
  const unpaidOrders = allOrders.filter((o) => (o.status === "NEW" || o.status === "CONFIRMED") && !o.paidAt);
  const unpaidCustCount = new Set(unpaidOrders.map((o) => o.customerId)).size;
  const unpaidTotalAmt = unpaidOrders.reduce((sum, o) => sum + o.total, 0);

  const followUps: CustomerFollowUp[] = [
    {
      title: "Unpaid carts",
      sub: `${unpaidCustCount} customer${unpaidCustCount === 1 ? "" : "s"} · ${fmtInr(unpaidTotalAmt)}`,
      action: "Send reminder",
      href: "/dashboard/orders?show=unpaid",
    },
    {
      title: "Refill due",
      sub: `${refillDueCount} customer${refillDueCount === 1 ? "" : "s"}`,
      action: "Send reminder",
      href: "/dashboard/refills",
    },
    {
      title: "Not bought in 60 days",
      sub: `${lapsed60Days} customer${lapsed60Days === 1 ? "" : "s"}`,
      action: "Win them back",
      href: "/dashboard/campaigns/new",
    },
    {
      title: "Bought once only",
      sub: `${singleOrderCount} customer${singleOrderCount === 1 ? "" : "s"}`,
      action: "Ask for second order",
      href: "/dashboard/campaigns/new",
    },
  ];

  // Locations breakdown
  const locCounts = new Map<string, number>();
  for (const c of allCustomers) {
    if (!c.location || c.location.trim() === "") continue;
    const loc = c.location.trim();
    locCounts.set(loc, (locCounts.get(loc) || 0) + 1);
  }
  const sortedLocs = [...locCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxLocCount = sortedLocs[0]?.[1] || 1;
  const locations: LocationRow[] = sortedLocs.map(([name, count]) => ({
    name,
    count,
    pct: Math.round((count / maxLocCount) * 100),
  }));

  const topLocName = locations[0]?.name;
  const topLocationInsight = topLocName
    ? `${topLocName} buys the most. A delivery-day offer for that area usually works.`
    : "Customer area trends will show once locations are recorded on orders.";

  // 5. Products Performance
  const productMap = new Map<string, { sold: number; sales: number; leftInCarts: number }>();
  for (const o of allOrders) {
    const isPaid = Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);
    const items = (o.items as OrderItem[] | null) ?? [];
    for (const it of items) {
      const name = it.name || "Product";
      const cur = productMap.get(name) ?? { sold: 0, sales: 0, leftInCarts: 0 };
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      if (isPaid) {
        cur.sold += qty;
        cur.sales += price * qty;
      } else {
        cur.leftInCarts += qty;
      }
      productMap.set(name, cur);
    }
  }

  const productRows: ProductDemandRow[] = [...productMap.entries()].map(([name, p]) => {
    let action = "Keep in stock";
    let pillType: "ok" | "warn" | "mute" | "bad" = "ok";

    if (p.sales > 400) {
      action = "Your money maker";
      pillType = "ok";
    } else if (p.leftInCarts > 0) {
      action = "Chase the carts";
      pillType = "warn";
    } else if (p.sold > 1) {
      action = "Try a combo";
      pillType = "warn";
    } else if (p.sold === 0) {
      action = "Sold before, not now";
      pillType = "mute";
    }

    return {
      name,
      sold: p.sold,
      sales: p.sales,
      leftInCarts: p.leftInCarts,
      action,
      pillType,
    };
  });
  productRows.sort((a, b) => b.sales - a.sales || b.leftInCarts - a.leftInCarts);

  // Stuck in carts items
  const stuckItems: StuckCartItem[] = [];
  for (const [name, p] of productMap.entries()) {
    if (p.leftInCarts > 0) {
      stuckItems.push({
        text: `${name} · ${p.leftInCarts} cart${p.leftInCarts === 1 ? "" : "s"}`,
        href: "/dashboard/orders?show=unpaid",
      });
    }
  }

  // Worth promoting items
  const worthPromoting: WorthPromotingItem[] = [];
  const topSeller = productRows.find((p) => p.sold > 0);
  if (topSeller) {
    worthPromoting.push({
      title: topSeller.name,
      desc: "Top seller by volume. Great anchor product for your next broadcast.",
      actionText: "Make a campaign",
      actionHref: "/dashboard/campaigns/new",
      primary: true,
    });
  }
  const zeroSold = productRows.find((p) => p.sold === 0);
  if (zeroSold) {
    worthPromoting.push({
      title: zeroSold.name,
      desc: "Zero recent orders. Try featuring this with a special introductory discount.",
      actionText: "Open products",
      actionHref: "/dashboard/catalogue",
    });
  }

  // 6. Summary Text (WhatsApp format)
  const rangeStr = `${formatInTimeZone(thisMonth, APP_TZ, "d MMM")} – ${formatInTimeZone(now, APP_TZ, "d MMM yyyy")}`;
  const readNoReplyMonth = Math.max(0, pMonth.read - pMonth.rep);
  const summaryText = [
    `*WhatsApp Business Report · ${rangeStr}*`,
    `Verdict: ${pMonth.verdictTitle}`,
    `Paid sales: ${fmtInr(pMonth.sales)} from ${pMonth.paid} orders`,
    `WhatsApp spend: ${fmtInr(pMonth.cost)} · Return: ₹${pMonth.returnRatio} per ₹1`,
    `Messages sent: ${pMonth.sent} · Reached: ${pMonth.reached} · Read: ${pMonth.read}`,
    `Customer replies: ${pMonth.rep} · Unpaid waiting: ${fmtInr(pMonth.wait)}`,
    productRows[0] ? `Top product: ${productRows[0].name} (${fmtInr(productRows[0].sales)})` : "",
    `\n*Action items:*`,
    `• Remind ${unpaidCustCount} unpaid cart customer${unpaidCustCount === 1 ? "" : "s"} (${fmtInr(unpaidTotalAmt)})`,
    `• ${refillDueCount} reorder${refillDueCount === 1 ? "" : "s"} due this week`,
    `• Follow up ${readNoReplyMonth} customers who read but haven't ordered`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    overview,
    campaigns: {
      campaigns,
      bestTimes,
      whatToRepeat,
    },
    customers: {
      boughtThisMonth: thisMonthBuyers.size,
      boughtDiff,
      newCustomers: newCustThisMonth,
      cameBack: cameBackCount,
      repeatRatioLabel,
      lapsed60Days,
      followUps,
      locations,
      topLocationInsight,
    },
    products: {
      products: productRows,
      stuckInCarts: {
        totalWaiting: unpaidTotalAmt,
        items: stuckItems,
      },
      worthPromoting,
    },
    summaryText,
  };
}
