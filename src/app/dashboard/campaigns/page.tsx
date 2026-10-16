import type { Metadata } from "next";
import { Plus } from "@/components/icons";
import Link from "@/components/intent-link";
import { campaignResults, type CampaignResult } from "@/lib/business-reports";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { templateLabel } from "@/lib/plain-error";
import { quietUntil } from "@/lib/rules";
import { DAYS } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { INDIA_GST_RATE, RATES } from "@/lib/spend";
import { deleteCampaign, runCampaignNow, toggleCampaign } from "../actions/campaigns";
import { RefillForm } from "../orders/refill-form";
import { inr } from "../portal-format";
import { LinkTabs, PAction, Pill, PortalPage, type PillTone } from "../portal-ui";
import { WinbackForm } from "./winback-form";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

type State = "scheduled" | "running" | "completed" | "drafts" | "paused";
const STATE: Record<State, { tone: PillTone; label: string }> = {
  scheduled: { tone: "info", label: "Scheduled" },
  running: { tone: "ok", label: "Running" },
  completed: { tone: "mute", label: "Completed" },
  drafts: { tone: "mute", label: "Draft" },
  paused: { tone: "warn", label: "Paused" },
};
const LIVE_RUN = ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"];
const WAITING: Record<string, string> = {
  WAITING_TEMPLATE: "waiting for the template",
  WAITING_CONNECTION: "waiting for WhatsApp",
  WAITING_LIMIT: "waiting: daily limit reached",
  WAITING_QUALITY: "paused to protect your number",
  WAITING_QUIET: "waiting for quiet hours to end",
  WAITING_FUNDS: "waiting for a wallet top-up",
};

const TABS = [
  { id: "all", label: "All", ta: "அனைத்தும்" },
  { id: "scheduled", label: "Scheduled" },
  { id: "running", label: "Running" },
  { id: "completed", label: "Completed" },
  { id: "drafts", label: "Drafts" },
  { id: "paused", label: "Paused" },
  { id: "auto", label: "Automations" },
] as const;

/** Rupees a delivered marketing message costs, with GST (an estimate, as on WhatsApp costs). */
const PER_MSG = RATES.marketing * (1 + INDIA_GST_RATE);

