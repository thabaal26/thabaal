import { Activity, ArrowDownRight, ArrowUpRight, CheckCheck, Clock3, Eye, Gauge, MessageCircle, PieChart, Send, ShoppingBag, ShieldAlert, TrendingUp, Trophy, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CountUp, Ring3D, Sparkline, TrendChart, type Series } from "@/components/charts";
import { formatValue, type ValueFormat } from "@/lib/chart-math";
import { Card, CardHeader, QualityBadge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import type { numberHealth } from "@/lib/limits";

/** Chart colours (SVG attributes can't read CSS variables): the design tokens' values. */
export const C = {
  brand: "#167d63",
  read: "#6941c6",
  gold: "#d4a514",
  info: "#1d64a8",
  failed: "#c93636",
  pending: "#d0d5dd",
  glow: "#eabf26",
};

/* ───────────────────────── Period switch ───────────────────────── */

export const RANGES = { today: { days: 1, label: "Today", prev: "yesterday" }, "7d": { days: 7, label: "7 days", prev: "the 7 days before" }, "30d": { days: 30, label: "30 days", prev: "the 30 days before" } } as const;
export type Range = keyof typeof RANGES;

/** Today / 7 days / 30 days, kept in the URL so the view can be shared and reloaded. */
export function RangeTabs({ range }: { range: Range }) {
  return (
    <nav aria-label="Period" className="inline-flex rounded-control bg-sunken p-1">
      {(Object.keys(RANGES) as Range[]).map((r) => (
        <Link
          key={r}
          href={r === "7d" ? "/dashboard" : `/dashboard?range=${r}`}
          scroll={false}
          aria-current={r === range ? "page" : undefined}
          className={cn(
            "inline-flex min-h-10 items-center rounded-[calc(var(--radius-control)-3px)] px-3.5 text-sm font-medium transition sm:min-h-8",
            r === range ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {RANGES[r].label}
        </Link>
      ))}
    </nav>
  );
}

/* ───────────────────────── KPI tile ───────────────────────── */

export type Delta = { cur: number; prev: number; kind: "pct" | "pts"; goodWhenUp?: boolean } | null;

/** "▲ 12% vs yesterday": only from real history; nothing when there's nothing to compare with. */
function DeltaBadge({ d, vs }: { d: Delta; vs: string }) {
  if (!d) return null;
  const diff = d.kind === "pts" ? d.cur - d.prev : d.prev ? ((d.cur - d.prev) / d.prev) * 100 : null;
  if (diff === null) return d.cur > 0 ? <span className="text-xs text-muted">New this period</span> : null;
  const r = Math.round(diff * 10) / 10;
  if (r === 0) return <span className="text-xs text-muted">Same as {vs}</span>;
  const up = r > 0;
  const good = up === (d.goodWhenUp ?? true);
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-semibold", good ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
        <Icon aria-hidden className="size-3" />
        {Math.abs(r)}
        {d.kind === "pts" ? " pts" : "%"}
      </span>
      <span className="text-muted">vs {vs}</span>
    </span>
  );
}

export function KpiTile({
  label,
  value,
  format,
  sub,
  icon: Icon,
  color,
  spark,
  delta,
  vs,
  href,
}: {
  label: string;
  value: number;
  format: ValueFormat;
  sub: ReactNode;
  icon: LucideIcon;
  color: string;
  spark: number[];
  delta: Delta;
  vs: string;
  href?: string;
}) {
  const body = (
    <>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: color }} />
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3.5 sm:px-5 sm:pt-5">
        <p className="min-w-0 text-[0.6875rem] font-semibold uppercase leading-tight tracking-wide sm:text-[0.8125rem]" style={{ color }}>
          {label}
        </p>
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-[10px] text-white ring-1 ring-inset ring-white/25 sm:size-9"
          style={{ background: `linear-gradient(145deg, rgb(255 255 255 / 0.38), rgb(255 255 255 / 0) 60%), ${color}`, boxShadow: `0 5px 12px -4px ${color}99` }}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="px-3.5 sm:px-5">
        <p className="mt-2 text-xl font-semibold leading-tight tracking-tight text-ink sm:text-[1.75rem]">
          <CountUp value={value} format={format} />
        </p>
        <p className="mt-1 truncate text-xs text-muted">{sub}</p>
      </div>
      <Sparkline values={spark} color={color} className="mt-2 h-9 sm:h-12" />
      <div className="mt-auto border-t border-line px-3.5 py-2.5 sm:px-5">
        <DeltaBadge d={delta} vs={vs} />
        {!delta && <span className="text-xs text-muted">No earlier period to compare</span>}
      </div>
    </>
  );
  // A faint wash of the tile's own colour from the top, over the raised 3D surface.
  const surface = { background: `linear-gradient(180deg, ${color}14 0%, #ffffff 46%, #fbfcfe 100%)` };
  return href ? (
    <Link href={href} className="card-3d relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border" style={surface}>
      {body}
    </Link>
  ) : (
    <Card className="card-3d relative flex h-full flex-col overflow-hidden" style={surface}>
      {body}
    </Card>
  );
}

