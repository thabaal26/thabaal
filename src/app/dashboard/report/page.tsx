import type { Metadata } from "next";
import Link from "next/link";
import { ChartBar3D, Trophy3D } from "@/components/icons-3d";
import { Card, CardHeader, PageHeader, PickClientNotice } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/viz";
import { campaignResults, weeklyReport, type WeekFigures } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { refillForecast } from "@/lib/refill-forecast";
import { getScope } from "@/lib/session";
import { ReportTools } from "./report-tools";

export const metadata: Metadata = { title: "Weekly report" };
export const dynamic = "force-dynamic";

function change(cur: number, prev: number) {
  if (!prev) return cur ? "new" : "—";
  const d = Math.round(((cur - prev) / prev) * 100);
  return d === 0 ? "same" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`;
}

const ROWS: { key: string; label: string; of: (w: WeekFigures) => number; fmt: "inr" | "count" | "percent" }[] = [
  { key: "revenue", label: "Paid sales", of: (w) => w.revenue, fmt: "inr" },
  { key: "orders", label: "Paid orders", of: (w) => w.orders, fmt: "count" },
  { key: "buyers", label: "Buyers", of: (w) => w.buyers, fmt: "count" },
  { key: "aov", label: "Average order", of: (w) => (w.orders ? w.revenue / w.orders : 0), fmt: "inr" },
  { key: "carts", label: "Carts received", of: (w) => w.carts, fmt: "count" },
  { key: "abandoned", label: "Carts left unpaid", of: (w) => w.abandoned, fmt: "count" },
  { key: "sent", label: "Messages sent", of: (w) => w.sent, fmt: "count" },
  { key: "readRate", label: "Read rate", of: (w) => pct(w.read, w.delivered), fmt: "percent" },
  { key: "replies", label: "Customers who replied", of: (w) => w.repliers, fmt: "count" },
  { key: "new", label: "New customers", of: (w) => w.newCustomers, fmt: "count" },
];

export default async function ReportPage() {
  const scope = await getScope();
  if (!scope.clientId)
    return (
      <>
        <PageHeader title="Weekly report" />
        <PickClientNotice what="weekly report" />
      </>
    );

  const now = new Date();
  const [r, campaigns, refills] = await Promise.all([weeklyReport(scope.clientId, now), campaignResults(scope.clientId, 7), refillForecast(scope.clientId, now)]);
  const range = `${fmtDate(r.from, "d MMM")} – ${fmtDate(new Date(r.to.getTime() - 1), "d MMM yyyy")}`;
  const topCampaign = [...campaigns].sort((a, b) => b.revenue - a.revenue || b.replied - a.replied)[0];
  const dueNext = refills.due.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7);
  const overdue = refills.due.filter((d) => d.daysLeft < 0);

  const todo = [
    overdue.length && `Remind ${fmtNumber(overdue.length)} overdue refill customer${overdue.length === 1 ? "" : "s"}`,
    dueNext.length && `${fmtNumber(dueNext.length)} refill${dueNext.length === 1 ? "" : "s"} due this week (~${formatValue(dueNext.reduce((n, d) => n + d.avgOrder, 0), "inr")})`,
    r.cur.abandoned && `Follow up ${fmtNumber(r.cur.abandoned)} unpaid cart${r.cur.abandoned === 1 ? "" : "s"}`,
    topCampaign && topCampaign.revenue > 0 && `Repeat “${topCampaign.name}”, it brought ${formatValue(topCampaign.revenue, "inr")}`,
  ].filter(Boolean) as string[];

  const summary = [
    `*Weekly report · ${range}*`,
    `Paid sales: ${formatValue(r.cur.revenue, "inr")} (${change(r.cur.revenue, r.prev.revenue)})`,
    `Orders: ${r.cur.orders} from ${r.cur.buyers} buyers · avg ${formatValue(r.cur.orders ? r.cur.revenue / r.cur.orders : 0, "inr")}`,
    `Messages: ${r.cur.sent} sent · ${pct(r.cur.read, r.cur.delivered)}% read · ${r.cur.repliers} replied`,
    r.topProducts[0] && `Top product: ${r.topProducts[0].name} (${r.topProducts[0].units} sold)`,
    todo.length && `\n*This week:*\n${todo.map((t) => `• ${t}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <PageHeader title="Weekly report" description={`Last 7 full days, ${range}, compared with the 7 days before.`} actions={<ReportTools text={summary} />} />

      <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-12">
        <Card className="card-3d xl:col-span-5">
          <CardHeader tone="brand" icon={<ChartBar3D />} title="The week in numbers" description="vs the week before" />
          <table className="w-full text-sm">
            <tbody>
              {ROWS.map((row) => {
                const c = row.of(r.cur);
                const p = row.of(r.prev);
                const ch = change(c, p);
                const up = ch.startsWith("▲");
                const goodWhenDown = row.key === "abandoned";
                return (
                  <tr key={row.key} className="border-t border-line">
                    <td className="px-4 py-2 text-ink-2 sm:px-5">{row.label}</td>
                    <td className="tabular px-3 py-2 text-right font-semibold text-ink">{formatValue(c, row.fmt)}</td>
                    <td
                      className={cn(
                        "tabular w-20 px-4 py-2 text-right text-xs font-semibold sm:px-5",
                        ch.startsWith("▲") || ch.startsWith("▼") ? (up !== goodWhenDown ? "text-success" : "text-danger") : "text-muted",
                      )}
                    >
                      {row.fmt === "percent" && p ? `${c - p >= 0 ? "+" : ""}${c - p} pts` : ch}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4 sm:space-y-5 xl:col-span-7">
          <Card className="card-3d">
            <CardHeader tone="gold" icon={<Trophy3D />} title="Paid sales per day" />
            <div className="p-4 sm:p-5">
              <ColumnChart
                format="inr"
                minWidth={320}
                height={130}
                label="Paid sales per day last week"
                columns={r.daily.map((d) => ({ key: d.key, label: d.label, parts: [{ key: "r", label: "Paid", value: d.revenue, color: "#059669" }] }))}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2">
            <Card className="card-3d">
              <CardHeader tone="brand" icon={<Trophy3D />} title="Top products" />
              <div className="p-4 sm:p-5">
                <BarList format="inr" empty="No paid orders last week." items={r.topProducts.map((p) => ({ key: p.name, label: p.name, value: p.revenue, sub: `${fmtNumber(p.units)} sold` }))} />
              </div>
            </Card>
            <Card className="card-3d">
              <CardHeader tone="violet" icon={<ChartBar3D />} title="To do this week" />
              {todo.length ? (
                <ul className="space-y-2 p-4 text-sm text-ink-2 sm:p-5">
                  {todo.map((t) => (
                    <li key={t} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                      {t}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="p-4 text-sm text-muted sm:p-5">Nothing urgent. Good week.</p>
              )}
              <div className="flex flex-wrap gap-3 border-t border-line px-4 py-3 text-xs font-semibold sm:px-5">
                <Link href="/dashboard/refills" className="text-brand-deep hover:underline">
                  Refills →
                </Link>
                <Link href="/dashboard/orders?show=unpaid" className="text-brand-deep hover:underline">
                  Unpaid carts →
                </Link>
                <Link href="/dashboard/campaigns/compare?days=30" className="text-brand-deep hover:underline">
                  Campaigns →
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
