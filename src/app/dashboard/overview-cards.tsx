import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCheck,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { CountUp, DeliveryDonut, HeatGrid, Sparkline, TrendChart, UsageGauge, type Series } from "@/components/charts";
import { BarList, StackedRows } from "@/components/viz";
import { cssColor } from "@/lib/chart-theme";
import {
  ChartBar3D,
  Clock3D,
  Eye3D,
  Gauge3D,
  Messages3D,
  Send3D,
  ShoppingBag3D,
  Target3D,
  Trophy3D,
} from "@/components/icons-3d";
import { formatValue, type ValueFormat } from "@/lib/chart-math";
import { Card, CardHeader, QualityBadge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import type { FilterSection } from "@/lib/filters";
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

function brightCubeGradient(color: string) {
  if (color === C.brand) return "linear-gradient(145deg, #34d399 0%, #10b981 52%, #059669 100%)";
  if (color === C.read) return "linear-gradient(145deg, #c084fc 0%, #9333ea 52%, #7e22ce 100%)";
  if (color === C.gold) return "linear-gradient(145deg, #fde047 0%, #f59e0b 52%, #d97706 100%)";
  if (color === C.info) return "linear-gradient(145deg, #38bdf8 0%, #0ea5e9 52%, #0284c7 100%)";
  if (color === C.failed) return "linear-gradient(145deg, #fb7185 0%, #f43f5e 52%, #e11d48 100%)";
  return `linear-gradient(145deg, rgb(255 255 255 / 0.42), rgb(255 255 255 / 0) 60%), ${color}`;
}

/* ───────────────────────── Period switch ───────────────────────── */

/** Dashboard sections: one focused view at a time instead of one very long page. */
export const VIEWS = {
  overview: { label: "Overview", hint: "Today's work and headline figures" },
  customers: { label: "Customers", hint: "Journey, lifecycle and where they are" },
  products: { label: "Products", hint: "What sells, what sticks in carts" },
  carts: { label: "Carts", hint: "Revisions and hesitation" },
} as const;
export type View = keyof typeof VIEWS;

/**
 * The filters each section offers: only the ones that change its figures. Customers compares groups
 * of people and Products compares products, so picking single people is left to Overview and Carts
 * (and the customer's own page); carts aren't tied to a campaign.
 */
export const VIEW_FILTERS: Record<View, FilterSection[]> = {
  overview: ["period", "products", "customers", "tags", "area", "campaign"],
  customers: ["period", "products", "tags", "area", "campaign"],
  products: ["period", "products", "tags", "area", "campaign"],
  carts: ["period", "products", "customers", "tags", "area"],
};

/** What the filters change in each section, shown in the filter panel. */
export const VIEW_FILTER_NOTE: Record<View, string> = {
  overview: "Filters every figure and chart on Overview. Today always shows today, whatever the period; the sending limit and WhatsApp spend are for the whole business.",
  customers: "The period applies to the customer journey; lifecycle, product groups and areas are as of today, and best time covers the last 90 days. Products, groups, area and campaign narrow every card to those customers.",
  products: "The period applies to product performance and demand; campaigns by product group covers the last 30 days. Picking products shows just those products.",
  carts: "Cart revisions in the period, for the products, people, groups or area you pick.",
};

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
  icon: ComponentType<{ className?: string }>;
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
          className="icon-cube-3d grid size-9 shrink-0 place-items-center rounded-[11px] text-white ring-1 ring-inset ring-white/40 sm:size-10"
          style={{ background: brightCubeGradient(color), boxShadow: `inset 0 1.5px 0 rgb(255 255 255 / 0.65), inset 0 -2px 0 rgb(0 0 0 / 0.2), 0 6px 14px -3px ${color}99` }}
        >
          <Icon className="size-5 sm:size-[22px]" />
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
  const surface = { background: `linear-gradient(180deg, ${color}14 0%, var(--color-panel) 46%, var(--color-panel-2) 100%)` };
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
        icon={<ChartBar3D />}
        title={title}
        description={description}
        action={
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: cssColor(s.color) }} />
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
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="violet"
        icon={<Gauge3D />}
        title="Message delivery health"
        description="How many WhatsApp messages reached and were read by customers"
      />
      <div className="p-4 sm:p-5">
        <DeliveryDonut read={read} delivered={delivered} sent={sent} failed={failed} />
      </div>
    </Card>
  );
}

/* ───────────────────────── Message → order funnel ───────────────────────── */

