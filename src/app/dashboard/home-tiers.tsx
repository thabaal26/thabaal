import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  PackageCheck,
  Plus,
  RotateCw,
  ShoppingCart,
  Sparkles,
  Wallet,
} from "@/components/icons";
import Link from "@/components/intent-link";
import { Badge, buttonClass, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { AiBusinessCopilot } from "./ai-copilot";

export type HomeTiersProps = {
  clientName: string;
  greetingText: string;
  todayDateText: string;
  // Tier 2: Priority Action Hero
  unpaidCartsCount: number;
  unpaidCartsValue: number;
  toDispatchCount: number;
  unhandledRepliesCount: number;
  // Tier 3: Business Performance Strip
  periodLabel: string;
  activeRange: string;
  totalRevenue: number;
  prevRevenue: number;
  revenueSpark: number[];
  ordersCount: number;
  prevOrdersCount: number;
  ordersSpark: number[];
  aov: number;
  prevAov: number;
  aovSpark: number[];
  repeatRatePct: number;
  prevRepeatRatePct: number;
  repeatSpark: number[];
  // Tier 4: Operational Split Grid
  freeServiceRemaining: number;
  freeServiceLimit: number;
  metaQuality: string;
  messagingTier: string;
  balanceEstimate?: number | null;
  nextCampaignName?: string | null;
  nextCampaignAt?: Date | null;
  refillsDueCount: number;
  // Tier 5: Daily Executive Briefing
  aiInitialBrief: string;
  openWindowCount: number;
};

/**
 * Ultra-smooth SVG Area Sparkline with zero lag.
 */
function AreaSparkline({
  data,
  color = "#FFC82C",
  className = "h-8 w-24",
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const height = 32;
  const pad = 2;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyPoints = [`0,${height}`, ...points, `${width},${height}`].join(" ");
  const linePoints = points.join(" ");
  const gradId = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible shrink-0", className)} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${gradId})`} points={polyPoints} />
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
    </svg>
  );
}

function DeltaPill({ cur, prev, unit = "%" }: { cur: number; prev: number; unit?: "%" | "pts" }) {
  if (!prev) return null;
  const diff = cur - prev;
  const pctChange = Math.round((diff / prev) * 100);
  if (pctChange === 0) return null;
  const isPositive = pctChange > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
        isPositive
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
          : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
      )}
    >
      {isPositive ? <ArrowUpRight aria-hidden className="size-3" /> : <ArrowDownRight aria-hidden className="size-3" />}
      {isPositive ? `+${pctChange}` : pctChange}
      {unit}
    </span>
  );
}

