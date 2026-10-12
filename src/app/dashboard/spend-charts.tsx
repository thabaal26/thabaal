"use client";

import { useState } from "react";
import { ExternalLink, Lightbulb } from "@/components/icons";
import { UsageGauge } from "@/components/charts";
import { Badge, buttonClass } from "@/components/ui";
import { ColumnChart, DonutPanel, StackedRows, type Column, type Slice, type StackRow } from "@/components/viz";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import type { DailySpendPoint, SpendRow } from "@/lib/spend";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ChartTab = "spend" | "volume" | "compare";

export type SpendChartsProps = {
  monthLabel: string;
  lastMonthLabel: string;
  totalMonthSpent: number;
  totalMonthSpentWithGst: number;
  totalLastMonthSpent: number;
  remainingBalance: number;
  recorded: boolean;
  low: boolean;
  accountName: string;
  billingUrl: string;
  lastSyncedLabel: string;
  estMarketingRunway: number;
  estUtilityRunway: number;
  current: SpendRow[];
  previous: SpendRow[];
  daily: DailySpendPoint[];
  rates: Record<string, number>;
  categoryLabels: Record<string, string>;
  monthOrdersCount: number;
  monthOrderRevenue: number;
};

export function SpendAnalyticsCharts({
  monthLabel,
  lastMonthLabel,
  totalMonthSpent,
  totalMonthSpentWithGst,
  remainingBalance,
  recorded,
  low,
  accountName,
  billingUrl,
  lastSyncedLabel,
  estMarketingRunway,
  estUtilityRunway,
  current,
  previous,
  daily,
  rates,
  categoryLabels,
  monthOrdersCount,
  monthOrderRevenue,
}: SpendChartsProps) {
  const [tab, setTab] = useState<ChartTab>("spend");
  const [activeDay, setActiveDay] = useState<string | null>(null);

  // Build Donut slices for current month spend by category
  const catOrder = ["marketing", "utility", "authentication", "service"] as const;
  const catColors = {
    marketing: "gold",
    utility: "blue",
    authentication: "violet",
    service: "emerald",
  } as const;

  const slices: Slice[] = catOrder.flatMap((cat) => {
    const row = current.find((r) => r.category === cat);
    const charged = row?.charged ?? 0;
    const free = row?.free ?? 0;
    const cost = Math.round((row?.cost ?? 0) * 100) / 100;
    const keep = cost > 0 || charged > 0 || free > 0 || cat === "marketing" || cat === "utility";
    if (!keep) return [];
    const rate = rates[cat];
    const subParts: string[] = [];
    if (charged > 0) subParts.push(`${fmtNumber(charged)} charged`);
    if (free > 0) subParts.push(`${fmtNumber(free)} free (24h)`);
    if (rate) subParts.push(`₹${rate}/msg`);
    else if (cat === "service") subParts.push("₹0/msg");
    return [
      {
        key: cat,
        label: categoryLabels[cat] ?? cat,
        value: cost,
        color: catColors[cat],
        sub: subParts.join(" · ") || "No messages this month",
      },
    ];
  });

  // Build 14-day Daily Spend columns for Apache ECharts ColumnChart
  const spendColumns: Column[] = daily.map((d) => ({
    key: d.key,
    label: d.label,
    sub: d.sub,
    highlight: d.totalCost > 0 && d.totalCost === Math.max(...daily.map((x) => x.totalCost)),
    tip: `${fmtNumber(d.chargedVolume)} paid msg${d.chargedVolume === 1 ? "" : "s"}${d.freeVolume > 0 ? ` · ${fmtNumber(d.freeVolume)} free` : ""}`,
    parts: [
      { key: "marketing", label: "Marketing", value: d.marketingCost, color: "gold" },
      { key: "utility", label: "Utility", value: d.utilityCost, color: "blue" },
      ...(d.authCost > 0 ? [{ key: "auth", label: "Authentication", value: d.authCost, color: "violet" as const }] : []),
    ],
  }));

  // Build 14-day Paid vs Free message volume columns for Apache ECharts ColumnChart
  const volumeColumns: Column[] = daily.map((d) => ({
    key: d.key,
    label: d.label,
    sub: d.sub,
    highlight: d.chargedVolume + d.freeVolume > 0 && d.chargedVolume + d.freeVolume === Math.max(...daily.map((x) => x.chargedVolume + x.freeVolume)),
    tip: d.totalCost > 0 ? `Day spend: ${rupees(d.totalCost)} ex-GST` : "₹0.00 spend",
    parts: [
      { key: "charged", label: "Charged messages", value: d.chargedVolume, color: "gold" },
      { key: "free", label: "Free 24h window", value: d.freeVolume, color: "emerald" },
    ],
  }));

  // Build Month-over-Month category comparison rows for Apache ECharts StackedRows
  const compareRows: StackRow[] = (["marketing", "utility", "authentication"] as const).flatMap((cat) => {
    const curRow = current.find((r) => r.category === cat);
    const prevRow = previous.find((r) => r.category === cat);
    const curCost = Math.round((curRow?.cost ?? 0) * 100) / 100;
    const prevCost = Math.round((prevRow?.cost ?? 0) * 100) / 100;
    const keep = curCost > 0 || prevCost > 0 || cat === "marketing" || cat === "utility";
    if (!keep) return [];
    const curMsgs = curRow?.charged ?? 0;
    const prevMsgs = prevRow?.charged ?? 0;
    return [
      {
        key: cat,
        label: categoryLabels[cat] ?? cat,
        dot: catColors[cat],
        right: `${rupees(curCost)} vs ${rupees(prevCost)}`,
        parts: [
          { key: "cur", label: `${monthLabel} (${fmtNumber(curMsgs)} msgs)`, value: curCost, color: catColors[cat] },
          { key: "prev", label: `${lastMonthLabel} (${fmtNumber(prevMsgs)} msgs)`, value: prevCost, color: "neutral" as const },
        ],
      },
    ];
  });

  // Analytical summary metrics
  const totalCharged = current.reduce((s, r) => s + r.charged, 0);
  const totalFree = current.reduce((s, r) => s + r.free, 0);
  const totalMsgs = totalCharged + totalFree;
  const effectiveCostPerMsg = totalMsgs > 0 ? totalMonthSpent / totalMsgs : 0;
  const savedByFreeWindow = totalFree * (rates.marketing ?? 0.8631);
  const peakDay = daily.reduce((best, d) => (d.totalCost > best.totalCost ? d : best), daily[0] ?? { label: "—", totalCost: 0, chargedVolume: 0 });
  const selectedDay = activeDay ? daily.find((d) => d.key === activeDay) : null;
  const roas = totalMonthSpentWithGst > 0 && monthOrderRevenue > 0 ? Math.round((monthOrderRevenue / totalMonthSpentWithGst) * 10) / 10 : 0;

  return (
    <div className="grid grid-cols-1 divide-y divide-line lg:grid-cols-12 lg:divide-x lg:divide-y-0">
      {/* Left Column: Prepaid Wallet Gauge + Category Spend Apache ECharts Donut */}
      <div className="space-y-3.5 p-3 sm:space-y-4 sm:p-5 lg:col-span-5">
        {/* Prepaid Wallet & Runway Gauge */}
        <div className={cn("rounded-control border p-3 sm:p-3.5", low ? "border-warning-border bg-warning-bg/70" : "border-line bg-subtle/50")}>
          {recorded ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="text-[11px] font-medium text-ink-2 sm:text-xs">
                  Prepaid wallet · {lastSyncedLabel}
                </p>
                {low ? (
                  <Badge tone="amber" dot>
                    Low balance · Top up soon
                  </Badge>
                ) : (
                  <Badge tone="green">~{fmtNumber(estMarketingRunway)} mktg msgs left</Badge>
                )}
              </div>

              <div className="mt-2.5 flex items-center gap-3 sm:gap-4">
                <UsageGauge
                  value={Math.min(remainingBalance, 500)}
                  max={500}
                  full={low}
                  size={84}
                  label={`Prepaid wallet balance ${rupees(remainingBalance)}`}
                >
                  <span className="tabular text-xs font-semibold leading-none text-ink">~{fmtNumber(estMarketingRunway)}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-muted">mktg left</span>
                </UsageGauge>

                <div className="min-w-0 flex-1">
                  <p className="tabular text-xl font-semibold leading-tight text-ink sm:text-2xl">{rupees(remainingBalance)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted sm:text-xs">{accountName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded-md border border-line/80 bg-panel/80 px-2 py-1">
                      <span className="block text-[10px] text-muted">Marketing cap.</span>
                      <span className="tabular font-semibold text-ink">~{fmtNumber(estMarketingRunway)} msgs</span>
                    </div>
                    <div className="rounded-md border border-line/80 bg-panel/80 px-2 py-1">
                      <span className="block text-[10px] text-muted">Utility cap.</span>
                      <span className="tabular font-semibold text-ink">~{fmtNumber(estUtilityRunway)} msgs</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-ink-2">Prepaid balance</p>
              <p className="mt-1 text-xs text-muted">No balance is recorded for this WhatsApp account yet. Sync it below or open Meta&apos;s Billing Hub.</p>
            </>
          )}
          <a href={billingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClass(low ? "primary" : "secondary", "sm"), "mt-2.5 w-full sm:mt-3")}>
            Recharge on Meta <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens Meta Business Suite)</span>
          </a>
        </div>

        {/* Apache ECharts DonutPanel: Month Spend Breakdown by Category */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted sm:text-xs">{monthLabel} spend share (ECharts)</p>
            <span className="tabular text-[11px] text-muted">{fmtNumber(totalCharged)} charged · {fmtNumber(totalFree)} free</span>
          </div>
          <DonutPanel
            slices={slices}
            format="inr"
            size={152}
            centerValue={rupees(totalMonthSpent)}
            centerLabel={`${monthLabel} ex-GST`}
            label={`${monthLabel} spend by category: total ${rupees(totalMonthSpent)}`}
          />
        </div>
      </div>

      {/* Right Column: Interactive Apache ECharts Time-Series & Category Analysis */}
      <div className=" flex flex-col justify-between space-y-3.5 p-3 sm:space-y-4 sm:p-5 lg:col-span-7">
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-ink sm:text-sm">
                {tab === "spend"
                  ? "Daily Meta spend breakdown (last 14 days)"
                  : tab === "volume"
                    ? "Daily paid vs. free 24h window messages"
                    : `${monthLabel} vs ${lastMonthLabel} category comparison`}
              </p>
              <p className="text-[11px] text-muted sm:text-xs">
                {tab === "spend"
                  ? "Marketing (₹0.8631) vs Utility (₹0.115) daily cost · tap any bar to inspect"
                  : tab === "volume"
                    ? "Charged templates vs free service replies sent within 24 hours"
                    : "Category spend comparison across current and previous month"}
              </p>
            </div>

            {/* Mode Switcher Pills — wrapping, zero horizontal scroll */}
            <div role="tablist" aria-label="Spend chart view" className="inline-flex flex-wrap gap-1 self-start rounded-control bg-sunken p-0.5 sm:p-1">
              {(
                [
                  { id: "spend", label: "Daily ₹" },
                  { id: "volume", label: "Paid vs Free" },
                  { id: "compare", label: "Vs last mo" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "min-h-7 rounded-[calc(var(--radius-control)-3px)] px-2.5 text-[11px] font-medium transition sm:min-h-7 sm:px-3 sm:text-xs",
                    tab === t.id ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            {tab === "spend" && (
              <ColumnChart
                columns={spendColumns}
                format="inr"
                height={156}
                activeKey={activeDay}
                onColumnClick={(k) => setActiveDay((prev) => (prev === k ? null : k))}
                legend={[
                  { label: "Marketing (₹0.8631/msg)", color: "gold" },
                  { label: "Utility (₹0.115/msg)", color: "blue" },
                ]}
                label="Daily Meta WhatsApp spend over the last 14 days"
              />
            )}

            {tab === "volume" && (
              <ColumnChart
                columns={volumeColumns}
                format="count"
                height={156}
                activeKey={activeDay}
                onColumnClick={(k) => setActiveDay((prev) => (prev === k ? null : k))}
                legend={[
                  { label: "Charged messages", color: "gold" },
                  { label: "Free 24h service window (₹0)", color: "emerald" },
                ]}
                label="Daily charged vs free WhatsApp messages over the last 14 days"
              />
            )}

            {tab === "compare" && (
              <div className="py-1">
                <StackedRows
                  rows={compareRows}
                  format="inr"
                  legend={[
                    { label: monthLabel, color: "gold" },
                    { label: lastMonthLabel, color: "neutral" },
                  ]}
                  label={`${monthLabel} vs ${lastMonthLabel} spend by category`}
                />
              </div>
            )}
          </div>

          {/* Selected Day Inspector Pill (when user taps a column in Daily ₹ or Paid vs Free) */}
          {selectedDay && (tab === "spend" || tab === "volume") && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-subtle/60 px-3 py-1.5 text-xs">
              <span className="font-medium text-ink">
                {selectedDay.sub}, {selectedDay.label}: <b className="tabular">{rupees(selectedDay.totalCost)}</b> ex-GST
              </span>
              <span className="tabular text-muted">
                Mktg {rupees(selectedDay.marketingCost)} · Util {rupees(selectedDay.utilityCost)} · {fmtNumber(selectedDay.chargedVolume)} paid / {fmtNumber(selectedDay.freeVolume)} free
              </span>
            </div>
          )}
        </div>

        {/* Bottom Analytical KPI Strip + Actionable Optimization Insight */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-control border border-line bg-subtle/35 px-2.5 py-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">Peak day spend</p>
              <p className="tabular mt-0.5 text-xs font-semibold text-ink sm:text-sm">
                {peakDay && peakDay.totalCost > 0 ? rupees(peakDay.totalCost) : "₹0.00"}
              </p>
              <p className="truncate text-[10px] text-muted">{peakDay && peakDay.totalCost > 0 ? `${peakDay.label} · ${peakDay.chargedVolume} msgs` : "No charges in 14d"}</p>
            </div>

            <div className="rounded-control border border-line bg-subtle/35 px-2.5 py-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">Effective rate</p>
              <p className="tabular mt-0.5 text-xs font-semibold text-ink sm:text-sm">
                {totalMsgs > 0 ? rupees(effectiveCostPerMsg) : `₹${rates.marketing ?? 0.86}`}
              </p>
              <p className="truncate text-[10px] text-muted">per msg ({fmtNumber(totalMsgs)} total)</p>
            </div>

            <div className="rounded-control border border-line bg-subtle/35 px-2.5 py-2">
              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">
                {roas > 0 ? "Meta spend ROAS" : "24h window saved"}
              </p>
              <p className="tabular mt-0.5 text-xs font-semibold text-success sm:text-sm">
                {roas > 0 ? `${roas}× return` : rupees(savedByFreeWindow)}
              </p>
              <p className="truncate text-[10px] text-muted">
                {roas > 0 ? `₹${monthOrderRevenue.toLocaleString("en-IN")} (${monthOrdersCount} orders)` : `${fmtNumber(totalFree)} free service msgs`}
              </p>
            </div>
          </div>

          <div className="rounded-control border border-brand/25 bg-brand-soft/35 p-2.5 text-xs text-ink-2 sm:p-3">
            <p className="flex items-center gap-1.5 font-semibold text-brand-deep">
              <Lightbulb aria-hidden className="size-3.5 shrink-0" /> Meta cost & conversion tip
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed sm:text-xs">
              {totalFree > 0 ? (
                <>
                  You sent <b>{fmtNumber(totalFree)} free service messages</b> inside the 24-hour customer reply window, saving ~<b>{rupees(savedByFreeWindow)}</b>.{" "}
                </>
              ) : null}
              Utility templates (order &amp; payment updates) cost <b>₹{rates.utility}/msg</b> — <b>7.5× cheaper</b> than marketing broadcasts (<b>₹{rates.marketing}/msg</b>). Send catalogues &amp; payment links as soon as a customer replies so the 24-hour service window stays free!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