const FUNNEL: {
  key: "messaged" | "delivered" | "read" | "replied" | "browsed" | "addedToCart" | "ordered";
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
}[] = [
  // One hue for every step: a funnel is one quantity shrinking, not different things.
  { key: "messaged", label: "Messaged", icon: Send3D, color: "emerald" },
  { key: "delivered", label: "Received it", icon: CheckCheck, color: "emerald" },
  { key: "read", label: "Read it", icon: Eye3D, color: "emerald" },
  { key: "replied", label: "Replied / tapped button", icon: Messages3D, color: "emerald" },
  { key: "browsed", label: "Viewed catalogue / price list", icon: BookOpen, color: "emerald" },
  { key: "addedToCart", label: "Added to cart (sent cart)", icon: ShoppingCart, color: "emerald" },
  { key: "ordered", label: "Bought (paid / confirmed)", icon: ShoppingBag3D, color: "emerald" },
];

/** People, not messages: each step is a share of everyone messaged in the period. */
export function FunnelCard({
  f,
  revenue,
  unpaidCartRevenue = 0,
  unpaidCartCount = 0,
  showOrders = true,
  showReplies = true,
}: {
  f: {
    messaged: number;
    delivered: number;
    read: number;
    replied: number;
    browsed?: number;
    addedToCart?: number;
    ordered: number;
  };
  revenue: number;
  unpaidCartRevenue?: number;
  unpaidCartCount?: number;
  showOrders?: boolean;
  showReplies?: boolean;
}) {
  const base = f.messaged;
  const steps = FUNNEL.filter(
    (s) =>
      ((s.key !== "ordered" && s.key !== "addedToCart" && s.key !== "browsed") || showOrders) &&
      (s.key !== "replied" || showReplies),
  );
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="gold"
        icon={<Target3D />}
        title={showOrders ? "From message to cart & purchase" : "Customer engagement funnel"}
        description="Customers messaged this period, where they engaged, and where they dropped off"
      />
      {base ? (
        <div className="space-y-3 p-4 sm:p-5">
          <BarList
            max={base}
            label="Customers at each step, as a share of everyone messaged"
            items={steps.map((s) => {
              const val = f[s.key] ?? 0;
              return { key: s.key, label: s.label, value: val, color: s.color, display: `${fmtNumber(val)} · ${pct(val, base)}%` };
            })}
          />
          <ul className="space-y-1.5">
          {showOrders && (
            <li className="space-y-1.5">
              <div className="flex items-center justify-between rounded-control bg-gold-soft px-3 py-2 text-sm">
                <span className="text-gold-deep">Confirmed sales from those buyers</span>
                <span className="tabular font-semibold text-gold-deep">{formatValue(revenue, "inr")}</span>
              </div>
              {unpaidCartCount > 0 && (
                <Link
                  href="/dashboard/orders?status=NEW"
                  className="flex items-center justify-between rounded-control border border-warning-border bg-warning-bg px-3 py-2 text-xs font-medium text-warning transition hover:opacity-90"
                >
                  <span>Added to cart, not paid yet ({fmtNumber(unpaidCartCount)} cart{unpaidCartCount === 1 ? "" : "s"})</span>
                  <span className="tabular font-semibold">{formatValue(unpaidCartRevenue, "inr")} waiting →</span>
                </Link>
              )}
            </li>
          )}
          </ul>
        </div>
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
      <UsageGauge
        value={Math.max(used, 0)}
        max={limit}
        full={full}
        size={108}
        label={limit === null ? `${label}: no limit` : `${label}: ${used} of ${limit} people messaged`}
      >
        <span className="tabular text-lg font-semibold leading-none text-ink">{fmtNumber(used)}</span>
        <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">{limit === null ? "no limit" : `of ${fmtNumber(limit)}`}</span>
      </UsageGauge>
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
      <CardHeader tone="info" icon={<Gauge3D />} title="Daily sending limit" description="Different people messaged in the last 24 hours" />
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
        icon={<Clock3D />}
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
            <HeatGrid
              label="Customer replies by weekday and time of day"
              unit="Replies"
              rows={order.map((d) => DAYS[d])}
              cols={BLOCKS.map((b) => b.replace(" am", "a").replace(" pm", "p"))}
              cells={order.flatMap((d, y) => BLOCKS.map((_, bi) => [bi, y, n(d, bi)] as [number, number, number]))}
            />
          </>
        )}
      </div>
    </Card>
  );
}

/* ───────────────────────── Top products (Bought vs. Added to Cart) ───────────────────────── */

export type ProductDemandRow = {
  name: string;
  qty: number;
  revenue: number;
  cartOnlyQty?: number;
  cartOnlyValue?: number;
};