export function HomeTiers(props: HomeTiersProps) {
  const {
    clientName,
    greetingText,
    todayDateText,
    unpaidCartsCount,
    unpaidCartsValue,
    toDispatchCount,
    unhandledRepliesCount,
    periodLabel,
    activeRange,
    totalRevenue,
    prevRevenue,
    revenueSpark,
    ordersCount,
    prevOrdersCount,
    ordersSpark,
    aov,
    prevAov,
    aovSpark,
    repeatRatePct,
    prevRepeatRatePct,
    repeatSpark,
    freeServiceRemaining,
    freeServiceLimit,
    metaQuality,
    messagingTier,
    balanceEstimate,
    nextCampaignName,
    nextCampaignAt,
    refillsDueCount,
    aiInitialBrief,
    openWindowCount,
  } = props;

  const urgentCount =
    (unpaidCartsCount > 0 ? 1 : 0) +
    (toDispatchCount > 0 ? 1 : 0) +
    (unhandledRepliesCount > 0 ? 1 : 0);

  const freeServiceUsed = Math.max(0, freeServiceLimit - freeServiceRemaining);
  const freeServicePct = Math.min(100, Math.round((freeServiceUsed / Math.max(1, freeServiceLimit)) * 100));

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ───────────────── TIER 1: Conversational Greeting & Quick Actions ───────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl lg:text-[1.75rem]">
            {greetingText}, {clientName}
          </h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">
            Here&apos;s what needs your attention today · <span className="font-medium text-ink-2">{todayDateText}</span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/orders"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#FFC82C] px-3.5 text-xs font-bold text-[#111827] shadow-xs transition hover:bg-[#F5BD1F] active:scale-[0.98] sm:h-10 sm:px-4 sm:text-sm"
          >
            <Plus aria-hidden className="size-4 stroke-[2.5]" />
            New order
          </Link>
        </div>
      </div>

      {/* ───────────────── TIER 2: Priority Action Hero ───────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-ink sm:text-base">
              {urgentCount > 0 ? `${urgentCount} things need you today` : "Everything is up to date"}
            </h2>
            {urgentCount > 0 ? (
              <span className="grid size-5 place-items-center rounded-full bg-[#EF4444] text-[10px] font-bold text-white shadow-xs">
                {urgentCount}
              </span>
            ) : (
              <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs">
                ✓
              </span>
            )}
          </div>
          <span className="text-2xs text-muted">Tap to resolve immediately</span>
        </div>

        {urgentCount === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400 dark:ring-emerald-800">
              <Check aria-hidden className="size-5 stroke-[2.5]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">You&apos;re completely caught up!</p>
              <p className="text-xs text-muted">All customer orders dispatched, carts processed, and chats answered.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Action 1: Unpaid carts */}
            <Link
              href="/dashboard/orders?show=unpaid"
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border bg-panel p-4 shadow-xs transition-all hover:border-amber-300 hover:shadow-sm active:scale-[0.99] sm:p-5",
                unpaidCartsCount > 0 ? "border-amber-200/90 dark:border-amber-900/50" : "border-line opacity-75",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:ring-amber-800">
                  <ShoppingCart aria-hidden className="size-4" />
                </span>
                <span className="text-2xl font-black tabular tracking-tight text-ink">
                  {unpaidCartsCount}
                </span>
              </div>
              <div className="mt-3">
                <p className="text-sm font-bold text-ink">Unpaid carts</p>
                <p className="mt-0.5 text-xs text-muted">
                  {unpaidCartsCount > 0
                    ? `₹${Math.round(unpaidCartsValue).toLocaleString("en-IN")} awaiting payment`
                    : "No abandoned carts right now"}
                </p>
              </div>
              <div className="mt-3.5 flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400 group-hover:translate-x-0.5 transition-transform">
                <span>Review carts</span>
                <ArrowUpRight aria-hidden className="size-3.5" />
              </div>
            </Link>

            {/* Action 2: Orders to pack */}
            <Link
              href="/dashboard/orders/packing"
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border bg-panel p-4 shadow-xs transition-all hover:border-blue-300 hover:shadow-sm active:scale-[0.99] sm:p-5",
                toDispatchCount > 0 ? "border-blue-200/90 dark:border-blue-900/50" : "border-line opacity-75",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:ring-blue-800">
                  <PackageCheck aria-hidden className="size-4" />
                </span>
                <span className="text-2xl font-black tabular tracking-tight text-ink">
                  {toDispatchCount}
                </span>
              </div>
              <div className="mt-3">
                <p className="text-sm font-bold text-ink">Orders to pack</p>
                <p className="mt-0.5 text-xs text-muted">
                  {toDispatchCount > 0 ? "Paid & ready for packing slips" : "All orders dispatched"}
                </p>
              </div>
              <div className="mt-3.5 flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
                <span>Pack orders</span>
                <ArrowUpRight aria-hidden className="size-3.5" />
              </div>
            </Link>

            {/* Action 3: Chats waiting */}
            <Link
              href="/dashboard/replies"
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border bg-panel p-4 shadow-xs transition-all hover:border-purple-300 hover:shadow-sm active:scale-[0.99] sm:p-5",
                unhandledRepliesCount > 0 ? "border-purple-200/90 dark:border-purple-900/50" : "border-line opacity-75",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="grid size-9 place-items-center rounded-xl bg-purple-50 text-purple-600 ring-1 ring-purple-200 dark:bg-purple-950/60 dark:text-purple-400 dark:ring-purple-800">
                  <MessageCircle aria-hidden className="size-4" />
                </span>
                <span className="text-2xl font-black tabular tracking-tight text-ink">
                  {unhandledRepliesCount}
                </span>
              </div>
              <div className="mt-3">
                <p className="text-sm font-bold text-ink">Chats waiting</p>
                <p className="mt-0.5 text-xs text-muted">
                  {unhandledRepliesCount > 0 ? "Customer messages needing reply" : "All conversations handled"}
                </p>
              </div>
              <div className="mt-3.5 flex items-center gap-1 text-xs font-semibold text-purple-700 dark:text-purple-400 group-hover:translate-x-0.5 transition-transform">
                <span>Reply now</span>
                <ArrowUpRight aria-hidden className="size-3.5" />
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* ───────────────── TIER 3: Business Performance Strip ───────────────── */}
      <div>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink sm:text-base">How the business is doing</h2>
            <p className="text-xs text-muted">Confirmed revenue, volume, and customer retention metrics</p>
          </div>
          {/* Time range switcher: 7d | 30d | 90d */}
          <div className="flex items-center gap-1 rounded-xl border border-line bg-panel p-1 shadow-xs">
            {[
              { id: "7d", label: "7d" },
              { id: "30d", label: "30d" },
              { id: "90d", label: "90d" },
            ].map((tab) => {
              const active = activeRange === tab.id || (!activeRange && tab.id === "7d");
              return (
                <Link
                  key={tab.id}
                  href={`/dashboard?range=${tab.id}`}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                    active
                      ? "bg-[#111827] text-white dark:bg-white dark:text-[#111827] shadow-xs"
                      : "text-muted hover:text-ink hover:bg-black/5 dark:hover:bg-white/10",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* KPI 1: Total Sales */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted">Total Sales</span>
                <DeltaPill cur={totalRevenue} prev={prevRevenue} />
              </div>
              <p className="mt-2 text-xl font-black tabular tracking-tight text-ink sm:text-2xl">
                ₹{totalRevenue.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-line/60">
              <span className="text-2xs text-muted">vs prev {periodLabel}</span>
              <AreaSparkline data={revenueSpark} color="#FFC82C" />
            </div>
          </div>

          {/* KPI 2: Total Orders */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted">Orders</span>
                <DeltaPill cur={ordersCount} prev={prevOrdersCount} />
              </div>
              <p className="mt-2 text-xl font-black tabular tracking-tight text-ink sm:text-2xl">
                {ordersCount.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-line/60">
              <span className="text-2xs text-muted">confirmed orders</span>
              <AreaSparkline data={ordersSpark} color="#0EA5E9" />
            </div>
          </div>

          {/* KPI 3: Average Order Value */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted">Average Order Value</span>
                <DeltaPill cur={aov} prev={prevAov} />
              </div>
              <p className="mt-2 text-xl font-black tabular tracking-tight text-ink sm:text-2xl">
                ₹{Math.round(aov).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-line/60">
              <span className="text-2xs text-muted">per buyer basket</span>
              <AreaSparkline data={aovSpark} color="#10B981" />
            </div>
          </div>

          {/* KPI 4: Repeat Customer Rate */}
          <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted">Repeat Rate</span>
                <DeltaPill cur={repeatRatePct} prev={prevRepeatRatePct} unit="pts" />
              </div>
              <p className="mt-2 text-xl font-black tabular tracking-tight text-ink sm:text-2xl">
                {repeatRatePct}%
              </p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-line/60">
              <span className="text-2xs text-muted">multi-order regular buyers</span>
              <AreaSparkline data={repeatSpark} color="#8B5CF6" />
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────── TIER 4: Operational Split Grid ───────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Column: WhatsApp Wallet & Free Service Quota */}
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <Wallet aria-hidden className="size-4" />
                </span>
                <h3 className="text-sm font-bold text-ink">WhatsApp Service Quota & Wallet</h3>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-2xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {metaQuality || "GREEN"}
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-2xl font-black tabular text-ink">
                  {freeServiceRemaining.toLocaleString("en-IN")}{" "}
                  <span className="text-xs font-semibold text-muted">
                    / {freeServiceLimit.toLocaleString("en-IN")} free service left
                  </span>
                </p>
                <span className="text-xs font-medium text-muted">{freeServicePct}% used</span>
              </div>

              {/* Progress gauge bar */}
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-sunken dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-[#FFC82C] transition-all duration-500"
                  style={{ width: `${100 - freeServicePct}%` }}
                />
              </div>

              <p className="mt-2 text-2xs text-muted">
                First 1,000 monthly service messages are ₹0.00 · Resets on the 1st of every month
                {balanceEstimate !== undefined && balanceEstimate !== null && balanceEstimate > 0
                  ? ` · Approx wallet balance ₹${Math.round(balanceEstimate).toLocaleString("en-IN")}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 pt-3 border-t border-line">
            <Link
              href="/dashboard/revenue"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-sunken/60 px-3 text-xs font-semibold text-ink transition hover:bg-sunken"
            >
              View spend breakdown <ArrowUpRight aria-hidden className="size-3" />
            </Link>
            <Link
              href="/dashboard/wallet"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#FFC82C] px-3 text-xs font-bold text-[#111827] shadow-2xs transition hover:bg-[#F5BD1F]"
            >
              + Top up balance
            </Link>
          </div>
        </div>

        {/* Right Column: Next Campaign & Marketing Pulse */}
        <div className="flex flex-col justify-between rounded-2xl border border-line bg-panel p-4 shadow-xs sm:p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
                  <RotateCw aria-hidden className="size-4" />
                </span>
                <h3 className="text-sm font-bold text-ink">Marketing Pulse & Reorders</h3>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-2xs font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                Auto-pilot active
              </span>
            </div>

            <div className="mt-4">
              {refillsDueCount > 0 ? (
                <div>
                  <p className="text-2xl font-black tabular text-ink">
                    {refillsDueCount}{" "}
                    <span className="text-xs font-semibold text-muted">customers due for reorder</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Based on average oil consumption cycles (30–45 days). Ready for personalized WhatsApp reminders.
                  </p>
                </div>
              ) : nextCampaignName ? (
                <div>
                  <p className="text-lg font-bold text-ink truncate">{nextCampaignName}</p>
                  <p className="mt-1 text-xs text-muted">
                    Next broadcast scheduled for{" "}
                    {nextCampaignAt ? new Date(nextCampaignAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "today"}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xl font-bold text-ink">Ready for broadcast</p>
                  <p className="mt-1 text-xs text-muted">
                    Reach all opted-in customers with new batch announcements, combo offers, or festival specials.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 pt-3 border-t border-line">
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#FFC82C] px-3 text-xs font-bold text-[#111827] shadow-2xs transition hover:bg-[#F5BD1F]"
            >
              + Create campaign
            </Link>
            <Link
              href="/dashboard/campaigns"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-sunken/60 px-3 text-xs font-semibold text-ink transition hover:bg-sunken"
            >
              Configure reorders <ArrowUpRight aria-hidden className="size-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ───────────────── TIER 5: Daily Executive Briefing ───────────────── */}
      <div>
        <AiBusinessCopilot
          initialBrief={aiInitialBrief}
          freeServiceRemaining={freeServiceRemaining}
          freeServiceLimit={freeServiceLimit}
          openWindowCount={openWindowCount}
          unhandledCount={unhandledRepliesCount}
        />
      </div>
    </div>
  );
}
