import type { Metadata } from "next";
import { campaignResults, type CampaignResult } from "@/lib/business-reports";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { templateLabel } from "@/lib/plain-error";
import { computeNextRun, DAYS } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { INDIA_GST_RATE, RATES, spendSummary } from "@/lib/spend";
import { campaignAudienceWhere } from "@/lib/audiences";
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

export default async function CampaignsPage() {
  const scope = await getScope();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [campaigns, audiences, clientData, templates, lapsed, results, monthMsgs, spendInfo] = await Promise.all([
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
    db.customer.groupBy({ by: ["clientId"], where: { ...owned(scope), optedOut: false, unreachable: false }, _count: true }),
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
      where: {
        createdAt: { gte: monthStart },
        customer: scope.clientId ? { clientId: scope.clientId } : {},
      },
      _count: true,
    }),
    scope.clientId ? spendSummary(scope.clientId).catch(() => null) : Promise.resolve(null),
  ]);

  const reach = (clientId: string) => audiences.find((a) => a.clientId === clientId)?._count ?? 0;
  const byId = new Map(results.map((r) => [r.id, r]));
  const canCreate = scope.canManage && scope.clientId;

  const stateOf = (c: (typeof campaigns)[number]): State => {
    const last = c.runs[0];
    if (last && LIVE_RUN.includes(last.status)) return "running";
    if (c.active && (c.nextRunAt || c.scheduleType === "WEEKLY")) return "scheduled";
    if (!c.active && c._count.runs === 0) return "drafts";
    if (c.scheduleType !== "WEEKLY" && last && !c.nextRunAt) return "completed";
    return c.active ? "scheduled" : "paused";
  };

  const when = (c: (typeof campaigns)[number], s: State) => {
    if (s === "running") return `Sending now${WAITING[c.runs[0]?.status] ? ` · ${WAITING[c.runs[0].status]}` : ""}`;
    const next = c.active ? (c.nextRunAt && c.nextRunAt > now ? c.nextRunAt : computeNextRun(c, now)) : null;
    if (next) {
      if (c.scheduleType === "WEEKLY") {
        const days = c.daysOfWeek.length === 7 ? "Every day" : c.daysOfWeek.map((d) => DAYS[d]).join(", ");
        return `${days} · ${fmtDate(next, "h:mm a").toLowerCase()}`;
      }
      return `${fmtDate(next, "EEE d MMM · h:mm a").toLowerCase()}`;
    }
    if (c.runs[0]) return `Ended ${fmtDate(c.runs[0].startedAt, "d MMM")}`;
    return "Not scheduled";
  };

  const rows = campaigns.map((c) => ({ c, s: stateOf(c), r: byId.get(c.id) }));

  const liveItems: CampaignItem[] = await Promise.all(
    rows.map(async ({ c, s, r }) => {
      const last = c.runs[0];
      const templateButtons: string[] = [];
      if (Array.isArray(c.template.buttons)) {
        for (const b of c.template.buttons as unknown[]) {
          if (b && typeof b === "object" && "text" in b && typeof b.text === "string") {
            templateButtons.push(b.text);
          }
        }
      }

      let targetCount = reach(c.clientId);
      if (c.audienceTag) {
        try {
          const audienceWhereClause = await campaignAudienceWhere(c.clientId, c.audienceTag.trim() || null);
          targetCount = await db.customer.count({ where: audienceWhereClause });
        } catch {
          targetCount = reach(c.clientId);
        }
      }

      const spent = r ? r.delivered * PER_MSG : (last ? (last.total ?? 0) * PER_MSG : 0);
      const seenRate = r && r.delivered > 0 ? Math.round((r.read / r.delivered) * 100) : 0;

      let audienceLabel = "All who can be reached";
      if (c.audienceTag) {
        if (c.audienceTag.startsWith("aud:")) {
          audienceLabel = "a saved group";
        } else if (c.audienceTag === "vip") {
          audienceLabel = "vip";
        } else {
          audienceLabel = c.audienceTag;
        }
      }

      return {
        id: c.id,
        n: c.name,
        w: when(c, s),
        tpl: templateLabel(c.template.name),
        s,
        aud: audienceLabel,
        cnt: targetCount || (last?.total ?? 0),
        sent: r?.sent ?? last?.total ?? 0,
        seen: seenRate,
        rep: r?.replied ?? 0,
        ord: r?.bought ?? 0,
        sp: Math.round(spent),
        sale: Math.round(r?.revenue ?? 0),
        fail: r?.failed ?? 0,
        est: Math.round(targetCount * PER_MSG) || 1,
        body: c.template.body ?? "",
        buttons: templateButtons.length > 0 ? templateButtons : ["Order now"],
        isLive: true,
      };
    })
  );

  // Real sent count this month
  const sentMonth = monthMsgs
    .filter((m) => ["SENT", "DELIVERED", "READ"].includes(m.status))
    .reduce((n, m) => n + m._count, 0);

  // Real delivered count this month
  const deliveredMonth = monthMsgs
    .filter((m) => m.status === "DELIVERED" || m.status === "READ")
    .reduce((n, m) => n + m._count, 0);

  // Real Meta charges with GST
  const spendMonth = spendInfo?.totalMonthSpentWithGst ? Math.round(spendInfo.totalMonthSpentWithGst) : Math.round(deliveredMonth * PER_MSG);

  // Real sales from campaigns
  const salesCampaigns = Math.round(results.reduce((n, r) => n + r.revenue, 0));

  // Real return ratio
  const backRatio = spendMonth > 0 ? Math.round(salesCampaigns / spendMonth) : 0;

  return (
    <CampaignsDashboard
      kpi={{
        sent: sentMonth,
        spent: spendMonth,
        sales: salesCampaigns,
        back: backRatio,
      }}
      campaigns={liveItems}
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
