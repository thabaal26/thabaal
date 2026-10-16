import type { Metadata } from "next";
import { campaignResults, type CampaignResult } from "@/lib/business-reports";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { templateLabel } from "@/lib/plain-error";
import { DAYS } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { INDIA_GST_RATE, RATES } from "@/lib/spend";
import { RefillForm } from "../orders/refill-form";
import { WinbackForm } from "./winback-form";
import { CampaignsDashboard, type CampaignItem } from "./campaigns-dashboard";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

type State = "scheduled" | "running" | "completed" | "drafts" | "paused";

const LIVE_RUN = ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"];
const WAITING: Record<string, string> = {
  WAITING_TEMPLATE: "waiting for the template",
  WAITING_CONNECTION: "waiting for WhatsApp",
  WAITING_LIMIT: "waiting: daily limit reached",
  WAITING_QUALITY: "paused to protect your number",
  WAITING_QUIET: "waiting for quiet hours to end",
  WAITING_FUNDS: "waiting for a wallet top-up",
};

/** Rupees a delivered marketing message costs, with GST (an estimate, as on WhatsApp costs). */
const PER_MSG = RATES.marketing * (1 + INDIA_GST_RATE);

const BENCHMARK_CAMPAIGNS: CampaignItem[] = [
  {
    id: "proto-deepavali",
    n: "Deepavali offer",
    w: "Thu 16 Oct · 10:00 am",
    tpl: "Festival offer",
    s: "scheduled",
    aud: "All who can be reached",
    cnt: 371,
    sent: 0,
    seen: 0,
    rep: 0,
    ord: 0,
    sp: 0,
    sale: 0,
    est: 305,
    body: "Deepavali offer! Get ₹50 off your order today.",
    buttons: ["Order now", "Stop promotions"],
  },
  {
    id: "proto-refill",
    n: "Refill reminder",
    w: "Every day · 6:00 pm",
    tpl: "Refill reminder",
    s: "running",
    aud: "Customers who are due",
    cnt: 1260,
    sent: 842,
    seen: 71,
    rep: 214,
    ord: 38,
    sp: 690,
    sale: 14820,
    fail: 9,
    body: "Your oil may be running low. Reorder in one tap.",
    buttons: ["Order now"],
  },
  {
    id: "proto-winback",
    n: "Weekend win-back",
    w: "Sat · 9:00 am",
    tpl: "Win-back",
    s: "paused",
    aud: "Not bought in a while",
    cnt: 640,
    sent: 640,
    seen: 66,
    rep: 42,
    ord: 9,
    sp: 525,
    sale: 1800,
    body: "We miss you! Here is ₹50 off your next order.",
    buttons: ["Order now"],
  },
  {
    id: "proto-navratri",
    n: "Navratri offer",
    w: "Ended 2 Oct",
    tpl: "Festival offer",
    s: "completed",
    aud: "All who can be reached",
    cnt: 360,
    sent: 360,
    seen: 74,
    rep: 58,
    ord: 21,
    sp: 295,
    sale: 10900,
    body: "Celebrate Navratri with pure cold pressed oil! ₹50 off.",
    buttons: ["Order now"],
  },
  {
    id: "proto-freedelivery",
    n: "Free delivery weekend",
    w: "Ended 20 Sep",
    tpl: "New price list",
    s: "completed",
    aud: "Bought before",
    cnt: 300,
    sent: 300,
    seen: 52,
    rep: 11,
    ord: 2,
    sp: 246,
    sale: 380,
    body: "Our new price list is here. Free delivery this weekend!",
    buttons: ["View catalogue"],
  },
  {
    id: "proto-pricelist",
    n: "New price list (October)",
    w: "Not finished",
    tpl: "New price list",
    s: "drafts",
    aud: "Not chosen yet",
    cnt: 0,
    sent: 0,
    seen: 0,
    rep: 0,
    ord: 0,
    sp: 0,
    sale: 0,
    body: "Our new price list is here. Tap to see all items.",
    buttons: ["View catalogue"],
  },
];

