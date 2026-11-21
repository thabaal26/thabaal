import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ChartBar3D, Trophy3D } from "@/components/icons-3d";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PickClientNotice } from "@/components/ui";
import { BarList, ProgressRings } from "@/components/viz";
import { campaignResults, type CampaignResult } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { getScope } from "@/lib/session";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Compare campaigns" };
export const dynamic = "force-dynamic";

const PERIODS = [30, 90, 180] as const;
const METRICS = [
  { key: "read", label: "Read", color: "violet", of: (c: CampaignResult) => pct(c.read, c.delivered) },
  { key: "replied", label: "Replied", color: "blue", of: (c: CampaignResult) => pct(c.replied, c.delivered) },
  { key: "carted", label: "Sent a cart", color: "gold", of: (c: CampaignResult) => pct(c.carted, c.delivered) },
  { key: "bought", label: "Paid", color: "emerald", of: (c: CampaignResult) => pct(c.bought, c.delivered) },
] as const;

function href(days: number, a?: string, b?: string) {
  const q = new URLSearchParams();
  if (days !== 90) q.set("days", String(days));
  if (a) q.set("a", a);
  if (b) q.set("b", b);
  const s = q.toString();
  return `/dashboard/campaigns/compare${s ? `?${s}` : ""}`;
}