/** Campaigns (portal design): every campaign by stage with its results, and the automatic messages. */
export default async function CampaignsPage({ searchParams }: PageProps<"/dashboard/campaigns">) {
  const sp = await searchParams;
  const raw = typeof sp.show === "string" ? sp.show : "all";
  const show = raw === "active" ? "scheduled" : TABS.some((t) => t.id === raw) ? raw : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const scope = await getScope();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [campaigns, audiences, clientData, templates, lapsed, results, monthMsgs] = await Promise.all([
    db.campaign.findMany({
      where: owned(scope),
      include: {
        client: { select: { name: true, quietFrom: true, quietTo: true } },
        template: { select: { name: true, status: true, category: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
        _count: { select: { runs: true } },
      },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    }),
    db.customer.groupBy({ by: ["clientId"], where: { ...owned(scope), optedOut: false }, _count: true }),
    scope.clientId && scope.canManage
      ? db.client.findUnique({ where: { id: scope.clientId }, select: { refillDays: true, refillTemplateId: true, lapsedDays: true, winbackTemplateId: true } })
      : null,
    scope.clientId && scope.canManage
      ? db.template.findMany({ where: { clientId: scope.clientId, status: "APPROVED", category: { not: "AUTHENTICATION" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    scope.clientId && scope.canManage ? db.customer.count({ where: { clientId: scope.clientId, tags: { has: "lapsed" }, optedOut: false } }) : 0,
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
  const rows = campaigns.map((c) => ({ c, s: stateOf(c), r: byId.get(c.id) }));
  const count = (id: string) => (id === "all" ? rows.length : rows.filter((x) => x.s === id).length);

  const sentMonth = monthMsgs.filter((m) => !["QUEUED", "SKIPPED", "FAILED"].includes(m.status)).reduce((n, m) => n + m._count, 0);
  const deliveredMonth = monthMsgs.filter((m) => m.status === "DELIVERED" || m.status === "READ").reduce((n, m) => n + m._count, 0);
  const spendMonth = deliveredMonth * PER_MSG;
  const sales90 = results.reduce((n, r) => n + r.revenue, 0);
  const spend90 = results.reduce((n, r) => n + r.delivered * PER_MSG, 0);

  const verdict = (r?: CampaignResult): { tone: PillTone; label: string } | null => {
    if (!r || r.delivered === 0 || r.bought === 0) return null;
    const back = r.revenue / (r.delivered * PER_MSG);
    return back >= 10 ? { tone: "ok", label: "Working well" } : back >= 3 ? { tone: "warn", label: "OK" } : { tone: "bad", label: "Not paying back" };
  };
  const when = (c: (typeof campaigns)[number], s: State) => {
    if (s === "running") return `Sending now${WAITING[c.runs[0]?.status] ? ` · ${WAITING[c.runs[0].status]}` : ""}`;
    if (c.nextRunAt) {
      const days = c.scheduleType === "WEEKLY" ? (c.daysOfWeek.length === 7 ? "Every day" : c.daysOfWeek.map((d) => DAYS[d]).join(", ")) : null;
      return `${days ? `${days} · ` : ""}next ${fmtDate(c.nextRunAt, "EEE d MMM, h:mm a")}`;
    }
    if (c.runs[0]) return `Last sent ${fmtDate(c.runs[0].startedAt, "d MMM")}`;
    return "Not scheduled";
  };

  const list = rows.filter((x) => (show === "all" || x.s === show) && (!q || x.c.name.toLowerCase().includes(q)));

  const card = ({ c, s, r }: (typeof rows)[number]) => {
    const v = verdict(r);
    const last = c.runs[0];
    const spent = r ? r.delivered * PER_MSG : 0;
    const resume = c.nextRunAt && c.template.category === "MARKETING" ? quietUntil(c.client, c.nextRunAt) : null;
    return (
      <article key={c.id} className="card">
        <div className="hd" style={{ marginBottom: 8 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18 }}>
              <Link href={`/dashboard/campaigns/${c.id}`} style={{ textDecoration: "none" }}>
                {c.name}
              </Link>
            </h2>
            <p>
              {!scope.clientId && `${c.client.name} · `}
              {when(c, s)} · {c.audienceTag ? `To: ${c.audienceTag.replace(/^aud:.*/, "a saved group")}` : "All who can be reached"} · “{templateLabel(c.template.name)}”
            </p>
          </div>
          <div className="tools">
            <Pill tone={STATE[s].tone}>{STATE[s].label}</Pill>
            {c.template.status !== "APPROVED" && <Pill tone="warn">Template not approved</Pill>}
            {v && <Pill tone={v.tone}>{v.label}</Pill>}
          </div>
        </div>

        {s === "scheduled" && (
          <p className="small">
            Will go to about <b>{reach(c.clientId).toLocaleString("en-IN")}</b> people · costs about <b>{inr(reach(c.clientId) * PER_MSG)}</b> if all are delivered.
            {resume && <span className="down"> Quiet hours: it will wait and start at {fmtDate(resume, "h:mm a")}.</span>}
          </p>
        )}
        {s === "drafts" && <p className="small muted">Not started yet. Check the audience and time, then turn it on.</p>}
        {(s === "running" || s === "completed" || s === "paused" || (s === "scheduled" && r && r.sent > 0)) && r && r.sent > 0 && (
          <>
            {s === "running" && last && last.total > 0 && (
              <>
                <div className="bar" style={{ marginBottom: 10 }}>
                  <i style={{ width: `${Math.min(100, Math.round((r.sent / Math.max(r.sent, last.total)) * 100))}%`, background: "var(--bar)" }} />
                </div>
              </>
            )}
            <div className="grid g4 keep2">
              <div className="stat">
                <div className="l">Sent</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {r.sent.toLocaleString("en-IN")}
                </div>
                {r.failed > 0 && <div className="d down">{r.failed} failed</div>}
              </div>
              <div className="stat">
                <div className="l">Read</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {r.read.toLocaleString("en-IN")}
                </div>
                <div className="d muted">{r.delivered ? Math.round((r.read / r.delivered) * 100) : 0} of 100</div>
              </div>
              <div className="stat">
                <div className="l">Replies</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {r.replied}
                </div>
              </div>
              <div className="stat">
                <div className="l">Paid orders</div>
                <div className="v" style={{ fontSize: 20 }}>
                  {r.bought}
                </div>
              </div>
            </div>
            {s === "completed" ? (
              <p className="note small" style={{ marginTop: 12 }}>
                Reached {r.sent.toLocaleString("en-IN")} customers. {r.read.toLocaleString("en-IN")} read it. {r.bought} paid order{r.bought === 1 ? "" : "s"} brought {inr(r.revenue)}. You spent about {inr(spent)}.
                {spent > 0 && ` Every ₹1 spent brought ${inr(r.revenue / spent)} in sales.`}
              </p>
            ) : (
              <p className="small" style={{ marginTop: 10 }}>
                Spent about <b>{inr(spent)}</b> · Sales <b>{inr(r.revenue)}</b> <span className="muted">(last 90 days)</span>
              </p>
            )}
          </>
        )}

        <div className="tools" style={{ marginTop: 12 }}>
          <Link className="btn primary" href={`/dashboard/campaigns/${c.id}`}>
            {s === "running" ? "View progress" : s === "completed" ? "View result" : s === "drafts" ? "Continue setup" : s === "scheduled" ? "View schedule" : "Open"}
          </Link>
          {scope.canManage && s !== "completed" && (
            <PAction action={toggleCampaign.bind(null, c.id, !c.active)} aria-label={`${c.active ? "Pause" : "Resume"} ${c.name}`}>
              {c.active ? "Pause" : s === "drafts" ? "Turn on" : "Resume"}
            </PAction>
          )}
          {scope.canManage && (s === "completed" || s === "paused") && c.template.status === "APPROVED" && (
            <PAction action={runCampaignNow.bind(null, c.id)} confirm={`Send “${c.name}” again now?`}>
              Send again now
            </PAction>
          )}
          {s === "running" && r && r.failed > 0 && (
            <Link className="btn sm" href="/dashboard/messages?status=FAILED">
              View failed messages
            </Link>
          )}
          {scope.canManage && (s === "drafts" || s === "paused") && (
            <PAction action={deleteCampaign.bind(null, c.id)} className="sm danger" confirm="Delete this campaign? Messages already sent stay in the log.">
              Delete
            </PAction>
          )}
          {r && r.sent > 0 && (
            <Link className="btn sm ghost" href={`/dashboard/campaigns/compare?a=${c.id}`} style={{ marginLeft: "auto" }}>
              Compare
            </Link>
          )}
        </div>
      </article>
    );
  };

  return (
    <PortalPage
      title="Campaigns"
      titleTa="பிரச்சாரம்"
      sub="Create, schedule and improve your WhatsApp broadcasts."
      subTa="உங்கள் வாட்ஸ்அப் செய்திகளை உருவாக்கி, நேரம் அமைத்து, மேம்படுத்துங்கள்."
      actions={
        canCreate ? (
          <Link className="btn primary" href="/dashboard/campaigns/new">
            <Plus aria-hidden className="ic" /> New campaign
          </Link>
        ) : undefined
      }
    >
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="l">Sent this month</div>
          <div className="v">{sentMonth.toLocaleString("en-IN")}</div>
        </div>
        <div className="card stat">
          <div className="l">Money spent</div>
          <div className="v">{inr(spendMonth)}</div>
          <div className="d muted">Meta message charges (estimate)</div>
        </div>
        <div className="card stat">
          <div className="l">Sales from campaigns</div>
          <div className="v">{inr(sales90)}</div>
          <div className="d muted">Paid within 7 days · last 90 days</div>
        </div>
        <div className="card stat">
          <div className="l">Back for every ₹1</div>
          <div className="v">{spend90 > 0 ? inr(sales90 / spend90) : "—"}</div>
          <div className="d muted">Sales, not profit</div>
        </div>
      </div>

      <LinkTabs
        label="Campaign views"
        current={show}
        tabs={TABS.map((t) => ({ ...t, href: t.id === "all" ? "/dashboard/campaigns" : `/dashboard/campaigns?show=${t.id}`, count: t.id === "auto" ? undefined : count(t.id) }))}
      />

      {show === "auto" ? (
        <>
          <p className="muted" style={{ marginBottom: 14 }}>
            Set these once. They run on their own, with no campaign to start.
          </p>
          {clientData ? (
            <div id="reorder-settings" className="grid g2" style={{ alignItems: "start" }}>
              <RefillForm days={clientData.refillDays} templateId={clientData.refillTemplateId} templates={templates} />
              <WinbackForm days={clientData.lapsedDays} templateId={clientData.winbackTemplateId} templates={templates} lapsed={lapsed} />
            </div>
          ) : (
            <p className="muted">Ask your admin to change automatic messages.</p>
          )}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="list">
              <div className="row">
                <div className="grow">
                  <div className="t">Order updates</div>
                  <div className="muted small">Confirmed, dispatched and delivered messages go out from the order buttons. Approved order templates cover customers outside the 24-hour window.</div>
                </div>
                <Link className="btn sm" href="/dashboard/orders">
                  Orders
                </Link>
              </div>
              <div className="row">
                <div className="grow">
                  <div className="t">STOP opt-out</div>
                  <div className="muted small">Anyone who replies STOP is left out of every campaign automatically.</div>
                </div>
                <Pill tone="ok">On</Pill>
              </div>
              <div className="row">
                <div className="grow">
                  <div className="t">Payment reminder</div>
                  <div className="muted small">One reminder when a WhatsApp payment request is still unpaid after a few hours.</div>
                </div>
                <Pill tone="ok">On</Pill>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <form className="toolbar" role="search">
            {show !== "all" && <input type="hidden" name="show" value={show} />}
            <div className="search">
              <input type="search" name="q" defaultValue={q} placeholder="Search campaign name" aria-label="Search campaigns" />
            </div>
            <Link className="btn sm" href="/dashboard/campaigns/compare" style={{ marginLeft: "auto" }}>
              Compare campaigns
            </Link>
            <Link className="btn sm" href="/dashboard/messages">
              Message log
            </Link>
          </form>
          <div className="stack">
            {list.map(card)}
            {list.length === 0 && (
              <section className="card">
                <h2>{rows.length ? "Nothing here" : "No campaigns yet"}</h2>
                <p className="muted" style={{ marginTop: 6 }}>
                  {rows.length
                    ? "Try another tab or search."
                    : scope.canManage
                      ? "For two offers a week, create one campaign and pick two days, for example Tuesday and Friday."
                      : "Campaigns set up for you will appear here."}
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </PortalPage>
  );
}