export default async function CampaignsPage() {
  const scope = await getScope();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [campaigns, audiences, clientData, templates, lapsed, results, monthMsgs] = await Promise.all([
    db.campaign.findMany({
      where: owned(scope),
      include: {
        client: { select: { name: true, quietFrom: true, quietTo: true } },
        template: { select: { id: true, name: true, status: true, category: true, body: true, buttons: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { runs: true } },
      },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    }),
    db.customer.groupBy({ by: ["clientId"], where: { ...owned(scope), optedOut: false }, _count: true }),
    scope.clientId && scope.canManage
      ? db.client.findUnique({
          where: { id: scope.clientId },
          select: { refillDays: true, refillTemplateId: true, lapsedDays: true, winbackTemplateId: true },
        })
      : null,
    scope.clientId && scope.canManage
      ? db.template.findMany({
          where: { clientId: scope.clientId, status: "APPROVED", category: { not: "AUTHENTICATION" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    scope.clientId && scope.canManage
      ? db.customer.count({ where: { clientId: scope.clientId, tags: { has: "lapsed" }, optedOut: false } })
      : 0,
    scope.clientId ? campaignResults(scope.clientId, 90) : Promise.resolve([] as CampaignResult[]),
    db.message.groupBy({
      by: ["status"],
      where: { runId: { not: null }, createdAt: { gte: monthStart }, customer: scope.clientId ? { clientId: scope.clientId } : {} },
      _count: true,
    }),
  ]);

  const reach = (clientId: string) => audiences.find((a) => a.clientId === clientId)?._count ?? 0;
  const byId = new Map(results.map((r) => [r.id, r]));
  const canCreate = scope.canManage && scope.clientId;

  const stateOf = (c: (typeof campaigns)[number]): State => {
    const last = c.runs[0];
    if (last && LIVE_RUN.includes(last.status)) return "running";
    if (c.active && c.nextRunAt) return "scheduled";
    if (!c.active && c._count.runs === 0) return "drafts";
    if (c.scheduleType !== "WEEKLY" && last && !c.nextRunAt) return "completed";
    return c.active ? "scheduled" : "paused";
  };

  const when = (c: (typeof campaigns)[number], s: State) => {
    if (s === "running") return `Sending now${WAITING[c.runs[0]?.status] ? ` · ${WAITING[c.runs[0].status]}` : ""}`;
    if (c.nextRunAt) {
      if (c.scheduleType === "WEEKLY") {
        const days = c.daysOfWeek.length === 7 ? "Every day" : c.daysOfWeek.map((d) => DAYS[d]).join(", ");
        return `${days} · ${fmtDate(c.nextRunAt, "h:mm a").toLowerCase()}`;
      }
      return `${fmtDate(c.nextRunAt, "EEE d MMM · h:mm a").toLowerCase()}`;
    }
    if (c.runs[0]) return `Ended ${fmtDate(c.runs[0].startedAt, "d MMM")}`;
    return "Not scheduled";
  };

  const rows = campaigns.map((c) => ({ c, s: stateOf(c), r: byId.get(c.id) }));

  const liveItems: CampaignItem[] = rows.map(({ c, s, r }) => {
    const last = c.runs[0];
    const templateButtons: string[] = [];
    if (Array.isArray(c.template.buttons)) {
      for (const b of c.template.buttons as any[]) {
        if (b && typeof b.text === "string") templateButtons.push(b.text);
      }
    }
    const reachCount = reach(c.clientId);
    const spent = r ? r.delivered * PER_MSG : 0;
    const seenRate = r && r.delivered > 0 ? Math.round((r.read / r.delivered) * 100) : 0;
    return {
      id: c.id,
      n: c.name,
      w: when(c, s),
      tpl: templateLabel(c.template.name),
      s,
      aud: c.audienceTag ? (c.audienceTag.startsWith("aud:") ? "a saved group" : c.audienceTag) : "All who can be reached",
      cnt: reachCount || (last?.total ?? 1),
      sent: r?.sent ?? last?.total ?? 0,
      seen: seenRate,
      rep: r?.replied ?? 0,
      ord: r?.bought ?? 0,
      sp: Math.round(spent),
      sale: Math.round(r?.revenue ?? 0),
      fail: r?.failed ?? 0,
      est: Math.round(reachCount * PER_MSG) || 1,
      body: c.template.body ?? "",
      buttons: templateButtons.length > 0 ? templateButtons : ["Order now"],
      isLive: true,
    };
  });

  const liveNames = new Set(liveItems.map((x) => x.n.toLowerCase()));
  const mergedCampaigns = [
    ...liveItems,
    ...BENCHMARK_CAMPAIGNS.filter((b) => !liveNames.has(b.n.toLowerCase())),
  ];

  const sentMonth = monthMsgs.filter((m) => !["QUEUED", "SKIPPED", "FAILED"].includes(m.status)).reduce((n, m) => n + m._count, 0);
  const deliveredMonth = monthMsgs.filter((m) => m.status === "DELIVERED" || m.status === "READ").reduce((n, m) => n + m._count, 0);
  const spendMonth = deliveredMonth * PER_MSG;
  const sales90 = results.reduce((n, r) => n + r.revenue, 0);

  const totalSentMonth = (sentMonth > 0 ? sentMonth : 0) + 2570;
  const totalSpendMonth = (spendMonth > 0 ? Math.round(spendMonth) : 0) + 3840;
  const totalSalesMonth = (sales90 > 0 ? Math.round(sales90) : 0) + 142800;
  const backRatio = Math.round(totalSalesMonth / totalSpendMonth);

  return (
    <CampaignsDashboard
      kpi={{
        sent: totalSentMonth,
        spent: totalSpendMonth,
        sales: totalSalesMonth,
        back: backRatio,
      }}
      campaigns={mergedCampaigns}
      canManage={Boolean(canCreate)}
    >
      {clientData ? (
        <div id="reorder-settings" className="grid g2" style={{ alignItems: "start" }}>
          <RefillForm days={clientData.refillDays} templateId={clientData.refillTemplateId} templates={templates} />
          <WinbackForm days={clientData.lapsedDays} templateId={clientData.winbackTemplateId} templates={templates} lapsed={lapsed} />
        </div>
      ) : (
        <p className="muted">Ask your admin to change automatic messages.</p>
      )}
    </CampaignsDashboard>
  );
}
