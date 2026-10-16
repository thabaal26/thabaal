"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui";
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Copy, ExternalLink, Printer, Send, Sparkles, TriangleAlert } from "@/components/icons";
import type { ComprehensiveReportData, PeriodFigures, PeriodKey } from "@/lib/reports-data";

export function ReportDashboard({ data }: { data: ComprehensiveReportData }) {
  const [period, setPeriod] = useState<PeriodKey>("m");
  const [tab, setTab] = useState<"ov" | "camp" | "cust" | "prod">("ov");
  const [chartMode, setChartMode] = useState<"a" | "b">("a");
  const [copied, setCopied] = useState(false);

  const cur: PeriodFigures = period === "m" ? data.overview.m : data.overview.w;
  const isGood = cur.verdictGood;
  const isOk = cur.verdictOk;

  const waShareUrl = `https://wa.me/?text=${encodeURIComponent(data.summaryText)}`;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(data.summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header Actions (WhatsApp share, Copy, Print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 sm:pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Reports</h1>
          <p className="text-xs text-muted sm:text-sm">Is WhatsApp bringing business? One answer, then the reason, then what to do.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={waShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("secondary", "sm")}
            title="Share summary directly on WhatsApp"
          >
            <Send aria-hidden className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Share on WhatsApp</span>
          </a>
          <button
            type="button"
            onClick={copySummary}
            className={buttonClass("secondary", "sm")}
            title="Copy formatted summary"
          >
            <Copy aria-hidden className="size-3.5" />
            <span>{copied ? "Copied" : "Copy text"}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClass("secondary", "sm")}
            title="Print report"
          >
            <Printer aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Top Verdict Card */}
      <div
        className={cn(
          "rounded-card border border-line bg-panel p-4 shadow-sm transition-all sm:p-5",
          "border-l-[6px]",
          isGood
            ? "border-l-emerald-600 dark:border-l-emerald-400"
            : isOk
            ? "border-l-amber-500 dark:border-l-amber-400"
            : "border-l-rose-500 dark:border-l-rose-400",
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink sm:text-xl">{cur.verdictTitle}</h2>
          </div>
          {/* Period Toggle Switch */}
          <div className="inline-flex shrink-0 self-start rounded-control border-[1.5px] border-line bg-canvas p-[3px] sm:self-auto">
            <button
              type="button"
              onClick={() => setPeriod("m")}
              aria-pressed={period === "m"}
              className={cn(
                "inline-flex min-h-[30px] items-center rounded-[8px] px-3 text-xs font-semibold transition-all sm:min-h-[32px] sm:px-3.5 sm:text-[13px]",
                period === "m"
                  ? "bg-ink text-canvas shadow-xs -translate-y-px"
                  : "text-muted hover:text-ink hover:bg-subtle/60",
              )}
            >
              This month
            </button>
            <button
              type="button"
              onClick={() => setPeriod("w")}
              aria-pressed={period === "w"}
              className={cn(
                "inline-flex min-h-[30px] items-center rounded-[8px] px-3 text-xs font-semibold transition-all sm:min-h-[32px] sm:px-3.5 sm:text-[13px]",
                period === "w"
                  ? "bg-ink text-canvas shadow-xs -translate-y-px"
                  : "text-muted hover:text-ink hover:bg-subtle/60",
              )}
            >
              This week
            </button>
          </div>
        </div>
        <p className="mt-2.5 text-xs text-ink-2 sm:text-sm">
          You spent <b className="font-semibold text-ink">₹{Math.round(cur.cost).toLocaleString("en-IN")}</b> on messages and received{" "}
          <b className="font-semibold text-ink">₹{Math.round(cur.sales).toLocaleString("en-IN")}</b> in paid orders. Every{" "}
          <b className="font-semibold text-ink">₹1</b> spent brought back{" "}
          <b className="font-semibold text-ink">₹{cur.returnRatio.toLocaleString("en-IN")}</b> in sales.
        </p>
      </div>

      {/* 4-KPI Stat Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
          <div className="text-[12px] font-medium text-muted sm:text-xs">WhatsApp cost</div>
          <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            ₹{Math.round(cur.cost).toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] text-muted sm:text-xs">Meta message charges</div>
        </div>

        <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
          <div className="text-[12px] font-medium text-muted sm:text-xs">Paid sales</div>
          <div className="tabular mt-1 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-2xl">
            ₹{Math.round(cur.sales).toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] text-muted sm:text-xs">From customers you messaged</div>
        </div>

        <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
          <div className="text-[12px] font-medium text-muted sm:text-xs">Money waiting</div>
          <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            ₹{Math.round(cur.wait).toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] text-muted sm:text-xs">Ordered, not yet paid</div>
        </div>

        <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
          <div className="text-[12px] font-medium text-muted sm:text-xs">Return per ₹1</div>
          <div className="tabular mt-1 text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 sm:text-2xl">
            ₹{cur.returnRatio.toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] text-muted sm:text-xs">Sales, not profit</div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-line">
        <nav aria-label="Report tabs" className="no-scrollbar -mb-px flex gap-2 overflow-x-auto sm:gap-6">
          <button
            type="button"
            onClick={() => setTab("ov")}
            aria-selected={tab === "ov"}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm",
              tab === "ov"
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:border-line hover:text-ink",
            )}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("camp")}
            aria-selected={tab === "camp"}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm",
              tab === "camp"
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:border-line hover:text-ink",
            )}
          >
            Campaigns
          </button>
          <button
            type="button"
            onClick={() => setTab("cust")}
            aria-selected={tab === "cust"}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm",
              tab === "cust"
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:border-line hover:text-ink",
            )}
          >
            Customers
          </button>
          <button
            type="button"
            onClick={() => setTab("prod")}
            aria-selected={tab === "prod"}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm",
              tab === "prod"
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:border-line hover:text-ink",
            )}
          >
            Products
          </button>
        </nav>
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === "ov" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Funnel Card: From message to money */}
          <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
            <div className="mb-4">
              <h2 className="text-base font-bold text-ink sm:text-lg">From message to money</h2>
              <p className="text-xs text-muted sm:text-sm">Out of the customers you messaged, this is how far they came.</p>
            </div>
            <div className="divide-y divide-line/60">
              {cur.funnel.map((item, idx) => {
                const barColor =
                  idx === 0
                    ? "bg-slate-700 dark:bg-slate-300"
                    : idx <= 2
                    ? "bg-amber-500 dark:bg-amber-400"
                    : idx <= 4
                    ? "bg-rose-500 dark:bg-rose-400"
                    : "bg-emerald-600 dark:bg-emerald-400";
                return (
                  <div key={item.name} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-ink sm:text-sm">{item.name}</div>
                      <div className="mt-1.5 h-2 w-full max-w-lg overflow-hidden rounded-full bg-subtle">
                        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${item.pct}%` }} />
                      </div>
                      {item.sub && <div className="mt-1 text-[11px] text-muted sm:text-xs">{item.sub}</div>}
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="tabular text-sm font-bold text-ink sm:text-base">{item.value.toLocaleString("en-IN")}</div>
                      {idx > 0 && <div className="text-[11px] text-muted sm:text-xs">{item.pct} of 100 sent</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Cards: What you should do now */}
          <div>
            <h2 className="mb-3 text-sm font-bold tracking-tight text-ink sm:text-base">What you should do now</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {cur.actions.map((act) => (
                <div key={act.title} className="flex flex-col justify-between rounded-card border border-line bg-panel p-4 shadow-sm">
                  <div>
                    <div className="text-xs text-muted sm:text-[13px]">{act.title}</div>
                    <div className="tabular my-1.5 text-lg font-bold text-ink sm:text-xl">{act.value}</div>
                  </div>
                  <Link href={act.href} className={cn(buttonClass("primary", "sm"), "mt-2 self-start")}>
                    {act.action}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet & Spend Row */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {/* Wallet Card */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-ink sm:text-lg">Wallet</h2>
                <div className="flex items-center gap-2">
                  <a
                    href="https://business.facebook.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass("primary", "sm")}
                  >
                    Recharge
                  </a>
                  <a
                    href="https://business.facebook.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass("secondary", "sm")}
                  >
                    Billing on Meta
                  </a>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-xs font-medium text-muted">Balance</div>
                <div className="tabular text-2xl font-bold text-ink sm:text-3xl">
                  ₹{Math.round(data.overview.wallet.balance).toLocaleString("en-IN")}
                </div>
              </div>

              <div className="my-3 h-2.5 w-full overflow-hidden rounded-full bg-subtle">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    data.overview.wallet.isLow ? "bg-rose-500" : "bg-emerald-600 dark:bg-emerald-400",
                  )}
                  style={{ width: `${Math.min(100, Math.max(10, (data.overview.wallet.balance / 2000) * 100))}%` }}
                />
              </div>

              <p className="text-xs text-ink-2 sm:text-sm">
                <span
                  className={cn(
                    "mr-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                    data.overview.wallet.isLow
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                  )}
                >
                  {data.overview.wallet.isLow ? "Low balance" : "Healthy balance"}
                </span>
                You can send about <b className="font-semibold text-ink">{data.overview.wallet.marketingMsgsLeft.toLocaleString("en-IN")}</b> marketing
                or <b className="font-semibold text-ink">{data.overview.wallet.utilityMsgsLeft.toLocaleString("en-IN")}</b> utility messages.
              </p>
            </div>

            {/* Spend Card */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Spend</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <div className="text-xs font-medium text-muted">This month</div>
                  <div className="tabular text-lg font-bold text-ink sm:text-xl">
                    ₹{Math.round(data.overview.spend.thisMonth).toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-muted">₹{data.overview.spend.thisMonthGst.toLocaleString("en-IN")} with GST</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted">Last month</div>
                  <div className="tabular text-lg font-bold text-ink sm:text-xl">
                    ₹{Math.round(data.overview.spend.lastMonth).toLocaleString("en-IN")}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted">Free replies left</div>
                  <div className="tabular text-lg font-bold text-ink sm:text-xl">
                    {data.overview.spend.freeRepliesLeft.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] text-muted">of {data.overview.spend.freeRepliesTotal.toLocaleString("en-IN")} this month</div>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted">Return per ₹1</div>
                  <div className="tabular text-lg font-bold text-emerald-600 dark:text-emerald-400 sm:text-xl">
                    ₹{data.overview.spend.returnPerRupee.toLocaleString("en-IN")}
                  </div>
                  <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">in sales</div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Spend & Breakdown Row */}
          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-12">
            {/* Daily spend chart */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5 xl:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-ink sm:text-lg">Daily spend</h2>
                <div className="inline-flex rounded-control border-[1.5px] border-line bg-canvas p-[2px]">
                  <button
                    type="button"
                    onClick={() => setChartMode("a")}
                    aria-pressed={chartMode === "a"}
                    className={cn(
                      "rounded-[7px] px-2.5 py-1 text-xs font-semibold transition-all",
                      chartMode === "a" ? "bg-ink text-canvas shadow-xs" : "text-muted hover:text-ink",
                    )}
                  >
                    Daily ₹
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode("b")}
                    aria-pressed={chartMode === "b"}
                    className={cn(
                      "rounded-[7px] px-2.5 py-1 text-xs font-semibold transition-all",
                      chartMode === "b" ? "bg-ink text-canvas shadow-xs" : "text-muted hover:text-ink",
                    )}
                  >
                    Paid vs free
                  </button>
                </div>
              </div>

              {/* Responsive SVG Chart */}
              <div className="mt-4">
                <svg className="w-full" viewBox="0 0 640 160" preserveAspectRatio="none">
                  {/* Grid lines */}
                  {[0, 1, 2, 3].map((k) => {
                    const y = 10 + (130 * k) / 3;
                    return (
                      <line
                        key={k}
                        x1="30"
                        x2="630"
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeOpacity="0.1"
                        strokeDasharray="2,2"
                      />
                    );
                  })}
                  {/* Bars */}
                  {data.overview.daily.days.map((lb, i) => {
                    const totalDays = data.overview.daily.days.length;
                    const slotWidth = (600 - 30) / totalDays;
                    const barWidth = Math.max(6, slotWidth * 0.6);
                    const x = 35 + i * slotWidth;

                    const maxVal = Math.max(
                      1,
                      chartMode === "a"
                        ? Math.max(...data.overview.daily.marketing.map((v, idx) => v + data.overview.daily.utility[idx]))
                        : Math.max(...data.overview.daily.paid.map((v, idx) => v + data.overview.daily.free[idx])),
                    );

                    if (chartMode === "a") {
                      const mktVal = data.overview.daily.marketing[i] || 0;
                      const utVal = data.overview.daily.utility[i] || 0;
                      const mktHeight = (mktVal / maxVal) * 120;
                      const utHeight = (utVal / maxVal) * 120;

                      return (
                        <g key={lb}>
                          {/* Marketing bar */}
                          <rect
                            x={x}
                            y={140 - mktHeight - utHeight}
                            width={barWidth}
                            height={mktHeight}
                            className="fill-rose-500"
                            rx="2"
                          >
                            <title>{`Day ${lb} · Marketing: ₹${mktVal}`}</title>
                          </rect>
                          {/* Utility bar */}
                          <rect
                            x={x}
                            y={140 - utHeight}
                            width={barWidth}
                            height={utHeight}
                            className="fill-amber-500"
                            rx="2"
                          >
                            <title>{`Day ${lb} · Utility: ₹${utVal}`}</title>
                          </rect>
                          <text x={x + barWidth / 2} y={154} textAnchor="middle" className="fill-muted text-[10px]">
                            {lb}
                          </text>
                        </g>
                      );
                    } else {
                      const paidVal = data.overview.daily.paid[i] || 0;
                      const freeVal = data.overview.daily.free[i] || 0;
                      const paidHeight = (paidVal / maxVal) * 120;
                      const freeHeight = (freeVal / maxVal) * 120;

                      return (
                        <g key={lb}>
                          {/* Paid messages */}
                          <rect
                            x={x}
                            y={140 - paidHeight - freeHeight}
                            width={barWidth}
                            height={paidHeight}
                            className="fill-slate-700 dark:fill-slate-300"
                            rx="2"
                          >
                            <title>{`Day ${lb} · Paid: ${paidVal}`}</title>
                          </rect>
                          {/* Free messages */}
                          <rect
                            x={x}
                            y={140 - freeHeight}
                            width={barWidth}
                            height={freeHeight}
                            className="fill-emerald-500"
                            rx="2"
                          >
                            <title>{`Day ${lb} · Free: ${freeVal}`}</title>
                          </rect>
                          <text x={x + barWidth / 2} y={154} textAnchor="middle" className="fill-muted text-[10px]">
                            {lb}
                          </text>
                        </g>
                      );
                    }
                  })}
                </svg>
              </div>

              {/* Chart Legend */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
                {chartMode === "a" ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-rose-500" /> Marketing
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-amber-500" /> Utility
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-slate-700 dark:bg-slate-300" /> Paid
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-emerald-500" /> Free
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                Highest day: ₹{data.overview.daily.highestDay}. Cost per delivered message: ₹{data.overview.daily.costPerDelivered}.
              </p>
            </div>

            {/* Breakdown stack */}
            <div className="space-y-4 xl:col-span-5">
              {/* Where the money goes */}
              <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
                <h2 className="mb-3 text-base font-bold text-ink sm:text-lg">Where the money goes</h2>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-ink sm:text-sm">
                      <span>Marketing</span>
                      <span className="tabular">₹{data.overview.breakdown.marketing.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-rose-500" style={{ width: "75%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-ink sm:text-sm">
                      <span>Utility</span>
                      <span className="tabular">₹{data.overview.breakdown.utility.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: "25%" }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-semibold text-ink sm:text-sm">
                      <span>Service replies</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">Free</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: "100%" }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sending limit today */}
              <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
                <h2 className="text-base font-bold text-ink sm:text-lg">Sending limit today</h2>
                <p className="mt-1 text-xs text-muted">Meta lets you message a set number of new people every 24 hours.</p>

                <div className="my-3 h-2 w-full overflow-hidden rounded-full bg-subtle">
                  <div
                    className="h-full rounded-full bg-slate-700 dark:bg-slate-300"
                    style={{
                      width: `${Math.min(100, Math.round((data.overview.limits.used / Math.max(1, data.overview.limits.limit)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-ink-2">
                  <b className="font-semibold text-ink">{data.overview.limits.used}</b> of {data.overview.limits.limit} used ·{" "}
                  <b className="font-semibold text-ink">{data.overview.limits.left}</b> more allowed · a small buffer is kept for retries
                </p>
              </div>
            </div>
          </div>

          {/* How WhatsApp charges disclosure */}
          <details className="group rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-ink sm:text-base">
              <span>How WhatsApp charges, in plain words</span>
              <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3.5 space-y-2 border-t border-line/60 pt-3 text-xs text-ink-2 sm:text-sm">
              <p>Replies to a customer within 24 hours of their message are free (first 1,000 a month).</p>
              <p>Utility messages (order updates, tracking) cost less than marketing messages (promotions, offers).</p>
              <p>Replies to customers who came from your ads or Facebook page are free for 72 hours.</p>
              <p>You pay only for messages that are delivered to customer phones, never for failed sends.</p>
              <div className="rounded-card bg-subtle p-3 text-xs text-ink">
                <b className="font-semibold text-ink">Save money:</b> send offers to people who recently replied, and keep order updates as utility messages.
              </div>
            </div>
          </details>
        </div>
      )}

      {/* TAB 2: CAMPAIGNS */}
      {tab === "camp" && (
        <div className="space-y-4 sm:space-y-6">
          <div>
            <p className="text-xs text-muted sm:text-sm">Which broadcast worked best? Sorted by money back for every ₹1 spent.</p>
          </div>

          {/* Campaign Table */}
          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle/50 text-[11px] font-bold uppercase tracking-wider text-muted sm:text-xs">
                    <th className="px-3.5 py-2.5 sm:px-4 sm:py-3">Campaign</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Sent</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Read</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Replies</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Paid orders</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Spent</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Sales</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Back per ₹1</th>
                    <th className="px-3.5 py-2.5 sm:px-4 sm:py-3">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.campaigns.campaigns.length ? (
                    data.campaigns.campaigns.map((c) => (
                      <tr key={c.id} className="hover:bg-subtle/40">
                        <td className="px-3.5 py-3 font-semibold text-ink sm:px-4">
                          <div>{c.name}</div>
                          <div className="text-[11px] font-normal text-muted">{c.template}</div>
                        </td>
                        <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{c.sent.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{c.read.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{c.replies.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{c.paidOrders.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">₹{c.spent.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-bold text-ink sm:px-4">₹{c.sales.toLocaleString("en-IN")}</td>
                        <td className="tabular px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400 sm:px-4">
                          ₹{c.returnRatio.toLocaleString("en-IN")}
                        </td>
                        <td className="px-3.5 py-3 sm:px-4">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                              c.verdict === "ok"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : c.verdict === "warn"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                            )}
                          >
                            {c.verdictLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted">
                        No broadcast campaigns run yet. Create a campaign to start tracking returns.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Cards: Best Day/Time & What to Repeat */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {/* Best day and time */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Best day and time</h2>
              <p className="mt-1 text-xs text-muted">Based on when your customers read and replied.</p>
              <div className="mt-4 divide-y divide-line/60">
                {data.campaigns.bestTimes.map((bt) => (
                  <div key={bt.slot} className="flex items-center justify-between py-2.5">
                    <span className="text-xs font-semibold text-ink sm:text-sm">{bt.slot}</span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        bt.badgeType === "ok"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : bt.badgeType === "warn"
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                      )}
                    >
                      {bt.badge}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* What to repeat */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">What to repeat</h2>
              <div className="mt-4 divide-y divide-line/60">
                {data.campaigns.whatToRepeat.map((rpt) => (
                  <div key={rpt.title} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-xs font-semibold text-ink sm:text-sm">{rpt.title}</span>
                    {rpt.isPill ? (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                        {rpt.actionText}
                      </span>
                    ) : (
                      <Link href={rpt.actionHref || "/dashboard/campaigns/new"} className={buttonClass("secondary", "sm")}>
                        {rpt.actionText}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOMERS */}
      {tab === "cust" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Top 4 Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
              <div className="text-[12px] font-medium text-muted sm:text-xs">Bought this month</div>
              <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {data.customers.boughtThisMonth.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 sm:text-xs">
                {data.customers.boughtDiff}
              </div>
            </div>

            <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
              <div className="text-[12px] font-medium text-muted sm:text-xs">New customers</div>
              <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {data.customers.newCustomers.toLocaleString("en-IN")}
              </div>
            </div>

            <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
              <div className="text-[12px] font-medium text-muted sm:text-xs">Came back</div>
              <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {data.customers.cameBack.toLocaleString("en-IN")}
              </div>
              <div className="mt-1 text-[11px] text-muted sm:text-xs">{data.customers.repeatRatioLabel}</div>
            </div>

            <div className="rounded-card border border-line bg-panel p-3.5 shadow-sm sm:p-4">
              <div className="text-[12px] font-medium text-muted sm:text-xs">Have not bought in 60 days</div>
              <div className="tabular mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {data.customers.lapsed60Days.toLocaleString("en-IN")}
              </div>
            </div>
          </div>

          {/* Bottom Cards: Who needs follow-up & Locations */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {/* Who needs a follow-up */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Who needs a follow-up</h2>
              <p className="mt-1 text-xs text-muted">Each group has a message ready.</p>
              <div className="mt-4 divide-y divide-line/60">
                {data.customers.followUps.map((fu) => (
                  <div key={fu.title} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <div className="text-xs font-semibold text-ink sm:text-sm">{fu.title}</div>
                      <div className="text-[11px] text-muted sm:text-xs">{fu.sub}</div>
                    </div>
                    <Link href={fu.href} className={buttonClass("secondary", "sm")}>
                      {fu.action}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Where your customers are */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Where your customers are</h2>
              <div className="mt-4 space-y-3">
                {data.customers.locations.map((loc) => (
                  <div key={loc.name}>
                    <div className="flex items-center justify-between text-xs font-semibold text-ink sm:text-sm">
                      <span>{loc.name}</span>
                      <span className="tabular">{loc.count.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-slate-700 dark:bg-slate-300" style={{ width: `${loc.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">{data.customers.topLocationInsight}</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRODUCTS */}
      {tab === "prod" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Product Demand & Sales Table */}
          <div className="overflow-hidden rounded-card border border-line bg-panel shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle/50 text-[11px] font-bold uppercase tracking-wider text-muted sm:text-xs">
                    <th className="px-3.5 py-2.5 sm:px-4 sm:py-3">Product</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Sold</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Sales</th>
                    <th className="tabular px-3 py-2.5 text-right sm:px-4 sm:py-3">Left in carts</th>
                    <th className="px-3.5 py-2.5 sm:px-4 sm:py-3">What to do</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.products.products.map((p) => (
                    <tr key={p.name} className="hover:bg-subtle/40">
                      <td className="px-3.5 py-3 font-semibold text-ink sm:px-4">{p.name}</td>
                      <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{p.sold.toLocaleString("en-IN")}</td>
                      <td className="tabular px-3 py-3 text-right font-bold text-ink sm:px-4">₹{p.sales.toLocaleString("en-IN")}</td>
                      <td className="tabular px-3 py-3 text-right font-medium text-ink sm:px-4">{p.leftInCarts.toLocaleString("en-IN")}</td>
                      <td className="px-3.5 py-3 sm:px-4">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
                            p.pillType === "ok"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : p.pillType === "warn"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : p.pillType === "mute"
                              ? "bg-subtle text-muted"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
                          )}
                        >
                          {p.action}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Cards: Stuck in carts & Worth promoting */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
            {/* Stuck in carts */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Stuck in carts</h2>
              <p className="mt-1 text-xs text-muted">
                Customers added these and did not pay. Worth ₹{data.products.stuckInCarts.totalWaiting.toLocaleString("en-IN")} in total.
              </p>
              <div className="mt-4 divide-y divide-line/60">
                {data.products.stuckInCarts.items.length ? (
                  data.products.stuckInCarts.items.map((it) => (
                    <div key={it.text} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-xs font-semibold text-ink sm:text-sm">{it.text}</span>
                      <Link href={it.href} className={buttonClass("secondary", "sm")}>
                        Chase payment
                      </Link>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-xs text-muted sm:text-sm">No items currently stuck in unpaid carts.</p>
                )}
              </div>
            </div>

            {/* Worth promoting */}
            <div className="rounded-card border border-line bg-panel p-4 shadow-sm sm:p-5">
              <h2 className="text-base font-bold text-ink sm:text-lg">Worth promoting</h2>
              <div className="mt-4 divide-y divide-line/60">
                {data.products.worthPromoting.map((wp) => (
                  <div key={wp.title} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold text-ink sm:text-sm">{wp.title}</div>
                      <div className="text-[11px] text-muted sm:text-xs">{wp.desc}</div>
                    </div>
                    <Link
                      href={wp.actionHref}
                      className={cn(buttonClass(wp.primary ? "primary" : "secondary", "sm"), "self-start sm:self-auto")}
                    >
                      {wp.actionText}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