export function TopProductsCard({ items, rangeLabel }: { items: ProductDemandRow[]; rangeLabel: string }) {
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="gold"
        icon={<Trophy3D />}
        title="Product demand: bought vs. left in cart"
        description={`Paid/confirmed sales vs. items added to cart & unpaid (${rangeLabel.toLowerCase()})`}
        action={
          <Link href="/dashboard?view=products" className={buttonClass("ghost", "sm")}>
            All products →
          </Link>
        }
      />
      {items.length ? (
        <div className="p-4 sm:p-5">
          <StackedRows
            format="inr"
            label="Product demand: bought vs left in cart"
            legend={[
              { label: "Bought", color: "emerald" },
              { label: "In cart, unpaid", color: "gold" },
            ]}
            rows={items.map((it) => ({
              key: it.name,
              label: it.name,
              right: `${formatValue(it.revenue, "inr")}${(it.cartOnlyValue ?? 0) > 0 ? ` +${formatValue(it.cartOnlyValue ?? 0, "inr")}` : ""} · ${fmtNumber(it.qty)} sold`,
              href: `/dashboard/customers?tag=${encodeURIComponent(`product:${it.name}`)}`,
              parts: [
                { key: "b", label: `Bought (${fmtNumber(it.qty)})`, value: it.revenue, color: "emerald" },
                { key: "c", label: `In cart (${fmtNumber(it.cartOnlyQty ?? 0)})`, value: it.cartOnlyValue ?? 0, color: "gold" },
              ],
            }))}
          />
        </div>
      ) : (
        <p className="p-5 text-sm text-muted">No orders or carts in this period yet.</p>
      )}
    </Card>
  );
}

/* ───────────────────────── Business Priority Strip (Top of Dashboard) ───────────────────────── */

/* ───────────────────────── Customer Behaviour & Cart Scenarios Card ───────────────────────── */

export type ScenarioLead = {
  customerId: string;
  name: string;
  phone: string;
  detail: string;
  amount?: number;
  at: Date;
  href: string;
};

export type CustomerScenariosData = {
  periodLabel: string;
  /** Scenario 1: Added to cart (sent cart on WhatsApp), unpaid (`status = NEW`, `paidAt = null`) */
  addedToCartUnpaid: {
    customers: number;
    carts: number;
    value: number;
    leads: ScenarioLead[];
  };
  /** Scenario 2: Viewed catalogue or price list (or tapped Order now / Send price list), never sent a cart */
  browsedNoCart: {
    customers: number;
    leads: ScenarioLead[];
  };
  /** Scenario 3: Added to cart, then cancelled (`status = CANCELLED`) */
  cancelledCarts: {
    customers: number;
    carts: number;
    value: number;
    leads: ScenarioLead[];
  };
  /** Scenario 4: Added to cart & bought (`PAID`, `CONFIRMED`, `DISPATCHED`, `DELIVERED`) */
  convertedBuyers: {
    customers: number;
    orders: number;
    revenue: number;
    repeatBuyers: number;
    leads: ScenarioLead[];
  };
  /** Scenario 5: Replied / chatted / allowed call, but hasn't browsed catalogue or ordered yet */
  repliedInquiryOnly: {
    customers: number;
    leads: ScenarioLead[];
  };
  /** Scenario 6: Read campaign message, took no action */
  readNoAction: {
    customers: number;
  };
  /** Overall conversion benchmarks */
  catalogueToCartPct: number;
  cartToBuyPct: number;
};

/* ───────────────────────── Multi-Cart Customer Mentality & Product Hesitation Card ───────────────────────── */

export type CartRevisionJourney = {
  customerId: string;
  customerName: string;
  customerPhone: string;
  latestOrderId: string;
  latestOrderRef: string;
  latestStatus: string;
  latestPaid: boolean;
  latestTotal: number;
  firstCartRef: string;
  firstCartTotal: number;
  attemptCount: number;
  behavior: "downsized" | "upsized" | "swapped" | "duplicate_retry";
  headline: string;
  deltaAmount: number;
  droppedItems: { name: string; quantity: number; price: number }[];
  addedItems: { name: string; quantity: number; price: number }[];
  keptItems: { name: string; quantity: number; price: number }[];
  at: Date;
};

export type DroppedProductInsight = {
  name: string;
  droppedCount: number;
  droppedQty: number;
  droppedValue: number;
  customerNames: string[];
};

export type AnchorProductInsight = {
  name: string;
  keptCount: number;
  boughtQty: number;
  customerNames: string[];
};

export type CartMentalitySummaryData = {
  periodLabel: string;
  totalRevisers: number;
  totalSupersededCarts: number;
  downsizedCount: number;
  downsizedValueLost: number;
  upsizedCount: number;
  upsizedValueGained: number;
  swappedCount: number;
  retriedCount: number;
  journeys: CartRevisionJourney[];
  droppedProducts: DroppedProductInsight[];
  anchorProducts: AnchorProductInsight[];
};
