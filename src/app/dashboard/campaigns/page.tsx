import { Calendar, PauseCircle, Plus, Sparkles, Users } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, EmptyState, FilterChips, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { quietUntil } from "@/lib/rules";
import { DAYS, effectiveInterval, estimateDuration, formatMinutes, timeUntil } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { toggleCampaign } from "../actions/campaigns";
import { RefillForm } from "../orders/refill-form";
import { WinbackForm } from "./winback-form";
import { templateLabel } from "@/lib/plain-error";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
] as const;

export default async function CampaignsPage({ searchParams }: PageProps<"/dashboard/campaigns">) {
  const { show = "" } = await searchParams;
  const scope = await getScope();
  const [campaigns, audiences, clientData, templates, lapsed] = await Promise.all([
    db.campaign.findMany({
      where: owned(scope),
      include: {
        client: { select: { name: true, quietFrom: true, quietTo: true } },
        template: { select: { name: true, status: true, category: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
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
      ? db.customer.count({
          where: { clientId: scope.clientId, tags: { has: "lapsed" }, optedOut: false },
        })
      : 0,
  ]);
  const audienceOf = (clientId: string) => audiences.find((a) => a.clientId === clientId)?._count ?? 0;
  const totalReach = audiences.reduce((sum, a) => sum + a._count, 0);
  const canCreate = scope.canManage && scope.clientId;
  const now = new Date();

  const activeCount = campaigns.filter((c) => c.active).length;
  const pausedCount = campaigns.length - activeCount;
  const tabCounts: Record<string, number> = {
    "": campaigns.length,
    active: activeCount,
    paused: pausedCount,
  };

  const visible =
    show === "active"
      ? campaigns.filter((c) => c.active)
      : show === "paused"
        ? campaigns.filter((c) => !c.active)
        : campaigns;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Send offers, set up automatic messages and check what was delivered."
        actions={
          <>
            <Link href="/dashboard/campaigns/compare" className={buttonClass("secondary")}>
              Compare
            </Link>
            {canCreate && (
              <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
                <Plus aria-hidden className="size-4 stroke-[2]" /> <span>New<span className="max-sm:sr-only"> campaign</span></span>
              </Link>
            )}
          </>
        }
        inlineActions
        tabs={
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Campaign sub-views" className="inline-flex rounded-xl border border-line bg-card p-1 shadow-2xs">
              <Link
                href="/dashboard/campaigns"
                className="inline-flex min-h-[32px] items-center rounded-lg px-3.5 text-[13.5px] font-semibold bg-ink text-canvas shadow-xs -translate-y-px transition-all duration-200 ease-out active:scale-[0.96]"
              >
                Campaigns
              </Link>
              <Link
                href="/dashboard/templates"
                className="inline-flex min-h-[32px] items-center rounded-lg px-3.5 text-[13.5px] font-semibold text-muted hover:text-ink hover:bg-subtle/60 transition-all duration-200 ease-out active:scale-[0.96]"
              >
                Message templates
              </Link>
              <a
                href="#reorder-settings"
                className="inline-flex min-h-[32px] items-center rounded-lg px-3.5 text-[13.5px] font-semibold text-muted hover:text-ink hover:bg-subtle/60 transition-all duration-200 ease-out active:scale-[0.96]"
              >
                Automatic messages
              </a>
              <Link
                href="/dashboard/messages"
                className="inline-flex min-h-[32px] items-center rounded-lg px-3.5 text-[13.5px] font-semibold text-muted hover:text-ink hover:bg-subtle/60 transition-all duration-200 ease-out active:scale-[0.96]"
              >
                Message log
              </Link>
            </nav>
            <FilterChips
              label="Campaign status"
              items={TABS.map((t) => ({
                href: t.key ? `/dashboard/campaigns?show=${t.key}` : "/dashboard/campaigns",
                label: t.label,
                count: fmtNumber(tabCounts[t.key]),
                active: (show || "") === t.key,
              }))}
            />
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Active schedules"
          value={fmtNumber(activeCount)}
          sub={`of ${fmtNumber(campaigns.length)} total campaigns`}
          icon={<Calendar className="size-5 stroke-[2]" />}
          tone="brand"
          meter={campaigns.length > 0 ? Math.round((activeCount / campaigns.length) * 100) : 0}
          href="/dashboard/campaigns?show=active"
        />
        <Stat
          label="Paused"
          value={fmtNumber(pausedCount)}
          sub="Hold until resumed"
          icon={<PauseCircle className="size-5 stroke-[2]" />}
          tone="amber"
          href="/dashboard/campaigns?show=paused"
        />
        <Stat
          label="Reachable customers"
          value={fmtNumber(totalReach)}
          sub="Opted-in recipients"
          icon={<Users className="size-5 stroke-[2]" />}
          tone="info"
          href="/dashboard/customers"
        />
        <Stat
          label="Lapsed customers"
          value={fmtNumber(lapsed)}
          sub={clientData?.winbackTemplateId ? "Auto win-back enabled" : "Ready for win-back"}
          icon={<Sparkles className="size-5 stroke-[2]" />}
          tone="gold"
          href="/dashboard/customers?tag=lapsed"
        />
      </div>

      {visible.length ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((c) => {
            const last = c.runs[0];
            return (
              <Card key={c.id} className={cn("card-3d relative flex flex-col overflow-hidden p-3.5 active:bg-sunken sm:p-5", !c.active && "opacity-90")}>
                <span aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", c.active ? "bg-brand" : "bg-line-strong")} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-[14.5px] font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--color-brand-deep)] sm:text-base">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {!scope.clientId && <span className="font-sans font-medium text-ink-2">{c.client.name} · </span>}
                      {templateLabel(c.template.name)}
                    </p>
                  </div>
                  {c.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Paused</Badge>}
                </div>

                <div className="mt-3.5 space-y-2 sm:mt-4">
                  <div className="flex items-center gap-2">
                    {c.scheduleType === "WEEKLY" ? (
                      <Badge tone="brand">
                        {c.daysOfWeek.length === 7
                          ? "Daily · 7 days"
                          : c.daysOfWeek.length === 5 && c.daysOfWeek.every((d) => d >= 1 && d <= 5)
                            ? "Weekdays · Mon–Fri"
                            : c.daysOfWeek.length === 1
                              ? `Weekly once · ${DAYS[c.daysOfWeek[0]]}`
                              : c.daysOfWeek.length === 2
                                ? `Weekly twice · ${DAYS[c.daysOfWeek[0]]} & ${DAYS[c.daysOfWeek[1]]}`
                                : `${c.daysOfWeek.length}× a week`}
                      </Badge>
                    ) : (
                      <Badge tone="blue">Calendar · {fmtDate(c.runAt, "EEE d MMM yyyy")}</Badge>
                    )}
                  </div>
                  {c.scheduleType === "WEEKLY" && (
                    <ul aria-label={`Sends every ${c.daysOfWeek.map((d) => DAYS[d]).join(", ")}`} className="grid max-w-80 grid-cols-7 gap-1">
                      {DAYS.map((d, i) => (
                        <li
                          key={d}
                          aria-hidden
                          className={cn(
                            "grid h-7 place-items-center rounded-[6px] text-2xs font-medium",
                            c.daysOfWeek.includes(i) ? "tile-3d bg-brand font-semibold text-on-brand" : "bg-sunken text-muted",
                          )}
                        >
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <dl className="tabular mt-3.5 grid grid-cols-3 gap-1.5 rounded-control bg-sunken/75 p-2 text-xs sm:mt-4 sm:gap-2 sm:p-2.5">
                  <div>
                    <dt className="text-muted text-[11px] sm:text-xs">Time</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-xs font-semibold text-ink sm:text-sm">{c.sendTime}</dd>
                  </div>
                  <div>
                    <dt className="text-muted text-[11px] sm:text-xs">Pace</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-xs font-semibold text-ink sm:text-sm">{c.batchSize} / {effectiveInterval(c.intervalMinutes)}m</dd>
                  </div>
                  <div>
                    <dt className="text-muted text-[11px] sm:text-xs">Takes</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-xs font-semibold text-ink sm:text-sm">~{formatMinutes(estimateDuration(audienceOf(c.clientId), c.batchSize, c.intervalMinutes))}</dd>
                  </div>
                </dl>

                <div className="mt-auto flex flex-col gap-3 pt-4 text-xs min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between">
                  <span className="min-w-0 text-muted">
                    {c.template.status !== "APPROVED" ? (
                      <span className="text-warning">Template waiting for approval</span>
                    ) : c.active && c.nextRunAt ? (
                      <>
                        Starts <b className="text-ink">{timeUntil(c.nextRunAt, now)}</b> · {fmtDate(c.nextRunAt, "EEE d MMM, h:mm a")}
                        {c.template.category === "MARKETING" && (() => {
                          const resume = quietUntil(c.client, c.nextRunAt);
                          return resume ? <span className="block text-warning">Quiet hours: it will wait and start at {fmtDate(resume, "h:mm a")}</span> : null;
                        })()}
                      </>
                    ) : last ? (
                      <>Last run {fmtDate(last.startedAt, "d MMM")}</>
                    ) : (
                      "Not scheduled"
                    )}
                  </span>
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    {last && ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET", "WAITING_FUNDS"].includes(last.status) && <StatusBadge status={last.status} />}
                    {scope.canManage && (
                      <ActionButton className="relative z-10" action={toggleCampaign.bind(null, c.id, !c.active)} aria-label={`${c.active ? "Pause" : "Resume"} ${c.name}`}>
                        {c.active ? "Pause" : "Resume"}
                      </ActionButton>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="card-3d">
          <EmptyState
            icon={<Calendar className="size-5 stroke-[2]" />}
            title="No campaigns yet"
            action={canCreate && <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}><Plus className="size-4 stroke-[2]" /> New campaign</Link>}
          >
            {scope.canManage
              ? scope.clientId
                ? "For two promotions a week, create one campaign and pick two days, for example Tuesday and Friday."
                : "Pick a client in the sidebar to create a campaign for them."
              : "Campaigns set up for you will appear here."}
          </EmptyState>
        </Card>
      )}

      {clientData && (
        <div id="reorder-settings" className="mt-6 grid items-start gap-4 sm:mt-8 xl:grid-cols-2">
          <RefillForm
            days={clientData.refillDays}
            templateId={clientData.refillTemplateId}
            templates={templates}
          />
          <WinbackForm
            days={clientData.lapsedDays}
            templateId={clientData.winbackTemplateId}
            templates={templates}
            lapsed={lapsed}
          />
        </div>
      )}
    </>
  );
}