function Side({ c, other }: { c: CampaignResult; other?: CampaignResult }) {
  return (
    <Card className="card-3d">
      <CardHeader
        tone="brand"
        icon={<ChartBar3D />}
        title={c.name}
        description={`${c.template} · ${fmtNumber(c.runs)} send${c.runs === 1 ? "" : "s"}${c.lastAt ? ` · last ${fmtDate(c.lastAt, "d MMM")}` : ""}`}
        action={
          <Link href={`/dashboard/campaigns/${c.id}`} className="text-xs font-semibold text-brand-deep hover:underline">
            Open →
          </Link>
        }
      />
      <div className="p-3 sm:p-5">
        <ProgressRings
          label={`${c.name} results`}
          size={84}
          rings={METRICS.map((m) => {
            const v = m.of(c);
            const o = other ? m.of(other) : null;
            return { key: m.key, label: m.label, value: v, color: m.color, sub: o === null ? undefined : v === o ? "same" : v > o ? `+${v - o} pts` : `${v - o} pts` };
          })}
        />
      </div>
      <div className="grid grid-cols-3 border-t border-line text-center">
        <div className="p-2.5 sm:p-3">
          <p className="text-2xs uppercase tracking-wide text-muted">Messaged</p>
          <p className="tabular text-sm font-semibold text-ink sm:text-base">{fmtNumber(c.sent)}</p>
        </div>
        <div className="border-x border-line p-2.5 sm:p-3">
          <p className="text-2xs uppercase tracking-wide text-muted">Paid (7d)</p>
          <p className="tabular text-sm font-semibold text-ink sm:text-base">{formatValue(c.revenue, "inr")}</p>
        </div>
        <div className="p-2.5 sm:p-3">
          <p className="text-2xs uppercase tracking-wide text-muted">Per 100 sent</p>
          <p className="tabular text-sm font-semibold text-ink sm:text-base">{formatValue(c.sent ? (c.revenue / c.sent) * 100 : 0, "inr")}</p>
        </div>
      </div>
    </Card>
  );
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locked = await planGate();
  if (locked) return locked;
  const sp = await searchParams;
  const scope = await getScope();
  const header = (
    <PageHeader
      title="Compare campaigns"
      back={{ href: "/dashboard/campaigns", label: "Campaigns" }}
      description="What people did after each campaign: read, replied within 3 days, and sent a cart or paid within 7 days."
      tabs={
        <nav aria-label="Period" className="inline-flex rounded-control bg-sunken p-0.5 sm:p-1">
          {PERIODS.map((d) => (
            <Link
              key={d}
              href={href(d, typeof sp.a === "string" ? sp.a : undefined, typeof sp.b === "string" ? sp.b : undefined)}
              aria-current={Number(sp.days ?? 90) === d ? "page" : undefined}
              className={cn(
                "inline-flex min-h-8 items-center rounded-[calc(var(--radius-control)-3px)] px-2.5 text-xs font-medium transition sm:min-h-8 sm:px-3.5 sm:text-sm",
                Number(sp.days ?? 90) === d ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {d} days
            </Link>
          ))}
        </nav>
      }
    />
  );
  if (!scope.clientId)
    return (
      <>
        {header}
        <PickClientNotice what="campaign comparison" />
      </>
    );

  const days = PERIODS.includes(Number(sp.days) as (typeof PERIODS)[number]) ? Number(sp.days) : 90;
  const all = (await campaignResults(scope.clientId, days)).filter((c) => c.sent > 0);
  if (!all.length)
    return (
      <>
        {header}
        <Card className="card-3d">
          <EmptyState icon={<ChartBar3D />} title="No campaign sends in this period">
            Once campaigns go out, their results line up here side by side.
          </EmptyState>
        </Card>
      </>
    );

  const a = all.find((c) => c.id === sp.a) ?? all[0];
  const b = all.find((c) => c.id === sp.b && c.id !== a.id) ?? all.find((c) => c.id !== a.id);
  const sized = all.filter((c) => c.delivered >= 10);
  const best = [...(sized.length ? sized : all)].sort((x, y) => (y.sent ? y.revenue / y.sent : 0) - (x.sent ? x.revenue / x.sent : 0))[0];

  return (
    <>
      {header}

      {best && best.revenue > 0 && (
        <div className="mb-3.5 flex flex-wrap items-center gap-2 rounded-card border border-brand/25 bg-brand-soft/50 px-3.5 py-2.5 text-xs sm:mb-5 sm:px-4 sm:py-3 sm:text-sm">
          <Trophy3D className="size-4 shrink-0 sm:size-5" />
          <span>
            <b className="text-ink">{best.name}</b> earns the most per message: {formatValue((best.revenue / best.sent) * 100, "inr")} for every 100 people messaged.
          </span>
        </div>
      )}

      <StaggerGroup className={cn("grid grid-cols-1 gap-3.5 sm:gap-5", b && "xl:grid-cols-2")}>
        <StaggerItem>
          <Side c={a} other={b} />
        </StaggerItem>
        {b && (
          <StaggerItem>
            <Side c={b} other={a} />
          </StaggerItem>
        )}
      </StaggerGroup>

      <ScrollReveal>
        <Card className="card-3d mt-3.5 sm:mt-5">
        <CardHeader tone="info" icon={<ChartBar3D />} title="Every campaign" description={`Last ${days} days · rates are a share of messages delivered · pick two to compare`} />

        {/* Mobile compact list (zero horizontal swipe) */}
        <ul className="divide-y divide-line sm:hidden">
          {all.map((c) => {
            const picked = c.id === a.id || c.id === b?.id;
            return (
              <li key={c.id} className={cn("space-y-2 px-3.5 py-3", picked && "bg-subtle")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-xs font-semibold text-ink hover:underline">
                      {c.name}
                    </Link>
                    <p className="truncate text-2xs text-muted">
                      {c.template} · <span className="tabular">{fmtNumber(c.sent)}</span> sent · <b className="tabular font-semibold text-ink">{formatValue(c.revenue, "inr")}</b> paid
                    </p>
                  </div>
                  <div className="shrink-0">
                    {picked ? (
                      <Badge tone="brand">Shown</Badge>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-control border border-line bg-panel px-2 py-1 text-2xs font-semibold">
                        <Link href={href(days, c.id, b?.id)} className="text-brand-deep hover:underline">
                          Left
                        </Link>
                        <span aria-hidden className="text-line-strong">·</span>
                        <Link href={href(days, a.id, c.id)} className="text-brand-deep hover:underline">
                          Right
                        </Link>
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {METRICS.map((m) => {
                    const v = m.of(c);
                    return (
                      <div key={m.key} className="rounded-control border border-line/80 bg-panel px-2 py-1">
                        <div className="flex items-center justify-between gap-1 text-[10px] text-muted">
                          <span className="truncate">{m.label === "Sent a cart" ? "Cart" : m.label}</span>
                          <span className="tabular font-semibold text-ink">{v}%</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-sunken">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: m.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Desktop table */}
        <div className="thin-scroll hidden overflow-x-auto sm:block">
          <table className="ui-table w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 font-medium sm:px-5">Campaign</th>
                <th className="px-3 py-2.5 text-right font-medium">Messaged</th>
                {METRICS.map((m) => (
                  <th key={m.key} className="px-3 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="size-2 rounded-full" style={{ background: m.color }} />
                      {m.label}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Paid ₹</th>
                <th className="px-4 py-2.5 text-right font-medium sm:px-5">Compare</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => {
                const picked = c.id === a.id || c.id === b?.id;
                return (
                  <tr key={c.id} className={cn("border-b border-line last:border-0", picked && "bg-subtle")}>
                    <td className="max-w-56 px-4 py-2.5 sm:px-5">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate font-medium text-ink hover:underline">
                        {c.name}
                      </Link>
                      <span className="block truncate text-2xs text-muted">{c.template}</span>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">{fmtNumber(c.sent)}</td>
                    {METRICS.map((m) => {
                      const v = m.of(c);
                      return (
                        <td key={m.key} className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken">
                              <span className="block h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: m.color }} />
                            </span>
                            <span className="tabular w-9 text-xs text-ink-2">{v}%</span>
                          </span>
                        </td>
                      );
                    })}
                    <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{formatValue(c.revenue, "inr")}</td>
                    <td className="px-4 py-2.5 text-right sm:px-5">
                      {picked ? (
                        <Badge tone="brand">Shown</Badge>
                      ) : (
                        <span className="inline-flex gap-2 text-xs font-semibold">
                          <Link href={href(days, c.id, b?.id)} className="text-brand-deep hover:underline">
                            Left
                          </Link>
                          <Link href={href(days, a.id, c.id)} className="text-brand-deep hover:underline">
                            Right
                          </Link>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      </ScrollReveal>

      <ScrollReveal>
        <Card className="card-3d mt-3.5 sm:mt-5">
          <CardHeader tone="gold" icon={<Trophy3D />} title="Sales after each campaign" description="Paid within 7 days of the message" />
          <div className="p-3 sm:p-5">
            <BarList
              format="inr"
              color="emerald"
              items={[...all]
                .sort((x, y) => y.revenue - x.revenue)
                .slice(0, 10)
                .map((c) => ({ key: c.id, label: c.name, value: c.revenue, href: `/dashboard/campaigns/${c.id}`, sub: `${fmtNumber(c.bought)} paid of ${fmtNumber(c.sent)} messaged` }))}
            />
          </div>
        </Card>
      </ScrollReveal>
    </>
  );
}
