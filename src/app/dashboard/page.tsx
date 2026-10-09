import { CalendarClock, CheckCheck, Clock, Eye, Send, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Callout, Card, CardHeader, EmptyState, Meter, PageHeader, rowClass, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
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
import { codesOf, PAUSING_KINDS } from "@/lib/meta-errors";
import { DailyChart } from "./daily-chart";
import { SpendCard } from "./spend-card";

export const dynamic = "force-dynamic";

/** Region share colours: brand, accent, then neutrals. */
const REGION_COLORS = ["bg-brand", "bg-glow", "bg-line-strong", "bg-line"];

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
  // A campaign paused because the token, app permissions or Meta account stopped every send.
  const paused = await db.message.findFirst({
    where: { ...myMessages, status: "QUEUED", OR: [{ errorCode: { in: codesOf(PAUSING_KINDS) } }, { errorCode: { gte: 200, lte: 299 } }] },
    orderBy: { createdAt: "desc" },
    select: { error: true, run: { select: { campaign: { select: { id: true, name: true } } } } },
  });
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

      {(schedulerQuiet || failedToday > 0 || blocked.length > 0 || paused) && (
        <div className="mb-4 space-y-3">
          {paused && (
            <Callout role="alert" tone="danger" icon={<TriangleAlert />} title="Campaigns are paused: WhatsApp can't send right now">
              {scope.isAdmin ? (
                <>
                  {paused.error}. Queued messages are kept and go out automatically once it&apos;s fixed
                  {paused.run && (
                    <>
                      {" "}(first seen on <Link href={`/dashboard/campaigns/${paused.run.campaign.id}`}>{paused.run.campaign.name}</Link>)
                    </>
                  )}
                  .
                </>
              ) : (
                <>There&apos;s a problem with the WhatsApp account setup. Queued messages are kept and go out once your admin fixes it.</>
              )}
            </Callout>
          )}
          {schedulerQuiet && (
            <Callout tone="warning" icon={<Clock />} title={`The scheduler hasn't run ${settings.lastDispatchAt ? `since ${fmtDate(settings.lastDispatchAt, "d MMM, h:mm a")}` : "yet"}.`}>
              Scheduled campaigns won&apos;t start until it does. Check the &quot;Campaign scheduler&quot; workflow in GitHub → Actions (it pauses after 60 days without commits).
            </Callout>
          )}
          {failedToday > 0 && (
            <Callout tone="danger" icon={<TriangleAlert />} title={`${fmtNumber(failedToday)} message${failedToday === 1 ? "" : "s"} failed in the last 24 hours.`}>
              <ul className="mt-0.5 list-disc pl-5">
                {failures.map((f) => <li key={f.error ?? "unknown"}>{f.error ?? "Unknown error"} ({f._count})</li>)}
              </ul>
              <Link href="/dashboard/messages?status=FAILED" className="mt-1 inline-flex min-h-11 items-center sm:min-h-0">See failed messages</Link>
            </Callout>
          )}
          {blocked.length > 0 && (
            <Callout role="alert" tone="danger" icon={<TriangleAlert />} title={`${blocked.length === 1 ? "A campaign can't send" : `${blocked.length} campaigns can't send`}: Meta stopped the template`}>
              <ul className="space-y-1">
                {blocked.map((c) => (
                  <li key={c.id}>
                    <Link href={`/dashboard/campaigns/${c.id}`}>{c.name}</Link>: template <span className="font-mono">{c.template.name}</span> is{" "}
                    {c.template.status === "PAUSED" ? "paused by Meta for low quality" : c.template.status === "DISABLED" ? "disabled by Meta" : "rejected"}
                    {c.template.statusReason ? ` (${c.template.statusReason.toLowerCase().replace(/_/g, " ")})` : ""}.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Edit the template so it&apos;s more useful to customers, or switch the campaign to another approved template.</p>
            </Callout>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Active customers" value={fmtNumber(customers)} sub={`${fmtNumber(optedOut)} opted out`} icon={<Users className="size-4" />} />
        <Stat label="Messages sent · 7 days" value={fmtNumber(total)} sub={`${fmtNumber(failed)} failed`} icon={<Send className="size-4" />} />
        <Stat label="Delivery rate" value={`${pct(delivered, total)}%`} sub={`${fmtNumber(delivered)} delivered`} icon={<CheckCheck className="size-4" />} />
        <Stat label="Read rate" value={`${pct(read, delivered)}%`} sub={`${fmtNumber(read)} of delivered were read`} icon={<Eye className="size-4" />} />
      </div>

      {/*
        Desktop: main column (sending, chart, results) beside a side column (health, upcoming, spend).
        Phones: the columns dissolve and `order` puts what's happening now first.
      */}
      <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6 lg:grid lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:flex-col lg:gap-6">
          {activeRuns.length > 0 && (
            <Card className="order-1">
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
                          <Link href={`/dashboard/campaigns/${r.campaignId}`} className="font-medium text-ink hover:underline">
                            {r.campaign.name}
                          </Link>
                          <StatusBadge status={r.status} />
                        </div>
                        <Meter className="mt-2" value={pct(done, r.total)} label={`${r.campaign.name} progress`} />
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

          <Card className="order-3">
            <CardHeader title="Messages per day" description="Last 14 days, by latest status" />
            <DailyChart rows={daily.map((d) => ({ day: d.day, status: d.status, n: Number(d.n) }))} since={since} />
          </Card>

          {byProduct.length > 0 && (
            <Card className="order-7">
              <CardHeader title="Campaign results by product" description="Last 30 days. Which customer groups read your messages and write back." />
              {/* Phones: one compact row per product instead of a sideways-scrolling table. */}
              <ul className="divide-y divide-line sm:hidden">
                {byProduct.map((r) => (
                  <li key={r.tag} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/dashboard/customers?tag=${encodeURIComponent(r.tag)}`} className="min-w-0 truncate text-sm font-medium text-ink">
                        {tagLabel(r.tag)}
                      </Link>
                      <span className="tabular shrink-0 text-xs text-muted">
                        {fmtNumber(r.sent)} sent{r.failed > 0 && <span className="text-danger"> · {r.failed} failed</span>}
                      </span>
                    </div>
                    <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-center">
                      {[
                        ["Delivered", `${pct(r.delivered, r.sent)}%`],
                        ["Read", `${pct(r.read, r.delivered)}%`],
                        ["Replies", fmtNumber(r.replies)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col-reverse rounded-control bg-sunken px-1 py-1.5">
                          <dt className="text-xs text-muted">{k}</dt>
                          <dd className="text-sm font-semibold">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              <div className="max-sm:hidden">
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th numeric>Sent</Th>
                      <Th numeric>Delivered</Th>
                      <Th numeric>Read</Th>
                      <Th numeric>Replies</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProduct.map((r) => (
                      <tr key={r.tag} className={rowClass}>
                        <Td className="font-medium">
                          <Link href={`/dashboard/customers?tag=${encodeURIComponent(r.tag)}`} className="hover:underline">
                            {tagLabel(r.tag)}
                          </Link>
                        </Td>
                        <Td numeric>
                          {fmtNumber(r.sent)}
                          {r.failed > 0 && <span className="ml-1 text-xs text-danger">({r.failed} failed)</span>}
                        </Td>
                        <Td numeric>{pct(r.delivered, r.sent)}%</Td>
                        <Td numeric>
                          <span className="inline-flex items-center gap-2">
                            <Meter className="hidden w-16 md:block" value={pct(r.read, r.delivered)} />
                            {pct(r.read, r.delivered)}%
                          </span>
                        </Td>
                        <Td numeric>
                          {r.replies ? (
                            <Link href="/dashboard/replies?show=all" className="font-medium text-brand-deep hover:underline">
                              {fmtNumber(r.replies)}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}

          {shown.length > 0 && (
            <Card className="order-8">
              <CardHeader title="What your customers buy" description="Customers per product or group. Each can be targeted with its own campaign." />
              <ul className="grid gap-x-8 gap-y-1 p-2 sm:grid-cols-2 sm:p-3">
                {shown.map((t) => (
                  <li key={t.tag}>
                    <Link href={`/dashboard/customers?tag=${encodeURIComponent(t.tag)}`} className="group block rounded-control px-2 py-2 transition hover:bg-canvas active:bg-sunken">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-ink group-hover:underline">{tagLabel(t.tag)}</span>
                        <span className="tabular text-xs text-muted">{fmtNumber(t.n)}</span>
                      </div>
                      <Meter className="mt-1.5" value={Math.max(4, pct(t.n, top))} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {byRegion.length > 1 && (
            <Card className="order-9">
              <CardHeader title="Customers by area" description="Where your customers are, from the order sheets. Tap any area to see its customers." />
              <div className="space-y-5 p-4 sm:p-5">
                <div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    {byRegion.map((r, i) => (
                      <div key={r.key} className={REGION_COLORS[i] ?? "bg-line"} style={{ width: `${pct(r.n, regionTotal)}%` }} />
                    ))}
                  </div>
                  <ul className="mt-2 grid grid-cols-1 gap-x-4 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:gap-x-2">
                    {byRegion.map((r, i) => (
                      <li key={r.key}>
                        <Link href={`/dashboard/customers?area=${encodeURIComponent(r.href)}`} className="group flex min-h-11 items-center gap-2 rounded-control px-1 text-sm transition hover:bg-canvas sm:min-h-9 sm:px-2">
                          <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${REGION_COLORS[i] ?? "bg-line"}`} />
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
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/50 bg-panel px-3 text-sm transition hover:border-brand hover:bg-brand-soft/50 active:bg-sunken sm:min-h-8"
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

          <Card className="order-4">
            <CardHeader
              title="Latest messages"
              action={
                <Link href="/dashboard/messages" className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-deep hover:underline sm:min-h-8">
                  Open log
                </Link>
              }
            />
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {m.customer.name} <span className="tabular font-normal text-muted">{formatPhone(m.customer.phone)}</span>
                      </p>
                      <p className="truncate text-xs text-muted">{m.body ?? m.templateName}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={m.status} />
                      <time className="tabular text-xs text-muted max-sm:hidden" dateTime={(m.sentAt ?? m.createdAt).toISOString()}>
                        {fmtDate(m.sentAt ?? m.createdAt, "d MMM, h:mm a")}
                      </time>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Send className="size-5" />} title="No messages yet">
                Sent messages will appear here with their delivery status.
              </EmptyState>
            )}
          </Card>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-6">
          <NumberHealth numbers={health} className="order-5" />

          <Card className="order-2">
            <CardHeader
              title="Coming up"
              action={
                <Link href="/dashboard/campaigns" className="-my-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-deep hover:underline sm:min-h-8">
                  All campaigns
                </Link>
              }
            />
            {upcoming.length ? (
              <ul className="divide-y divide-line">
                {upcoming.map((c) => (
                  <li key={c.id} className="relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas/70 active:bg-sunken sm:px-5">
                    <div className="grid w-12 shrink-0 place-items-center rounded-control bg-sunken py-1.5 text-center">
                      <span className="text-2xs font-medium uppercase text-muted">{fmtDate(c.nextRunAt, "EEE")}</span>
                      <span className="tabular text-sm font-semibold">{fmtDate(c.nextRunAt, "d")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-sm font-medium text-ink after:absolute after:inset-0">
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

          {scope.clientId && <SpendCard clientId={scope.clientId} canManage={scope.canManage} className="order-6" />}
        </div>
      </div>
    </>
  );
}
