import { CalendarClock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { DAYS, estimateDuration, formatMinutes } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { toggleCampaign } from "../actions/campaigns";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const scope = await getScope();
  const [campaigns, audiences] = await Promise.all([
    db.campaign.findMany({
      where: owned(scope),
      include: {
        client: { select: { name: true } },
        template: { select: { name: true, status: true } },
        runs: { orderBy: { startedAt: "desc" }, take: 1 },
      },
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    }),
    db.customer.groupBy({ by: ["clientId"], where: { ...owned(scope), optedOut: false }, _count: true }),
  ]);
  const audienceOf = (clientId: string) => audiences.find((a) => a.clientId === clientId)?._count ?? 0;
  const canCreate = scope.isAdmin && scope.clientId;

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Recurring or one-off sends. Each one delivers in batches at the pace you set."
        actions={
          canCreate && (
            <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
              <Plus className="size-4" /> New campaign
            </Link>
          )
        }
      />

      {campaigns.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c) => {
            const last = c.runs[0];
            return (
              <Card key={c.id} className={cn("relative p-4 transition hover:shadow-pop active:bg-canvas/60 sm:p-5", !c.active && "opacity-75")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-base font-semibold after:absolute after:inset-0 hover:underline">{c.name}</Link>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted">
                      {!scope.clientId && <span className="font-sans font-medium text-ink-2">{c.client.name} · </span>}
                      {c.template.name}
                    </p>
                  </div>
                  {c.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Paused</Badge>}
                </div>

                <div className="mt-4 flex flex-wrap gap-1">
                  {c.scheduleType === "WEEKLY" ? (
                    DAYS.map((d, i) => (
                      <span key={d} className={cn("grid h-7 w-9 place-items-center rounded-md text-[11px] font-medium", c.daysOfWeek.includes(i) ? "bg-brand text-white" : "bg-canvas text-muted")}>{d}</span>
                    ))
                  ) : (
                    <Badge tone="blue">Once · {fmtDate(c.runAt, "d MMM yyyy")}</Badge>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
                  <div>
                    <dt className="text-muted">Time</dt>
                    <dd className="mt-0.5 font-medium">{c.sendTime}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Pace</dt>
                    <dd className="mt-0.5 font-medium">{c.batchSize} / {c.intervalMinutes} min</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Takes</dt>
                    <dd className="mt-0.5 font-medium">~{formatMinutes(estimateDuration(audienceOf(c.clientId), c.batchSize, c.intervalMinutes))}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">
                    {c.template.status !== "APPROVED" ? (
                      <span className="text-amber-700">Template waiting for approval</span>
                    ) : c.active && c.nextRunAt ? (
                      <>Next: <b className="text-ink">{fmtDate(c.nextRunAt, "EEE d MMM, h:mm a")}</b></>
                    ) : last ? (
                      <>Last run {fmtDate(last.startedAt, "d MMM")}</>
                    ) : (
                      "Not scheduled"
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {last && ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"].includes(last.status) && <StatusBadge status={last.status} />}
                    {scope.isAdmin && (
                      <ActionButton className="relative z-10" action={toggleCampaign.bind(null, c.id, !c.active)}>{c.active ? "Pause" : "Resume"}</ActionButton>
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
            {scope.isAdmin
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
