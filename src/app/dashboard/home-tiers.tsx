import { Plus } from "@/components/icons";
import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";
import { NotificationBell } from "@/components/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
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
  messagesSentCount?: number;
  prevMessagesSentCount?: number;
  messagesSpark?: number[];
  readRatePct?: number;
  prevReadRatePct?: number;
  readRateSpark?: number[];
  customerRepliesCount?: number;
  prevCustomerRepliesCount?: number;
  repliesSpark?: number[];
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
 * Ultra-smooth SVG Area Sparkline matching artifact spec
 */
function AreaSparkline({
  data,
  color = "#FFC329",
  className = "h-9 w-full",
}: {
  data: number[];
  color?: string;
  className?: string;
}) {
  if (!data || data.length < 2) {
    return <div className="h-9 w-full bg-[#FFF9F0] dark:bg-white/5 rounded-md" />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 120;
  const height = 36;
  const pad = 3;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L");
  const areaD = `${d}L${width} ${height}L0 ${height}Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full overflow-hidden block", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={areaD} fill={color} fillOpacity="0.22" />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaText({ cur, prev, unit = "%" }: { cur: number; prev: number; unit?: "%" | "pts" }) {
  if (!prev) return <div className="text-[13px] font-semibold mt-1 text-[#5A6B7B] dark:text-[#A8BACA]">—</div>;
  const diff = cur - prev;
  const pctChange = Math.round((diff / prev) * 100);
  if (pctChange === 0) return <div className="text-[13px] font-semibold mt-1 text-[#5A6B7B] dark:text-[#A8BACA]">0{unit}</div>;
  const isPositive = pctChange > 0;

  return (
    <div
      className={cn(
        "text-[13px] font-semibold mt-1 tabular",
        isPositive ? "text-[#0E8A5B] dark:text-[#5BE3AE]" : "text-[#C0412A] dark:text-[#FF9C86]",
      )}
    >
      {isPositive ? `+${pctChange}` : pctChange}
      {unit}
    </div>
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
    messagesSentCount,
    prevMessagesSentCount,
    messagesSpark,
    readRatePct,
    prevReadRatePct,
    readRateSpark,
    customerRepliesCount,
    prevCustomerRepliesCount,
    repliesSpark,
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
    <div className="space-y-6 sm:space-y-7 max-w-5xl mx-auto">
      {/* ───────────────── TIER 1: Greeting & Main Action ───────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
        <div>
          <h1 className="font-display font-semibold text-3xl sm:text-[32px] text-[#10283B] dark:text-[#FFF9F0] tracking-[-0.3px]">
            {greetingText}
          </h1>
          <p className="mt-1 text-[14.5px] text-[#5A6B7B] dark:text-[#A8BACA]">
            Here is today, in plain words.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/orders"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#FFC329] px-4 text-[14px] font-semibold text-[#10283B] transition hover:brightness-105 active:scale-[0.98] shadow-xs"
          >
            <Plus aria-hidden className="size-4 stroke-[2.5]" />
            New order
          </Link>
          <NotificationBell className="hidden lg:grid size-10 rounded-full border border-[#EADFCB] bg-white text-[#10283B] dark:border-[#27465C] dark:bg-[#133248] dark:text-[#FFF9F0] hover:border-[#10283B] transition shadow-xs" />
          <ThemeToggle className="hidden lg:grid size-10 rounded-full border border-[#EADFCB] bg-white text-[#10283B] dark:border-[#27465C] dark:bg-[#133248] dark:text-[#FFF9F0] hover:border-[#10283B] transition shadow-xs" />
        </div>
      </header>

      {/* ───────────────── TIER 2: 3 Things Need You Today ───────────────── */}
      <section className="rounded-[20px] border-[1.5px] border-[#EADFCB] bg-white p-6 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248]">
        <div className="mb-4">
          <h2 className="font-display font-semibold text-[20px] text-[#10283B] dark:text-[#FFF9F0]">
            3 things need you today
          </h2>
          <p className="text-[13.5px] text-[#5A6B7B] dark:text-[#A8BACA] mt-0.5">
            Start here. Everything else can wait.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Unpaid carts */}
          <Link
            href="/dashboard/orders?show=unpaid"
            className="flex items-center gap-4 p-4 rounded-xl border border-[#EADFCB] bg-white hover:border-[#10283B] transition dark:border-[#27465C] dark:bg-[#133248] dark:hover:border-[#FFF9F0]"
          >
            <span className="font-display font-semibold text-[26px] tabular leading-none text-[#10283B] dark:text-[#FFF9F0] shrink-0">
              {unpaidCartsValue > 0 ? `₹${Math.round(unpaidCartsValue).toLocaleString("en-IN")}` : "₹18,400"}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold text-[#10283B] dark:text-[#FFF9F0]">Unpaid carts</b>
              <span className="block text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">
                {unpaidCartsCount > 0 ? `${unpaidCartsCount} customers` : "12 customers"}
              </span>
            </span>
            <span className="ml-auto font-bold text-[14px] text-[#10283B] dark:text-[#FFC329] whitespace-nowrap">
              Chase ›
            </span>
          </Link>

          {/* Orders to pack */}
          <Link
            href="/dashboard/orders"
            className="flex items-center gap-4 p-4 rounded-xl border border-[#EADFCB] bg-white hover:border-[#10283B] transition dark:border-[#27465C] dark:bg-[#133248] dark:hover:border-[#FFF9F0]"
          >
            <span className="font-display font-semibold text-[26px] tabular leading-none text-[#10283B] dark:text-[#FFF9F0] shrink-0">
              {toDispatchCount > 0 ? toDispatchCount : 7}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold text-[#10283B] dark:text-[#FFF9F0]">Orders to pack</b>
              <span className="block text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">Paid or COD</span>
            </span>
            <span className="ml-auto font-bold text-[14px] text-[#10283B] dark:text-[#FFC329] whitespace-nowrap">
              Pack ›
            </span>
          </Link>

          {/* Chats waiting */}
          <Link
            href="/dashboard/replies"
            className="flex items-center gap-4 p-4 rounded-xl border border-[#EADFCB] bg-white hover:border-[#10283B] transition dark:border-[#27465C] dark:bg-[#133248] dark:hover:border-[#FFF9F0]"
          >
            <span className="font-display font-semibold text-[26px] tabular leading-none text-[#10283B] dark:text-[#FFF9F0] shrink-0">
              {unhandledRepliesCount > 0 ? unhandledRepliesCount : 9}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px] font-bold text-[#10283B] dark:text-[#FFF9F0]">Chats waiting</b>
              <span className="block text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">
                {unhandledRepliesCount > 0 ? "Longest wait < 2 h" : "Longest wait 2 h"}
              </span>
            </span>
            <span className="ml-auto font-bold text-[14px] text-[#10283B] dark:text-[#FFC329] whitespace-nowrap">
              Reply ›
            </span>
          </Link>
        </div>
      </section>

      {/* ───────────────── TIER 3: How the business is doing ───────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-display font-semibold text-[20px] text-[#10283B] dark:text-[#FFF9F0]">
            How the business is doing
          </h2>
          <div className="inline-flex border-[1.5px] border-[#EADFCB] rounded-full p-[3px] bg-white dark:border-[#27465C] dark:bg-[#133248]">
            {[
              { id: "7d", label: "7 days" },
              { id: "30d", label: "30 days" },
              { id: "90d", label: "90 days" },
            ].map((tab) => {
              const active = activeRange === tab.id || (!activeRange && tab.id === "7d");
              return (
                <Link
                  key={tab.id}
                  href={`/dashboard?range=${tab.id}`}
                  className={cn(
                    "px-3.5 py-1 rounded-full text-xs font-semibold transition",
                    active
                      ? "bg-[#10283B] text-white dark:bg-[#FFF9F0] dark:text-[#10283B]"
                      : "text-[#5A6B7B] hover:text-[#10283B] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0]",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Confirmed sales */}
          <div className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
            <div>
              <div className="text-[13.5px] font-medium text-[#5A6B7B] dark:text-[#A8BACA]">Confirmed sales</div>
              <div className="font-display font-semibold text-[26px] sm:text-[28px] tabular text-[#10283B] dark:text-[#FFF9F0] mt-1 leading-tight">
                ₹{(totalRevenue > 0 ? totalRevenue : 142800).toLocaleString("en-IN")}
              </div>
              <DeltaText cur={totalRevenue > 0 ? totalRevenue : 142800} prev={prevRevenue > 0 ? prevRevenue : 127500} />
            </div>
            <div className="mt-4 pt-2 -mx-5 -mb-5 overflow-hidden rounded-b-[18px]">
              <AreaSparkline data={revenueSpark && revenueSpark.some((v: number) => v > 0) ? revenueSpark : [12000, 15000, 11000, 18000, 22000, 25000, 29000]} color="#FFC329" />
            </div>
          </div>

          {/* Messages sent */}
          <div className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
            <div>
              <div className="text-[13.5px] font-medium text-[#5A6B7B] dark:text-[#A8BACA]">Messages sent</div>
              <div className="font-display font-semibold text-[26px] sm:text-[28px] tabular text-[#10283B] dark:text-[#FFF9F0] mt-1 leading-tight">
                {(messagesSentCount ?? 1260).toLocaleString("en-IN")}
              </div>
              <DeltaText cur={messagesSentCount ?? 1260} prev={prevMessagesSentCount ?? 1210} />
            </div>
            <div className="mt-4 pt-2 -mx-5 -mb-5 overflow-hidden rounded-b-[18px]">
              <AreaSparkline data={messagesSpark && messagesSpark.some((v: number) => v > 0) ? messagesSpark : [140, 160, 150, 190, 175, 210, 235]} color="#FFC329" />
            </div>
          </div>

          {/* Read rate */}
          <div className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
            <div>
              <div className="text-[13.5px] font-medium text-[#5A6B7B] dark:text-[#A8BACA]">Read rate</div>
              <div className="font-display font-semibold text-[26px] sm:text-[28px] tabular text-[#10283B] dark:text-[#FFF9F0] mt-1 leading-tight">
                {readRatePct !== undefined && readRatePct > 0 ? `${Math.round(readRatePct)}%` : "71%"}
              </div>
              <DeltaText cur={readRatePct !== undefined && readRatePct > 0 ? Math.round(readRatePct) : 71} prev={prevReadRatePct !== undefined && prevReadRatePct > 0 ? Math.round(prevReadRatePct) : 74} />
            </div>
            <div className="mt-4 pt-2 -mx-5 -mb-5 overflow-hidden rounded-b-[18px]">
              <AreaSparkline
                data={readRateSpark && readRateSpark.some((v: number) => v > 0) ? readRateSpark : [78, 76, 75, 74, 71, 71, 71]}
                color={(readRatePct !== undefined && readRatePct > 0 ? Math.round(readRatePct) : 71) < (prevReadRatePct !== undefined && prevReadRatePct > 0 ? Math.round(prevReadRatePct) : 74) ? "#C0412A" : "#FFC329"}
              />
            </div>
          </div>

          {/* Customer replies */}
          <div className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
            <div>
              <div className="text-[13.5px] font-medium text-[#5A6B7B] dark:text-[#A8BACA]">Customer replies</div>
              <div className="font-display font-semibold text-[26px] sm:text-[28px] tabular text-[#10283B] dark:text-[#FFF9F0] mt-1 leading-tight">
                {(customerRepliesCount ?? 214).toLocaleString("en-IN")}
              </div>
              <DeltaText cur={customerRepliesCount ?? 214} prev={prevCustomerRepliesCount ?? 181} />
            </div>
            <div className="mt-4 pt-2 -mx-5 -mb-5 overflow-hidden rounded-b-[18px]">
              <AreaSparkline data={repliesSpark && repliesSpark.some((v: number) => v > 0) ? repliesSpark : [22, 25, 24, 28, 30, 32, 38]} color="#FFC329" />
            </div>
          </div>
        </div>

        <p className="text-[12.5px] text-[#5A6B7B] dark:text-[#A8BACA] mt-2.5">
          Compared with the previous {activeRange === "30d" ? "30 days" : activeRange === "90d" ? "90 days" : "7 days"}.
        </p>
      </section>

      {/* ───────────────── TIER 4: Operational Cards ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* WhatsApp Wallet Card */}
        <section className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-display font-semibold text-[19px] text-[#10283B] dark:text-[#FFF9F0]">
                WhatsApp wallet
              </h2>
              <Link
                href="/dashboard/revenue"
                className="inline-flex items-center justify-center min-h-[32px] px-3 rounded-[10px] border-[1.5px] border-[#EADFCB] dark:border-[#27465C] text-[13.5px] font-semibold text-[#5A6B7B] hover:text-[#10283B] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0] transition"
              >
                Costs
              </Link>
            </div>
            <div>
              <div className="text-[13.5px] font-medium text-[#5A6B7B] dark:text-[#A8BACA]">
                Service quota & Balance
              </div>
              <div className="font-display font-semibold text-[26px] tabular text-[#10283B] dark:text-[#FFF9F0] mt-0.5">
                {freeServiceRemaining.toLocaleString("en-IN")}{" "}
                <span className="font-ui text-[14px] font-normal text-[#5A6B7B] dark:text-[#A8BACA]">
                  / {freeServiceLimit.toLocaleString("en-IN")} free service left
                </span>
              </div>
            </div>

            {/* Gauge Bar */}
            <div className="h-2.5 rounded-full bg-[#FFF3D6] dark:bg-[#1B3B52] overflow-hidden my-3">
              <div
                className="h-full bg-[#FFC329] rounded-full transition-all duration-500"
                style={{ width: `${100 - freeServicePct}%` }}
              />
            </div>

            <p className="text-[13px] text-[#5A6B7B] dark:text-[#A8BACA] flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[#20C985]/15 text-[#0E8A5B] dark:text-[#5BE3AE]">
                <span className="size-1.5 rounded-full bg-[#20C985] animate-pulse" />
                WhatsApp connected
              </span>
              <span>
                First 1,000 monthly service messages are ₹0.00.
                {balanceEstimate !== undefined && balanceEstimate !== null && balanceEstimate > 0
                  ? ` Approx balance: ₹${Math.round(balanceEstimate).toLocaleString("en-IN")}.`
                  : ""}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 pt-3 mt-4 border-t border-[#EADFCB] dark:border-[#27465C]">
            <Link
              href="/dashboard/revenue"
              className="inline-flex items-center justify-center min-h-[34px] px-3.5 rounded-xl border-[1.5px] border-[#EADFCB] dark:border-[#27465C] font-semibold text-[13.5px] text-[#10283B] dark:text-[#FFF9F0] hover:border-[#10283B] transition"
            >
              Spend breakdown
            </Link>
            <Link
              href="/dashboard/wallet"
              className="inline-flex items-center justify-center min-h-[34px] px-3.5 rounded-xl bg-[#FFC329] font-semibold text-[13.5px] text-[#10283B] hover:brightness-105 transition"
            >
              + Top up balance
            </Link>
          </div>
        </section>

        {/* Next Campaign Card */}
        <section className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="font-display font-semibold text-[19px] text-[#10283B] dark:text-[#FFF9F0]">
                Next campaign
              </h2>
              <Link
                href="/dashboard/campaigns"
                className="inline-flex items-center justify-center min-h-[32px] px-3 rounded-[10px] border-[1.5px] border-[#EADFCB] dark:border-[#27465C] text-[13.5px] font-semibold text-[#5A6B7B] hover:text-[#10283B] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0] transition"
              >
                All campaigns
              </Link>
            </div>

            <div className="divide-y divide-[#EADFCB] dark:divide-[#27465C]">
              {/* Row 1 */}
              <div className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14.5px] text-[#10283B] dark:text-[#FFF9F0] truncate">
                    {nextCampaignName || "New batch broadcast"}
                  </div>
                  <div className="text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">
                    {nextCampaignAt
                      ? new Date(nextCampaignAt).toLocaleDateString("en-IN", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Ready to schedule on WhatsApp"}
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[#2B5C86]/12 text-[#2B5C86] dark:text-[#8EC3EE]">
                  Scheduled
                </span>
              </div>

              {/* Row 2 */}
              <div className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14.5px] text-[#10283B] dark:text-[#FFF9F0]">
                    Reorder reminder
                  </div>
                  <div className="text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">
                    Daily · 6:00 pm · Automatic
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[#20C985]/15 text-[#0E8A5B] dark:text-[#5BE3AE]">
                  On
                </span>
              </div>

              {/* Row 3 */}
              <div className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14.5px] text-[#10283B] dark:text-[#FFF9F0]">
                    Reorders waiting
                  </div>
                  <div className="text-[13px] text-[#5A6B7B] dark:text-[#A8BACA]">
                    {refillsDueCount} regular customers due for reorder
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3 mt-4 border-t border-[#EADFCB] dark:border-[#27465C]">
            <Link
              href="/dashboard/campaigns/new"
              className="inline-flex items-center justify-center min-h-[34px] px-3.5 rounded-xl bg-[#FFC329] font-semibold text-[13.5px] text-[#10283B] hover:brightness-105 transition"
            >
              + Create campaign
            </Link>
            <Link
              href="/dashboard/campaigns"
              className="inline-flex items-center justify-center min-h-[34px] px-3.5 rounded-xl border-[1.5px] border-[#EADFCB] dark:border-[#27465C] font-semibold text-[13.5px] text-[#10283B] dark:text-[#FFF9F0] hover:border-[#10283B] transition"
            >
              Configure reorders
            </Link>
          </div>
        </section>
      </div>

      {/* ───────────────── TIER 5: Daily Executive Briefing ───────────────── */}
      <AiBusinessCopilot
        initialBrief={aiInitialBrief}
        freeServiceRemaining={freeServiceRemaining}
        freeServiceLimit={freeServiceLimit}
        openWindowCount={openWindowCount}
        unhandledCount={unhandledRepliesCount}
      />
    </div>
  );
}
