import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { quietUntil } from "@/lib/rules";
import { DAYS, effectiveInterval, estimateDuration, formatMinutes, timeUntil } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { toggleCampaign } from "../actions/campaigns";

import { fmtNumber } from "@/lib/format";
import { FilterChips } from "@/components/ui";

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
  const [campaigns, audiences] = await Promise.all([
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
  ]);
  const audienceOf = (clientId: string) => audiences.find((a) => a.clientId === clientId)?._count ?? 0;
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
        description="Recurring or one-off sends. Each one delivers in batches at the pace you set."
        actions={
          canCreate && (
            <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
              <Plus aria-hidden className="size-4" /> <span>New<span className="max-sm:sr-only"> campaign</span></span>
            </Link>
          )
        }
        inlineActions
        tabs={
          <FilterChips
            label="Campaign status"
            items={TABS.map((t) => ({
              href: t.key ? `/dashboard/campaigns?show=${t.key}` : "/dashboard/campaigns",
              label: t.label,
              count: fmtNumber(tabCounts[t.key]),
              active: (show || "") === t.key,
            }))}
          />
        }
      />

      {visible.length ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((c) => {
            const last = c.runs[0];
            return (
              <Card key={c.id} className={cn("lift relative flex flex-col p-4 active:bg-sunken sm:p-5", !c.active && "bg-canvas")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-base font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-card hover:underline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--color-brand-deep)]">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted">
                      {!scope.clientId && <span className="font-sans font-medium text-ink-2">{c.client.name} · </span>}
                      {c.template.name}
                    </p>
                  </div>
                  {c.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Paused</Badge>}
                </div>

                <div className="mt-4 space-y-1.5">
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
                        <li key={d} aria-hidden className={cn("grid h-7 place-items-center rounded-md text-2xs font-medium", c.daysOfWeek.includes(i) ? "bg-brand text-white font-semibold" : "bg-sunken text-muted")}>
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <dl className="tabular mt-4 flex justify-between gap-3 border-t border-line pt-3 text-xs sm:grid sm:grid-cols-3">
                  <div>
                    <dt className="text-muted">Time</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-sm font-medium text-ink">{c.sendTime}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Pace</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-sm font-medium text-ink">{c.batchSize} / {effectiveInterval(c.intervalMinutes)} min</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Takes</dt>
                    <dd className="mt-0.5 whitespace-nowrap text-sm font-medium text-ink">~{formatMinutes(estimateDuration(audienceOf(c.clientId), c.batchSize, c.intervalMinutes))}</dd>
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
                    {last && ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"].includes(last.status) && <StatusBadge status={last.status} />}
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
        <Card>
          <EmptyState
            icon={<CalendarClock className="size-5" />}
            title="No campaigns yet"
            action={canCreate && <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}><Plus className="size-4" /> New campaign</Link>}
          >
            {scope.canManage
              ? scope.clientId
                ? "For two promotions a week, create one campaign and pick two days, for example Tuesday and Friday."
                : "Pick a client in the sidebar to create a campaign for them."
              : "Campaigns set up for you will appear here."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
