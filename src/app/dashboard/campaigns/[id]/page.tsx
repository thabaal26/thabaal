import { ChevronRight, FlaskConical, Pause, Play, Send, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Calendar3D, Rupee3D, Send3D, ShoppingBag3D, Users3D } from "@/components/icons-3d";
import { OverflowMenu } from "@/components/overflow-menu";
import { Badge, Card, CardHeader, EmptyState, PageHeader, rowClass, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { Prisma } from "@prisma/client";
import { campaignAudienceWhere } from "@/lib/audiences";
import { decodeTags, describeTags } from "@/lib/audience-tags";
import { db } from "@/lib/db";
import { money } from "@/lib/orders";
import { APP_TZ, fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { describeScheduleSummary, effectiveInterval, TEST_TAG } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { cancelRun, deleteCampaign, runCampaignNow, sendCampaignTest, toggleCampaign } from "../../actions/campaigns";
import { CampaignForm } from "../campaign-form";
import { FailureSummary } from "../failure-summary";
import { campaignFormData } from "../form-data";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: PageProps<"/dashboard/campaigns/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const c = await db.campaign.findFirst({
    where: { id, ...owned(scope) },
    include: {
      runs: { orderBy: { scheduledFor: "desc" }, take: 20 },
      template: { select: { name: true, status: true } },
      sender: { select: { label: true, displayPhone: true } },
    },
  });
  if (!c) notFound();

  const [{ templates, audience, numbers }, stats, charged] = await Promise.all([
    campaignFormData(c.clientId),
    db.message.groupBy({ by: ["runId", "status"], where: { runId: { in: c.runs.map((r) => r.id) } }, _count: true }),
    // Meta reports per message whether it was billed; it doesn't send the amount.
    db.message.groupBy({ by: ["runId"], where: { runId: { in: c.runs.map((r) => r.id) }, billable: true }, _count: true }),
  ]);
  const picked = c.audienceTag ? audience.tags.find((t) => t.tag === c.audienceTag) : undefined;
  // Several tags can overlap, so their reach is counted, not looked up.
  const tagPick = picked ? null : decodeTags(c.audienceTag);
  const audienceSize = !c.audienceTag ? audience.all : picked ? picked.n : await db.customer.count({ where: await campaignAudienceWhere(c.clientId, c.audienceTag) });
  const audienceName = picked?.label ?? (tagPick ? describeTags(tagPick) : c.audienceTag);
  const sendConfirm = `Send "${c.template.name}" now to ${fmtNumber(audienceSize)} customer${audienceSize === 1 ? "" : "s"} (${c.audienceTag ? `"${audienceName}"` : "ALL customers, no tag"})?`;
  // Sales credited to a run: orders a recipient placed within 7 days of getting its message.
  const runIds = c.runs.map((r) => r.id);
  const sales = runIds.length
    ? await db.$queryRaw<{ runId: string; orders: bigint; revenue: number }[]>`
        SELECT m."runId", count(DISTINCT o.id) AS orders, coalesce(sum(o.total), 0)::float AS revenue
        FROM "Message" m
        JOIN "Order" o ON o."customerId" = m."customerId" AND o.status <> 'CANCELLED'
          AND o."createdAt" > m."sentAt" AND o."createdAt" <= m."sentAt" + interval '7 days'
        WHERE m."runId" IN (${Prisma.join(runIds)}) AND m."sentAt" IS NOT NULL
        GROUP BY 1`
    : [];
  const salesOf = (runId: string) => sales.find((x) => x.runId === runId);
  const totalOrders = sales.reduce((n, x) => n + Number(x.orders), 0);
  const totalRevenue = sales.reduce((n, x) => n + Number(x.revenue), 0);
  const chargedIn = (runId: string) => charged.find((x) => x.runId === runId)?._count ?? 0;
  const stat = (runId: string, ...s: string[]) =>
    stats.filter((x) => x.runId === runId && s.includes(x.status)).reduce((a, x) => a + x._count, 0);

  const running = (status: string) => ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"].includes(status);

  return (
    <>
      <PageHeader
        title={c.name}
        back={{ href: "/dashboard/campaigns", label: "Campaigns" }}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {c.active ? <Badge tone="green" dot>Active</Badge> : <Badge dot>Paused</Badge>}
            {c.active && c.nextRunAt ? `Next send ${fmtDate(c.nextRunAt, "EEEE d MMM, h:mm a")}` : "Paused: nothing scheduled"}
          </span>
        }
        rowActions
        actions={
          scope.canManage && (
            <>
              <ActionButton action={runCampaignNow.bind(null, c.id)} size="md" confirm={sendConfirm}>
                <Send aria-hidden className="size-4" /> Send now
              </ActionButton>
              <ActionButton action={toggleCampaign.bind(null, c.id, !c.active)} size="md">
                {c.active ? (
                  <>
                    <Pause aria-hidden className="size-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play aria-hidden className="size-4" /> Resume
                  </>
                )}
              </ActionButton>
              <OverflowMenu title={c.name} label="More campaign actions">
                <ActionButton action={sendCampaignTest.bind(null, c.id)} size="md" title={`Send one copy to your own numbers (customers tagged "${TEST_TAG}")`}>
                  <FlaskConical aria-hidden className="size-4" /> Send test to me
                </ActionButton>
                <ActionButton action={deleteCampaign.bind(null, c.id)} variant="danger" size="md" confirm="Delete this campaign? Messages already sent stay in the log.">
                  <Trash2 aria-hidden className="size-4" /> Delete
                </ActionButton>
              </OverflowMenu>
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="Audience size"
          value={fmtNumber(audienceSize)}
          sub={c.audienceTag ? `${audienceName}` : "All opted-in customers"}
          icon={<Users3D />}
          tone="info"
        />
        <Stat
          label="Recent runs"
          value={fmtNumber(c.runs.length)}
          sub={c.runs[0] ? `Last ${fmtDate(c.runs[0].startedAt, "d MMM")}` : "Never run yet"}
          icon={<Calendar3D />}
          tone="brand"
        />
        <Stat
          label="Orders (7 days)"
          value={fmtNumber(totalOrders)}
          sub="Attributed within 7d of send"
          icon={<ShoppingBag3D />}
          tone="violet"
        />
        <Stat
          label="Sales (7 days)"
          value={money(totalRevenue)}
          sub="From attributed orders"
          icon={<Rupee3D />}
          tone="gold"
        />
      </div>

      {!scope.canManage ? (
        <Card className="card-3d">
          <CardHeader tone="brand" icon={<Calendar3D />} title="Campaign details" />
          <dl className="grid gap-4 p-4 text-sm sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-5">
            <div>
              <dt className="text-xs text-muted">Template</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono">{c.template.name} <StatusBadge status={c.template.status} /></dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Sent to</dt>
              <dd className="mt-1">
                {c.audienceTag ? <Badge>{audienceName}</Badge> : "All customers"}{" "}
                <span className="text-xs text-muted">· {fmtNumber(audienceSize)} customers</span>
              </dd>
            </div>
            {numbers.length > 0 && (
              <div>
                <dt className="text-xs text-muted">Sent from</dt>
                <dd className="mt-1">{c.sender ? c.sender.label : `${numbers.find((n) => n.isDefault)?.label ?? numbers[0].label} (default)`}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted">Schedule</dt>
              <dd className="mt-1">
                {describeScheduleSummary(c.scheduleType, c.daysOfWeek, c.sendTime, c.runAt ? formatInTimeZone(c.runAt, APP_TZ, "yyyy-MM-dd") : undefined)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Pace</dt>
              <dd className="mt-0.5">{c.batchSize} messages every {effectiveInterval(c.intervalMinutes)} min</dd>
            </div>
          </dl>
        </Card>
      ) : (
        <CampaignForm
          id={c.id}
          templates={templates}
          audience={audience}
          numbers={numbers}
          initial={{
            name: c.name,
            templateId: c.templateId,
            senderId: c.senderId ?? "",
            audienceTag: c.audienceTag ?? "",
            scheduleType: c.scheduleType,
            daysOfWeek: c.daysOfWeek,
            sendTime: c.sendTime,
            runDate: c.runAt ? formatInTimeZone(c.runAt, APP_TZ, "yyyy-MM-dd") : new Date().toISOString().slice(0, 10),
            batchSize: c.batchSize,
            intervalMinutes: c.intervalMinutes,
            active: c.active,
          }}
        />
      )}

      <Card className="card-3d mt-4 sm:mt-6">
        <CardHeader
          tone="info"
          icon={<Send3D />}
          title="Send history"
          description={`The last 20 runs of this campaign.${totalOrders ? ` Brought ${fmtNumber(totalOrders)} order${totalOrders === 1 ? "" : "s"} worth ${money(totalRevenue)} within 7 days of sending.` : ""}`}
        />
        {c.runs.length ? (
          <>
            <ul className="divide-y divide-line sm:hidden">
              {c.runs.map((r) => {
                const delivered = stat(r.id, "DELIVERED", "READ");
                const read = stat(r.id, "READ");
                const failed = stat(r.id, "FAILED");
                return (
                  <li key={r.id} className="px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="tabular text-sm font-medium text-ink">{fmtDate(r.startedAt, "EEE d MMM, h:mm a")}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <dl className="tabular mt-2 grid grid-cols-4 gap-1.5 text-center">
                      {[
                        ["Sent to", fmtNumber(r.total)],
                        ["Delivered", `${pct(delivered, r.total)}%`],
                        ["Read", `${pct(read, r.total)}%`],
                        ["Failed", fmtNumber(failed)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col-reverse rounded-control bg-sunken px-1 py-1.5">
                          <dt className="text-2xs text-muted">{k}</dt>
                          <dd className={cn("text-sm font-semibold", k === "Failed" && failed > 0 && "text-danger")}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {salesOf(r.id) && (
                      <p className="tabular mt-2 text-xs text-muted">
                        Sales in 7 days: {fmtNumber(Number(salesOf(r.id)!.orders))} · {money(Number(salesOf(r.id)!.revenue))}
                      </p>
                    )}
                    <div className="mt-1 flex justify-end">
                      {running(r.status) && scope.canManage ? (
                        <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run?">
                          Stop sending
                        </ActionButton>
                      ) : (
                        <Link href={`/dashboard/messages?campaign=${c.id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-deep">
                          View messages <ChevronRight aria-hidden className="size-4" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="max-sm:hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>Started</Th>
                    <Th>Status</Th>
                    <Th numeric>Customers</Th>
                    <Th numeric>Delivered</Th>
                    <Th numeric>Read</Th>
                    <Th numeric>Failed</Th>
                    <Th numeric className="max-lg:hidden" title="Messages Meta billed (marketing rate)">Charged</Th>
                    <Th numeric title="Orders placed within 7 days of receiving this run's message">Sales (7 days)</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </tr>
                </thead>
                <tbody>
                  {c.runs.map((r) => {
                    const delivered = stat(r.id, "DELIVERED", "READ");
                    const read = stat(r.id, "READ");
                    const failed = stat(r.id, "FAILED");
                    return (
                      <tr key={r.id} className={rowClass}>
                        <Td className="tabular whitespace-nowrap">{fmtDate(r.startedAt)}</Td>
                        <Td><StatusBadge status={r.status} /></Td>
                        <Td numeric>{fmtNumber(r.total)}</Td>
                        <Td numeric className="whitespace-nowrap">
                          {fmtNumber(delivered)} <span className="text-xs text-muted">{pct(delivered, r.total)}%</span>
                        </Td>
                        <Td numeric className="whitespace-nowrap">
                          {fmtNumber(read)} <span className="text-xs text-muted">{pct(read, r.total)}%</span>
                        </Td>
                        <Td numeric className={failed ? "text-danger" : undefined}>{fmtNumber(failed)}</Td>
                        <Td numeric className="max-lg:hidden">{fmtNumber(chargedIn(r.id))}</Td>
                        <Td numeric className="whitespace-nowrap">
                          {salesOf(r.id) ? (
                            <>
                              {fmtNumber(Number(salesOf(r.id)!.orders))} <span className="text-xs text-muted">· {money(Number(salesOf(r.id)!.revenue))}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </Td>
                        <Td className="py-2 text-right">
                          {scope.canManage && running(r.status) ? (
                            <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run?">
                              Stop
                            </ActionButton>
                          ) : (
                            <Link href={`/dashboard/messages?campaign=${c.id}`} className="inline-flex min-h-8 items-center text-xs font-medium text-brand-deep hover:underline">
                              Log
                            </Link>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        ) : (
          <EmptyState title="This campaign hasn't sent yet." />
        )}
      </Card>

      <FailureSummary campaignId={c.id} runIds={runIds} canManage={scope.canManage} />
    </>
  );
}
