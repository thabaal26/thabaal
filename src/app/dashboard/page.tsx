import { CalendarClock, CheckCheck, Eye, Send, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { db } from "@/lib/db";
import { APP_TZ, daysAgo, fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getSettings } from "@/lib/provider";
import { estimateDuration, formatMinutes } from "@/lib/schedule";
import { getScope, owned, ownedMessages } from "@/lib/session";
import { cancelRun, runDispatcherNow } from "./actions/campaigns";
import { BrandHero } from "./brand-hero";
import { NumberHealth } from "./number-health";
import { numberHealth } from "@/lib/limits";
import { DailyChart } from "./daily-chart";

export const dynamic = "force-dynamic";

const tagLabel = (tag: string) => (tag === "no-item-info" ? "No item recorded" : tag.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));

export default async function Overview() {
  const weekAgo = daysAgo(7);
  const since = daysAgo(13);
  const scope = await getScope();
  const mine = owned(scope);
  const myMessages = ownedMessages(scope);

  const monthAgo = daysAgo(30);
  const [client, segments, results, repliesByTag, health, blocked, areaRows] = await Promise.all([
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null,
    scope.clientId
      ? db.$queryRaw<{ tag: string; n: bigint }[]>`
          SELECT unnest(tags) AS tag, count(*) AS n FROM "Customer"
          WHERE "clientId" = ${scope.clientId} AND "optedOut" = false GROUP BY 1 ORDER BY 2 DESC, 1`
      : [],
    scope.clientId
      ? db.$queryRaw<{ tag: string; sent: bigint; delivered: bigint; read: bigint; failed: bigint }[]>`
          SELECT t.tag,
            count(*) AS sent,
            count(*) FILTER (WHERE m.status IN ('DELIVERED', 'READ')) AS delivered,
            count(*) FILTER (WHERE m.status = 'READ') AS read,
            count(*) FILTER (WHERE m.status = 'FAILED') AS failed
          FROM "Message" m JOIN "Customer" c ON c.id = m."customerId" CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
          WHERE c."clientId" = ${scope.clientId} AND m."createdAt" >= ${monthAgo} AND m.status NOT IN ('QUEUED', 'SKIPPED')
          GROUP BY 1 ORDER BY 2 DESC`
      : [],
    scope.clientId
      ? db.$queryRaw<{ tag: string; n: bigint }[]>`
          SELECT t.tag, count(*) AS n
          FROM "Reply" r JOIN "Customer" c ON c.id = r."customerId" CROSS JOIN LATERAL unnest(c.tags) AS t(tag)
          WHERE c."clientId" = ${scope.clientId} AND r."receivedAt" >= ${monthAgo} GROUP BY 1`
      : [],
    scope.clientId ? numberHealth(scope.clientId) : [],
    // Active campaigns whose template Meta paused, disabled or rejected can't send.
    db.campaign.findMany({
      where: { ...owned(scope), active: true, template: { status: { in: ["PAUSED", "DISABLED", "REJECTED"] } } },
      select: { id: true, name: true, template: { select: { name: true, status: true, statusReason: true } } },
    }),
    scope.clientId ? db.customer.groupBy({ by: ["region", "location"], where: { clientId: scope.clientId, optedOut: false }, _count: true }) : [],
  ]);
  const [customers, optedOut, week, activeRuns, upcoming, recent, daily, failures, settings] = await Promise.all([
    db.customer.count({ where: { ...mine, optedOut: false } }),
    db.customer.count({ where: { ...mine, optedOut: true } }),
    db.message.groupBy({ by: ["status"], where: { ...myMessages, createdAt: { gte: weekAgo }, status: { notIn: ["QUEUED", "SKIPPED"] } }, _count: true }),
    db.campaignRun.findMany({
      where: { campaign: mine, status: { in: ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"] } },
      include: { campaign: true },
      orderBy: { startedAt: "desc" },
    }),
    db.campaign.findMany({
      where: { ...mine, active: true, nextRunAt: { not: null } },
      include: { template: { select: { name: true, status: true } } },
      orderBy: { nextRunAt: "asc" },
      take: 5,
    }),
    db.message.findMany({
      where: { ...myMessages, status: { not: "QUEUED" } },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.$queryRaw<{ day: string; status: string; n: bigint }[]>`
      SELECT to_char((m."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${APP_TZ}, 'YYYY-MM-DD') AS day, m.status::text AS status, count(*) AS n
      FROM "Message" m JOIN "Customer" c ON c.id = m."customerId"
      WHERE m."createdAt" >= ${since} AND m.status NOT IN ('QUEUED', 'SKIPPED')
        AND (${scope.clientId}::text IS NULL OR c."clientId" = ${scope.clientId})
      GROUP BY 1, 2`,
    // Failures in the last day, grouped by reason, so problems show up without opening the log.
    db.message.groupBy({ by: ["error"], where: { ...myMessages, status: "FAILED", failedAt: { gte: daysAgo(1) } }, _count: true, orderBy: { _count: { error: "desc" } }, take: 3 }),
    getSettings(),
  ]);
  const failedToday = failures.reduce((n, f) => n + f._count, 0);
  // GitHub runs the scheduler every 5 minutes, sometimes late; 20 minutes of silence means it stopped.
  const schedulerQuiet = scope.isAdmin && (!settings.lastDispatchAt || settings.lastDispatchAt < daysAgo(20 / (24 * 60)));

  const count = (s: string) => week.find((w) => w.status === s)?._count ?? 0;
  const read = count("READ");
  const delivered = count("DELIVERED") + read;
  const failed = count("FAILED");
  const total = delivered + count("SENT") + failed;

  const runProgress = activeRuns.length
    ? await db.message.groupBy({ by: ["runId", "status"], where: { runId: { in: activeRuns.map((r) => r.id) } }, _count: true })
    : [];

  const adminActions = scope.isAdmin && (
    <>
      <ActionButton action={runDispatcherNow} size="md" title="Process due campaigns and batches now">
        <Send className="size-4" /> Run scheduler now
      </ActionButton>
      <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
        <CalendarClock className="size-4" /> New campaign
      </Link>
    </>
  );
  // Product and segment tags, largest first; the client-wide tag (e.g. thenan-oils) says nothing on its own.
  const clientTag = client?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const shown = segments.map((t) => ({ tag: t.tag, n: Number(t.n) })).filter((t) => t.tag !== clientTag || segments.length === 1).slice(0, 8);
  const top = shown[0]?.n ?? 0;
  // Location view: city vs outside, plus the busiest areas.
  const REGIONS = ["Madurai city", "Outside Madurai", "Not sure"];
  const byRegion = [...REGIONS.map((r) => ({ key: r, label: r, n: areaRows.filter((a) => a.region === r).reduce((t, a) => t + a._count, 0), href: `region:${r}` })),
    { key: "none", label: "No location noted", n: areaRows.filter((a) => !a.location).reduce((t, a) => t + a._count, 0), href: "none" }].filter((r) => r.n);
  const regionTotal = byRegion.reduce((t, r) => t + r.n, 0);
  const topAreas = areaRows.filter((a) => a.location).sort((a, b) => b._count - a._count).slice(0, 10);
  const byProduct = results
    .filter((r) => r.tag !== clientTag || results.length === 1)
    .map((r) => ({ tag: r.tag, sent: Number(r.sent), delivered: Number(r.delivered), read: Number(r.read), failed: Number(r.failed), replies: Number(repliesByTag.find((x) => x.tag === r.tag)?.n ?? 0) }));

  return (
    <>
      {client ? (
        <BrandHero client={client} customers={customers} actions={adminActions} />
      ) : (
        <PageHeader
          title="Overview"
          description={scope.isAdmin ? "All clients together, last 7 days. Pick a client in the sidebar to see one." : "How your WhatsApp campaigns performed over the last 7 days."}
          actions={adminActions}
        />
      )}

      {schedulerQuiet && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20">
          <b>The scheduler hasn&apos;t run {settings.lastDispatchAt ? `since ${fmtDate(settings.lastDispatchAt, "d MMM, h:mm a")}` : "yet"}.</b>{" "}
          Scheduled campaigns won&apos;t start until it does. Check the &quot;Campaign scheduler&quot; workflow in GitHub → Actions (it pauses after 60 days without commits).
        </div>
      )}
      {failedToday > 0 && (
        <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-rose-600/15">
          <b>{fmtNumber(failedToday)} message{failedToday === 1 ? "" : "s"} failed in the last 24 hours.</b>
          <ul className="mt-1 list-disc pl-5">
            {failures.map((f) => <li key={f.error ?? "unknown"}>{f.error ?? "Unknown error"} ({f._count})</li>)}
          </ul>
          <Link href="/dashboard/messages?status=FAILED" className="mt-1 inline-block font-medium underline">See failed messages</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Active customers" value={fmtNumber(customers)} sub={`${fmtNumber(optedOut)} opted out`} icon={<Users className="size-4" />} />
        <Stat
          label="Messages sent · 7 days"
          value={fmtNumber(total)}
          sub={`${fmtNumber(failed)} failed`}
          icon={<Send className="size-4" />}
          accent="bg-sky-50 text-sky-700"
        />
        <Stat label="Delivery rate" value={`${pct(delivered, total)}%`} sub={`${fmtNumber(delivered)} delivered`} icon={<CheckCheck className="size-4" />} />
        <Stat
          label="Read rate"
          value={`${pct(read, delivered)}%`}
          sub={`${fmtNumber(read)} of delivered were read`}
          icon={<Eye className="size-4" />}
          accent="bg-violet-50 text-violet-700"
        />
      </div>

      {blocked.length > 0 && (
        <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:p-5">
          <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="size-4" /> {blocked.length === 1 ? "A campaign can't send" : `${blocked.length} campaigns can't send`}: Meta stopped the template</p>
          <ul className="mt-2 space-y-1">
            {blocked.map((c) => (
              <li key={c.id}>
                <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium underline">{c.name}</Link>: template <span className="font-mono">{c.template.name}</span> is{" "}
                {c.template.status === "PAUSED" ? "paused by Meta for low quality" : c.template.status === "DISABLED" ? "disabled by Meta" : "rejected"}
                {c.template.statusReason ? ` (${c.template.statusReason.toLowerCase().replace(/_/g, " ")})` : ""}.
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-rose-800">Edit the template so it&apos;s more useful to customers, or switch the campaign to another approved template.</p>
        </div>
      )}

      <NumberHealth numbers={health} />

      {activeRuns.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Sending now" description="Campaigns delivering in batches. Batch size or interval changes apply from the next batch." />
          <ul className="divide-y divide-line">
            {activeRuns.map((r) => {
              const by = (s: string) => runProgress.find((p) => p.runId === r.id && p.status === s)?._count ?? 0;
              const queued = by("QUEUED");
              const done = r.total - queued;
              const eta = estimateDuration(queued, r.campaign.batchSize, r.campaign.intervalMinutes);
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/dashboard/campaigns/${r.campaignId}`} className="-my-2 py-2 font-medium hover:underline">
                        {r.campaign.name}
                      </Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct(done, r.total)}%` }} />
                    </div>
                    <p className="tabular mt-1.5 text-xs text-muted">
                      {fmtNumber(done)} of {fmtNumber(r.total)} processed · {by("FAILED")} failed ·{" "}
                      {queued
                        ? `${r.campaign.batchSize} every ${r.campaign.intervalMinutes} min, about ${formatMinutes(eta)} left · next batch ${fmtDate(r.nextBatchAt, "h:mm a")}`
                        : "finishing"}
                    </p>
                  </div>
                  {scope.isAdmin && (
                    <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run? Queued messages will not be sent.">
                      Stop
                    </ActionButton>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {shown.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="What your customers buy" description="Customers per product or group. Each can be targeted with its own campaign." />
          <ul className="grid gap-x-8 gap-y-3 p-4 sm:grid-cols-2 sm:p-5">
            {shown.map((t) => (
              <li key={t.tag}>
                <Link href={`/dashboard/customers?tag=${encodeURIComponent(t.tag)}`} className="group block">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium group-hover:underline">{tagLabel(t.tag)}</span>
                    <span className="tabular text-xs text-muted">{fmtNumber(t.n)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, pct(t.n, top))}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {byRegion.length > 1 && (
        <Card className="mt-6">
          <CardHeader title="Customers by area" description="Where your customers are, from the order sheets. Tap any area to see its customers." />
          <div className="space-y-5 p-4 sm:p-5">
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
                {byRegion.map((r, i) => (
                  <div key={r.key} className={["bg-brand", "bg-glow", "bg-zinc-400", "bg-line"][i] ?? "bg-line"} style={{ width: `${pct(r.n, regionTotal)}%` }} />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:gap-x-6">
                {byRegion.map((r, i) => (
                  <li key={r.key}>
                    <Link href={`/dashboard/customers?area=${encodeURIComponent(r.href)}`} className="group flex items-center gap-2 text-sm">
                      <span className={`size-2.5 shrink-0 rounded-full ${["bg-brand", "bg-glow", "bg-zinc-400", "bg-line"][i] ?? "bg-line"}`} />
                      <span className="group-hover:underline">{r.label}</span>
                      <span className="tabular text-xs text-muted">{fmtNumber(r.n)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {topAreas.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted">Top areas</p>
                <div className="flex flex-wrap gap-2">
                  {topAreas.map((a) => (
                    <Link
                      key={a.location}
                      href={`/dashboard/customers?area=${encodeURIComponent(`loc:${a.location}`)}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm transition hover:border-brand/40 hover:bg-brand-soft/40"
                    >
                      {a.location} <span className="tabular text-xs text-muted">{a._count}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {byProduct.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Campaign results by product" description="Last 30 days. Which customer groups read your messages and write back." />
          {/* Phones: one compact card per product instead of a sideways-scrolling table. */}
          <ul className="divide-y divide-line sm:hidden">
            {byProduct.map((r) => (
              <li key={r.tag} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Link href={`/dashboard/customers?tag=${encodeURIComponent(r.tag)}`} className="truncate text-sm font-medium">{tagLabel(r.tag)}</Link>
                  <span className="tabular shrink-0 text-xs text-muted">{fmtNumber(r.sent)} sent{r.failed > 0 && <span className="text-rose-600"> · {r.failed} failed</span>}</span>
                </div>
                <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Delivered", `${pct(r.delivered, r.sent)}%`],
                    ["Read", `${pct(r.read, r.delivered)}%`],
                    ["Replies", fmtNumber(r.replies)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-canvas px-1 py-1.5">
                      <dd className="text-sm font-semibold">{v}</dd>
                      <dt className="text-[11px] text-muted">{k}</dt>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Product</th>
                  <th className="px-5 py-2.5 text-right font-medium">Sent</th>
                  <th className="px-5 py-2.5 text-right font-medium">Delivered</th>
                  <th className="px-5 py-2.5 text-right font-medium">Read</th>
                  <th className="px-5 py-2.5 text-right font-medium">Replies</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {byProduct.map((r) => (
                  <tr key={r.tag} className="hover:bg-canvas/60">
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/dashboard/customers?tag=${encodeURIComponent(r.tag)}`} className="hover:underline">{tagLabel(r.tag)}</Link>
                    </td>
                    <td className="px-5 py-3 text-right">{fmtNumber(r.sent)}{r.failed > 0 && <span className="ml-1 text-xs text-rose-600">({r.failed} failed)</span>}</td>
                    <td className="px-5 py-3 text-right">{pct(r.delivered, r.sent)}%</td>
                    <td className="px-5 py-3 text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-canvas sm:block"><span className="block h-full rounded-full bg-brand" style={{ width: `${pct(r.read, r.delivered)}%` }} /></span>
                        {pct(r.read, r.delivered)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">{r.replies ? <Link href="/dashboard/replies?show=all" className="font-medium text-brand-deep hover:underline">{fmtNumber(r.replies)}</Link> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Messages per day" description="Last 14 days, by latest status" />
          <DailyChart rows={daily.map((d) => ({ day: d.day, status: d.status, n: Number(d.n) }))} since={since} />
        </Card>

        <Card>
          <CardHeader
            title="Coming up"
            action={
              <Link href="/dashboard/campaigns" className="-my-2 py-2 text-sm font-medium text-brand-deep hover:underline sm:text-xs">
                All campaigns
              </Link>
            }
          />
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((c) => (
                <li key={c.id} className="relative flex items-center gap-3 px-4 py-3.5 active:bg-canvas sm:px-5">
                  <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-canvas py-1.5 text-center">
                    <span className="text-[10px] font-medium uppercase text-muted">{fmtDate(c.nextRunAt, "EEE")}</span>
                    <span className="tabular text-sm font-semibold">{fmtDate(c.nextRunAt, "d")}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-sm font-medium after:absolute after:inset-0 hover:underline">
                      {c.name}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {fmtDate(c.nextRunAt, "h:mm a")} · {c.template.name}
                    </p>
                  </div>
                  {c.template.status !== "APPROVED" && <Badge tone="amber">Template not approved</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarClock className="size-5" />} title="Nothing scheduled">
              {scope.isAdmin ? "Create a weekly campaign to start sending automatically." : "Upcoming campaigns will show here."}
            </EmptyState>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Latest messages"
          action={
            <Link href="/dashboard/messages" className="-my-2 py-2 text-sm font-medium text-brand-deep hover:underline sm:text-xs">
              Open log
            </Link>
          }
        />
        {recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.customer.name} <span className="font-normal text-muted">{formatPhone(m.customer.phone)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">{m.body ?? m.templateName}</p>
                </div>
                {m.status === "FAILED" && <TriangleAlert className="size-4 text-rose-500" />}
                <StatusBadge status={m.status} />
                <span className="hidden w-32 text-right text-xs text-muted sm:block">{fmtDate(m.sentAt ?? m.createdAt, "d MMM, h:mm a")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Send className="size-5" />} title="No messages yet">
            Sent messages will appear here with their delivery status.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
