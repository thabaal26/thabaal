import { ArrowLeft, FlaskConical, Pause, Play, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money } from "@/lib/orders";
import { APP_TZ, fmtDate, fmtNumber, pct } from "@/lib/format";
import { formatInTimeZone } from "date-fns-tz";
import { DAYS, effectiveInterval, TEST_TAG } from "@/lib/schedule";
import { getScope, owned } from "@/lib/session";
import { cancelRun, deleteCampaign, runCampaignNow, sendCampaignTest, toggleCampaign } from "../../actions/campaigns";
import { CampaignForm } from "../campaign-form";
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
  const audienceSize = c.audienceTag ? (picked?.n ?? 0) : audience.all;
  const audienceName = picked?.label ?? c.audienceTag;
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

  return (
    <>
      <Link href="/dashboard/campaigns" className="-my-2 mb-1 inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-ink sm:mb-3 sm:text-xs">
        <ArrowLeft className="size-3.5" /> Campaigns
      </Link>
      <PageHeader
        title={c.name}
        description={c.active && c.nextRunAt ? `Next send ${fmtDate(c.nextRunAt, "EEEE d MMM, h:mm a")}` : "Paused: nothing scheduled"}
        actions={
          scope.isAdmin && <>
            <ActionButton action={sendCampaignTest.bind(null, c.id)} size="md" title={`Send one copy to your own numbers (customers tagged "${TEST_TAG}")`}>
              <FlaskConical className="size-4" /> Send test to me
            </ActionButton>
            <ActionButton action={runCampaignNow.bind(null, c.id)} size="md" confirm={sendConfirm}>
              <Send className="size-4" /> Send now
            </ActionButton>
            <ActionButton action={toggleCampaign.bind(null, c.id, !c.active)} size="md">
              {c.active ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Resume</>}
            </ActionButton>
            <ActionButton action={deleteCampaign.bind(null, c.id)} variant="danger" size="md" confirm="Delete this campaign? Messages already sent stay in the log.">
              Delete
            </ActionButton>
          </>
        }
      />

      {!scope.isAdmin ? (
        <Card>
          <CardHeader title="Campaign details" />
          <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
                {c.scheduleType === "WEEKLY" ? `Every ${c.daysOfWeek.map((d) => DAYS[d]).join(", ")}` : `Once on ${fmtDate(c.runAt, "d MMM yyyy")}`} at {c.sendTime}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Pace</dt>
              <dd className="mt-1">{c.batchSize} messages every {effectiveInterval(c.intervalMinutes)} min</dd>
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

      <Card className="mt-6">
        <CardHeader title="Send history" description={`The last 20 runs of this campaign.${totalOrders ? ` Brought ${fmtNumber(totalOrders)} order${totalOrders === 1 ? "" : "s"} worth ${money(totalRevenue)} within 7 days of sending.` : ""}`} />
        {c.runs.length ? (
          <>
          <ul className="divide-y divide-line sm:hidden">
            {c.runs.map((r) => {
              const delivered = stat(r.id, "DELIVERED", "READ");
              const read = stat(r.id, "READ");
              const failed = stat(r.id, "FAILED");
              const running = ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"].includes(r.status);
              return (
                <li key={r.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{fmtDate(r.startedAt, "EEE d MMM, h:mm a")}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <dl className="tabular mt-2 grid grid-cols-4 gap-2 text-center">
                    {[
                      ["Sent to", fmtNumber(r.total)],
                      ["Delivered", `${pct(delivered, r.total)}%`],
                      ["Read", `${pct(read, r.total)}%`],
                      ["Failed", fmtNumber(failed)],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-canvas px-1 py-1.5">
                        <dd className={`text-sm font-semibold ${k === "Failed" && failed ? "text-rose-600" : ""}`}>{v}</dd>
                        <dt className="text-[10px] text-muted">{k}</dt>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex justify-end">
                    {running && scope.isAdmin ? (
                      <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run?">Stop sending</ActionButton>
                    ) : (
                      <Link href={`/dashboard/messages?campaign=${c.id}`} className="py-2 text-sm font-medium text-brand-deep">View messages →</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2.5 font-medium">Started</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 text-right font-medium">Customers</th>
                  <th className="px-5 py-2.5 text-right font-medium">Delivered</th>
                  <th className="px-5 py-2.5 text-right font-medium">Read</th>
                  <th className="px-5 py-2.5 text-right font-medium">Failed</th>
                  <th className="px-5 py-2.5 text-right font-medium" title="Messages Meta billed (marketing rate)">Charged</th>
                  <th className="px-5 py-2.5 text-right font-medium" title="Orders placed within 7 days of receiving this run's message">Sales (7 days)</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {c.runs.map((r) => {
                  const delivered = stat(r.id, "DELIVERED", "READ");
                  const read = stat(r.id, "READ");
                  return (
                    <tr key={r.id}>
                      <td className="px-5 py-3">{fmtDate(r.startedAt)}</td>
                      <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-3 text-right">{fmtNumber(r.total)}</td>
                      <td className="px-5 py-3 text-right">{fmtNumber(delivered)} <span className="text-xs text-muted">{pct(delivered, r.total)}%</span></td>
                      <td className="px-5 py-3 text-right">{fmtNumber(read)} <span className="text-xs text-muted">{pct(read, r.total)}%</span></td>
                      <td className="px-5 py-3 text-right text-rose-600">{fmtNumber(stat(r.id, "FAILED"))}</td>
                      <td className="px-5 py-3 text-right">{fmtNumber(chargedIn(r.id))}</td>
                      <td className="px-5 py-3 text-right">
                        {salesOf(r.id) ? <>{fmtNumber(Number(salesOf(r.id)!.orders))} <span className="text-xs text-muted">· {money(Number(salesOf(r.id)!.revenue))}</span></> : "—"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {scope.isAdmin && ["RUNNING", "WAITING_TEMPLATE", "WAITING_CONNECTION", "WAITING_LIMIT", "WAITING_QUALITY", "WAITING_QUIET"].includes(r.status) ? (
                          <ActionButton action={cancelRun.bind(null, r.id)} variant="danger" confirm="Stop this run?">Stop</ActionButton>
                        ) : (
                          <Link href={`/dashboard/messages?campaign=${c.id}`} className="text-xs font-medium text-brand-deep hover:underline">Log</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="px-5 py-6 text-sm text-muted">This campaign hasn&apos;t sent yet.</p>
        )}
      </Card>
    </>
  );
}