/* ───────────────────────── Activity chart ───────────────────────── */

export function ActivityCard({ labels, tooltipLabels, series, every, title, description }: { labels: string[]; tooltipLabels: string[]; series: Series[]; every: number; title: string; description: string }) {
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="brand"
        icon={<Activity />}
        title={title}
        description={description}
        action={
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        }
      />
      <div className="px-2 pb-3 pt-4 sm:px-4">
        <TrendChart labels={labels} tooltipLabels={tooltipLabels} series={series} every={every} height={330} />
      </div>
      {/* The same figures for screen readers. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tooltipLabels.map((l, i) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              {series.map((s) => (
                <td key={s.key}>{s.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ───────────────────────── Delivery ring ───────────────────────── */

/** Where this period's messages ended up: each counted once, under its latest status. */
export function DeliveryCard({ read, delivered, sent, failed }: { read: number; delivered: number; sent: number; failed: number }) {
  const total = read + delivered + sent + failed;
  const reached = read + delivered;
  const segs = [
    { key: "read", label: "Read", value: read, color: C.read },
    { key: "delivered", label: "Delivered, unread", value: delivered, color: C.brand },
    { key: "sent", label: "Not delivered yet", value: sent, color: C.pending },
    { key: "failed", label: "Failed", value: failed, color: C.failed },
  ];
  return (
    <Card className="card-3d h-full">
      <CardHeader tone="violet" icon={<PieChart />} title="Delivery health" description="Where this period's messages ended up" />
      <div className="flex flex-col gap-5 p-5">
        <div>
          <p className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">
            <CountUp value={pct(reached, total)} format="percent" />
          </p>
          <p className="text-sm text-muted">
            of {fmtNumber(total)} messages reached the customer
          </p>
        </div>
        <Ring3D segments={segs} label={`${pct(reached, total)}% of ${total} messages delivered`} />
        <ul className="grid grid-cols-1 gap-x-5 gap-y-2.5 min-[420px]:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {segs.map((s) => (
            <li key={s.key} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 text-ink-2">{s.label}</span>
              <span className="tabular font-medium text-ink">{fmtNumber(s.value)}</span>
              <span className="tabular w-11 text-right text-xs text-muted">{pct(s.value, total)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/* ───────────────────────── Message → order funnel ───────────────────────── */

const FUNNEL: { key: "messaged" | "delivered" | "read" | "replied" | "ordered"; label: string; icon: LucideIcon; color: string }[] = [
  { key: "messaged", label: "Messaged", icon: Send, color: C.brand },
  { key: "delivered", label: "Received it", icon: CheckCheck, color: C.brand },
  { key: "read", label: "Read it", icon: Eye, color: C.read },
  { key: "replied", label: "Replied", icon: MessageCircle, color: C.info },
  { key: "ordered", label: "Ordered within 7 days", icon: ShoppingBag, color: C.gold },
];

/** People, not messages: each step is a share of everyone messaged in the period. */
export function FunnelCard({ f, revenue }: { f: Record<(typeof FUNNEL)[number]["key"], number>; revenue: number }) {
  const base = f.messaged;
  return (
    <Card className="card-3d h-full">
      <CardHeader tone="gold" icon={<TrendingUp />} title="From message to order" description="Customers messaged this period, and how far they went" />
      {base ? (
        <ul className="space-y-1 p-3 sm:p-4">
          {FUNNEL.map((s) => {
            const share = pct(f[s.key], base);
            return (
              <li key={s.key} className="flex items-center gap-3 rounded-control px-2 py-2">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-full text-white ring-1 ring-inset ring-white/25"
                  style={{ background: `linear-gradient(145deg, rgb(255 255 255 / 0.38), rgb(255 255 255 / 0) 60%), ${s.color}`, boxShadow: `0 4px 10px -3px ${s.color}88` }}
                >
                  <s.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate font-medium text-ink">{s.label}</span>
                    <span className="tabular shrink-0 text-ink-2">
                      <b className="font-semibold text-ink">{fmtNumber(f[s.key])}</b> <span className="text-xs text-muted">· {share}%</span>
                    </span>
                  </div>
                  <div className="track-3d mt-1.5 h-2 overflow-hidden rounded-full" role="meter" aria-label={`${s.label}: ${share}%`} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}>
                    <div className="bar bar-3d h-full rounded-full" style={{ width: `${Math.max(share, f[s.key] ? 2 : 0)}%`, backgroundColor: s.color }} />
                  </div>
                </div>
              </li>
            );
          })}
          <li className="mx-2 mt-2 flex items-center justify-between rounded-control bg-gold-soft px-3 py-2.5 text-sm">
            <span className="text-gold-deep">Sales from those orders</span>
            <span className="tabular font-semibold text-gold-deep">{formatValue(revenue, "inr")}</span>
          </li>
        </ul>
      ) : (
        <p className="p-5 text-sm text-muted">Nobody was messaged in this period yet.</p>
      )}
    </Card>
  );
}

/* ───────────────────────── Today, live ───────────────────────── */

/** The dark brand card: today's message activity by hour, and what's sending right now. */
export function TodayCard({
  hours,
  sent,
  replies,
  sending,
  next,
}: {
  hours: { label: string; tip: string; sent: number; replies: number }[];
  sent: number;
  replies: number;
  sending: { name: string; done: number; total: number }[];
  next: { name: string; at: Date } | null;
}) {
  return (
    <section
      aria-labelledby="today-title"
      className="surface-dark relative flex h-full flex-col overflow-hidden rounded-card bg-night text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_2px_4px_rgb(16_24_40/0.12),0_22px_40px_-16px_rgb(16_24_40/0.55)]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,rgb(22_125_99/0.55),transparent_60%),radial-gradient(80%_60%_at_0%_100%,rgb(234_191_38/0.16),transparent_70%)]" />
      <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/60">
            {sending.length > 0 && (
              <span aria-hidden className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-call-answer opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-call-answer" />
              </span>
            )}
            <span id="today-title">Today{sending.length ? " · sending now" : ""}</span>
          </p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight">
            <CountUp value={sent} /> <span className="text-sm font-normal text-white/60">messages</span>
          </p>
          <p className="text-xs text-white/60">{fmtNumber(replies)} replies from customers</p>
        </div>
      </div>
      <div className="relative mt-2 min-h-0 flex-1 px-2">
        <TrendChart
          dark
          labels={hours.map((h) => h.label)}
          tooltipLabels={hours.map((h) => h.tip)}
          series={[
            { key: "sent", label: "Messages", color: C.glow, values: hours.map((h) => h.sent) },
            { key: "replies", label: "Replies", color: "#5fd4b0", values: hours.map((h) => h.replies), area: false },
          ]}
          every={Math.max(1, Math.ceil(hours.length / 6))}
          height={230}
        />
      </div>
      <div className="relative space-y-2 border-t border-white/10 px-5 py-3.5 text-sm">
        {sending.map((s) => (
          <div key={s.name}>
            <div className="flex justify-between gap-2 text-xs">
              <span className="truncate text-white/85">{s.name}</span>
              <span className="tabular text-white/60">
                {fmtNumber(s.done)} / {fmtNumber(s.total)}
              </span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="bar h-full rounded-full bg-glow" style={{ width: `${pct(s.done, s.total)}%` }} />
            </div>
          </div>
        ))}
        {!sending.length && (
          <p className="text-xs text-white/60">
            {next ? (
              <>
                Next send: <span className="text-white/85">{next.name}</span> · {fmtDate(next.at, "EEE d MMM, h:mm a")}
              </>
            ) : (
              "No campaign sending or scheduled."
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/* ───────────────────────── Number limits ───────────────────────── */

type Health = Awaited<ReturnType<typeof numberHealth>>;

/** A usage ring with the figures beside it: used of limit, how many more today, and the safety reserve. */
function LimitRing({ used, limit, left, label }: { used: number; limit: number | null; left: number | null; label: string }) {
  const full = left === 0;
  // The portal stops a little under Meta's limit so retries never tip a number over it.
  const reserve = limit !== null && left !== null ? Math.max(0, limit - used - left) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <Ring3D
          width={104}
          depth={10}
          thickness={26}
          segments={[
            { key: "used", label: "Used", value: Math.max(used, 0), color: full ? C.failed : C.brand },
            { key: "free", label: "Free", value: limit === null ? 0 : Math.max(limit - used, 0), color: "#dfe4ea" },
          ]}
          label={limit === null ? `${label}: no limit` : `${label}: ${used} of ${limit} people messaged`}
        />
      </div>
      <div className="min-w-0 text-sm">
        <p className="tabular text-ink">
          <b className="font-semibold">{fmtNumber(used)}</b> of {limit === null ? "unlimited" : fmtNumber(limit)} people
        </p>
        <p className="tabular text-xs text-ink-2">
          {left === null ? "No daily limit" : full ? <b className="text-warning">Limit reached, sends resume as the 24 hours roll on</b> : `${fmtNumber(left)} more can be messaged now`}
        </p>
        {reserve > 0 && !full && <p className="tabular text-xs text-muted">{fmtNumber(reserve)} kept spare so retries never go over</p>}
      </div>
    </div>
  );
}

/**
 * Meta caps how many different people a business may message in 24 hours. The cap and the quality
 * rating come from Meta (refreshed by the scheduler); usage is counted from what this portal sent.
 * Numbers without their own warm-up cap share one business-wide limit, so it's shown once.
 */
export function NumberLimitsCard({ numbers }: { numbers: Health }) {
  if (!numbers.length) return null;
  const shared = numbers.filter((n) => n.dailyCap == null);
  const head = shared[0];
  const checked = numbers.map((n) => n.statusCheckedAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0];
  return (
    <Card className="card-3d flex h-full flex-col">
      <CardHeader tone="info" icon={<Gauge />} title="Daily sending limit" description="Different people messaged in the last 24 hours" />
      {head && (
        <div className="border-b border-line px-4 py-4 sm:px-5">
          <LimitRing used={head.used} limit={head.limit} left={head.left} label="Business limit" />
          {shared.length > 1 && <p className="mt-2 text-xs text-muted">Shared by your {shared.length} numbers: Meta counts the whole business.</p>}
        </div>
      )}
      <ul className="divide-y divide-line">
        {numbers.map((n) => (
          <li key={n.id} className="space-y-2 px-4 py-3 sm:px-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{n.label}</p>
                <p className="tabular truncate text-xs text-muted">{n.displayPhone}</p>
              </div>
              <QualityBadge rating={n.qualityRating} />
            </div>
            {n.qualityRating === "RED" && (
              <p className="inline-flex items-center gap-1 text-xs text-danger">
                <ShieldAlert aria-hidden className="size-3.5" /> Campaigns paused to protect this number
              </p>
            )}
            {n.dailyCap != null && <LimitRing used={n.used} limit={n.limit} left={n.left} label={`${n.label} warm-up cap`} />}
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-line px-4 py-2.5 text-xs text-muted sm:px-5">
        Limit and quality from Meta{checked ? `, checked ${fmtDate(checked, "d MMM, h:mm a")}` : ""}. Usage counts messages sent from this portal.
      </p>
    </Card>
  );
}

/* ───────────────────────── Best time heatmap ───────────────────────── */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BLOCKS = ["12–3 am", "3–6 am", "6–9 am", "9–12 pm", "12–3 pm", "3–6 pm", "6–9 pm", "9–12 am"];

/** Customer replies by weekday and 3-hour block: when people actually read and answer. */
export function BestTimeCard({ cells, days }: { cells: { d: number; b: number; n: number }[]; days: number }) {
  const n = (d: number, b: number) => cells.find((c) => c.d === d && c.b === b)?.n ?? 0;
  const max = Math.max(0, ...cells.map((c) => c.n));
  const best = cells.length ? cells.reduce((a, c) => (c.n > a.n ? c : a)) : null;
  // Monday first, the way the week is planned.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="brand"
        icon={<Clock3 />}
        title="Best time to reach customers"
        description={`When customers wrote back, last ${days} days`}
        action={
          best && best.n > 0 ? (
            <Link href="/dashboard/campaigns/new" className={buttonClass("secondary", "sm")}>
              Plan a campaign
            </Link>
          ) : undefined
        }
      />
      <div className="p-4 sm:p-5">
        {max === 0 ? (
          <p className="text-sm text-muted">No replies yet. This fills in as customers write back.</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-2">
              Most replies on <b className="font-semibold text-ink">{DAYS[best!.d]}</b>, <b className="font-semibold text-ink">{BLOCKS[best!.b]}</b>.
            </p>
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[30rem] border-separate border-spacing-1 text-xs">
                <caption className="sr-only">Customer replies by weekday and time of day</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10" />
                    {BLOCKS.map((b) => (
                      <th key={b} scope="col" className="px-0.5 pb-1 text-center text-2xs font-normal text-muted">
                        {b.replace(/ (am|pm)$/, "")}
                        <span className="block">{b.match(/(am|pm)$/)?.[0]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.map((d) => (
                    <tr key={d}>
                      <th scope="row" className="pr-1 text-left font-normal text-muted">
                        {DAYS[d]}
                      </th>
                      {BLOCKS.map((b, bi) => {
                        const v = n(d, bi);
                        const a = v ? 0.12 + 0.88 * (v / max) : 0;
                        return (
                          <td key={b} className="track-3d h-8 rounded-[6px] p-0 text-center" title={`${DAYS[d]} ${b}: ${v} replies`}>
                            <span
                              className={cn("grid size-full min-h-8 place-items-center rounded-[6px] font-semibold", v > 0 && "tile-3d")}
                              style={{ background: v ? `linear-gradient(180deg, rgb(255 255 255 / 0.18), rgb(255 255 255 / 0)), rgb(22 125 99 / ${a})` : undefined, color: a > 0.55 ? "#fff" : "#344054" }}
                            >
                              {v || ""}
                              <span className="sr-only">{v ? "" : "0"}</span>
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Top products ───────────────────────── */

export function TopProductsCard({ items, rangeLabel }: { items: { name: string; qty: number; revenue: number }[]; rangeLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.revenue));
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="gold"
        icon={<Trophy />}
        title="Best sellers"
        description={`From orders, ${rangeLabel.toLowerCase()}`}
        action={
          <Link href="/dashboard/orders?show=all" className={buttonClass("ghost", "sm")}>
            Orders
          </Link>
        }
      />
      {items.length ? (
        <ol className="space-y-3 p-4 sm:p-5">
          {items.map((it, i) => (
            <li key={it.name} className="flex items-center gap-3">
              <span
                className={cn("tabular tile-3d grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", i === 0 ? "text-white" : "bg-sunken text-ink-2")}
                style={i === 0 ? { background: "linear-gradient(145deg, #f5d55c, #b98a05)" } : undefined}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-ink">{it.name}</span>
                  <span className="tabular shrink-0 font-semibold text-ink">{formatValue(it.revenue, "inr")}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="track-3d h-2 flex-1 overflow-hidden rounded-full">
                    <div className="bar bar-3d h-full rounded-full" style={{ width: `${pct(it.revenue, max)}%`, backgroundColor: C.gold }} />
                  </div>
                  <span className="tabular w-14 shrink-0 text-right text-xs text-muted">{fmtNumber(it.qty)} sold</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="p-5 text-sm text-muted">No orders in this period yet.</p>
      )}
    </Card>
  );
}
