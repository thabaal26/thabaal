"use client";

import { useState } from "react";
import { Lightbulb } from "@/components/icons";
import { UsageGauge } from "@/components/charts";
import { Badge } from "@/components/ui";
import { ColumnChart, DonutPanel, StackedRows, type Column, type Slice, type StackRow } from "@/components/viz";
import { cn } from "@/lib/cn";
import { MetaRecharge } from "@/components/meta-recharge";
import { fmtNumber } from "@/lib/format";
import type { DailySpendPoint, ServiceQuotaInfo, SpendRow } from "@/lib/spend";
import { useLanguage } from "@/lib/i18n/context";

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
  serviceQuota: ServiceQuotaInfo;
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
  serviceQuota,
  rates,
  categoryLabels,
  monthOrdersCount,
  monthOrderRevenue,
}: SpendChartsProps) {
  const { isTa } = useLanguage();
  const [tab, setTab] = useState<ChartTab>("spend");
  const [activeDay, setActiveDay] = useState<string | null>(null);

  const catLabelsTa: Record<string, string> = {
    marketing: "விளம்பரம்",
    utility: "பயன்பாடு",
    authentication: "அங்கீகாரம்",
    service: "வாடிக்கையாளர் சேவை",
  };

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
    const keep = cost > 0 || charged > 0 || free > 0 || cat === "marketing" || cat === "utility" || cat === "service";
    if (!keep) return [];
    const rate = rates[cat];
    const subParts: string[] = [];
    if (cat === "service") {
      subParts.push(isTa ? `${fmtNumber(serviceQuota.freeUsed)}/${fmtNumber(serviceQuota.totalFreeLimit)} இலவசம்` : `${fmtNumber(serviceQuota.freeUsed)}/${fmtNumber(serviceQuota.totalFreeLimit)} free`);
      if (charged > 0) subParts.push(isTa ? `${fmtNumber(charged)} கூடுதல் @ ₹${rate}` : `${fmtNumber(charged)} overage @ ₹${rate}`);
      else subParts.push(isTa ? "மாதம் 1,000 இலவசம்" : "1,000/mo free");
    } else {
      if (charged > 0) subParts.push(isTa ? `${fmtNumber(charged)} கட்டணம்` : `${fmtNumber(charged)} charged`);
      if (free > 0) subParts.push(isTa ? `${fmtNumber(free)} இலவசம் (72h CTWA)` : `${fmtNumber(free)} free (72h CTWA)`);
      if (rate) subParts.push(isTa ? `₹${rate}/செய்தி` : `₹${rate}/msg`);
    }
    return [
      {
        key: cat,
        label: isTa ? (catLabelsTa[cat] ?? categoryLabels[cat] ?? cat) : (categoryLabels[cat] ?? cat),
        value: cost,
        color: catColors[cat],
        sub: subParts.join(" · ") || (isTa ? "இந்த மாதம் செய்திகள் இல்லை" : "No messages this month"),
      },
    ];
  });

  // Build 14-day Daily Spend columns for Apache ECharts ColumnChart
  const spendColumns: Column[] = daily.map((d) => ({
    key: d.key,
    label: d.label,
    sub: d.sub,
    highlight: d.totalCost > 0 && d.totalCost === Math.max(...daily.map((x) => x.totalCost)),
    tip: `${fmtNumber(d.chargedVolume)} ${isTa ? "கட்டண செய்தி" : "paid msg"}${d.chargedVolume === 1 ? "" : isTa ? "கள்" : "s"}${d.freeVolume > 0 ? ` · ${fmtNumber(d.freeVolume)} ${isTa ? "இலவசம்" : "free"}` : ""}`,
    parts: [
      { key: "marketing", label: isTa ? "விளம்பரம்" : "Marketing", value: d.marketingCost, color: "gold" },
      { key: "utility", label: isTa ? "பயன்பாடு" : "Utility", value: d.utilityCost, color: "blue" },
      ...(d.authCost > 0 ? [{ key: "auth", label: isTa ? "அங்கீகாரம்" : "Authentication", value: d.authCost, color: "violet" as const }] : []),
      ...(d.serviceCost > 0 ? [{ key: "service", label: isTa ? "வாடிக்கையாளர் சேவை (>1k)" : "Service (>1k quota)", value: d.serviceCost, color: "emerald" as const }] : []),
    ],
  }));

  // Build 14-day Paid vs Free message volume columns for Apache ECharts ColumnChart
  const volumeColumns: Column[] = daily.map((d) => ({
    key: d.key,
    label: d.label,
    sub: d.sub,
    highlight: d.chargedVolume + d.freeVolume > 0 && d.chargedVolume + d.freeVolume === Math.max(...daily.map((x) => x.chargedVolume + x.freeVolume)),
    tip: d.totalCost > 0 ? (isTa ? `நாள் செலவு: ${rupees(d.totalCost)} (GST தவிர)` : `Day spend: ${rupees(d.totalCost)} ex-GST`) : (isTa ? "₹0.00 செலவு" : "₹0.00 spend"),
    parts: [
      { key: "charged", label: isTa ? "கட்டண செய்திகள்" : "Charged messages", value: d.chargedVolume, color: "gold" },
      { key: "free", label: isTa ? "இலவச 24h சாளரம்" : "Free 24h window", value: d.freeVolume, color: "emerald" },
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
                  {isTa ? "ப்ரீபெய்ட் வாலட்" : "Prepaid wallet"} · {lastSyncedLabel}
                </p>
                {low ? (
                  <Badge tone="amber" dot>
                    {isTa ? "குறைந்த இருப்பு · விரைவில் ரீசார்ஜ் செய்யவும்" : "Low balance · Top up soon"}
                  </Badge>
                ) : (
                  <Badge tone="green">
                    {isTa ? `~${fmtNumber(estMarketingRunway)} விளம்பர செய்தி இருப்பு` : `~${fmtNumber(estMarketingRunway)} mktg msgs left`}
                  </Badge>
                )}
              </div>

              <div className="mt-2.5 flex items-center gap-3 sm:gap-4">
                <UsageGauge
                  value={Math.min(remainingBalance, 500)}
                  max={500}
                  full={low}
                  size={84}
                  label={isTa ? `ப்ரீபெய்ட் வாலட் இருப்பு ${rupees(remainingBalance)}` : `Prepaid wallet balance ${rupees(remainingBalance)}`}
                >
                  <span className="tabular text-xs font-semibold leading-none text-ink">~{fmtNumber(estMarketingRunway)}</span>
                  <span className="mt-0.5 text-[9px] font-medium text-muted">{isTa ? "விளம்பரம்" : "mktg left"}</span>
                </UsageGauge>

                <div className="min-w-0 flex-1">
                  <p className="tabular text-xl font-semibold leading-tight text-ink sm:text-2xl">{rupees(remainingBalance)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted sm:text-xs">{accountName}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="rounded-md border border-line/80 bg-panel/80 px-2 py-1">
                      <span className="block text-[10px] text-muted">{isTa ? "விளம்பர வரம்பு" : "Marketing cap."}</span>
                      <span className="tabular font-semibold text-ink">~{fmtNumber(estMarketingRunway)} {isTa ? "செய்திகள்" : "msgs"}</span>
                    </div>
                    <div className="rounded-md border border-line/80 bg-panel/80 px-2 py-1">
                      <span className="block text-[10px] text-muted">{isTa ? "பயன்பாட்டு வரம்பு" : "Utility cap."}</span>
                      <span className="tabular font-semibold text-ink">~{fmtNumber(estUtilityRunway)} {isTa ? "செய்திகள்" : "msgs"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-ink-2">{isTa ? "ப்ரீபெய்ட் இருப்பு" : "Prepaid balance"}</p>
              <p className="mt-1 text-xs text-muted">
                {isTa
                  ? "இந்த WhatsApp கணக்கிற்கு இன்னும் இருப்பு பதிவு செய்யப்படவில்லை. கீழே இணைக்கவும் அல்லது Meta-வின் கட்டண மையத்தைத் திறக்கவும்."
                  : "No balance is recorded for this WhatsApp account yet. Sync it below or open Meta's Billing Hub."}
              </p>
            </>
          )}
          <MetaRecharge billingUrl={billingUrl} primary={low} />
        </div>

        {/* Apache ECharts DonutPanel: Month Spend Breakdown by Category */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted sm:text-xs">
              {monthLabel} {isTa ? "செலவுப் பகிர்வு (ECharts)" : "spend share (ECharts)"}
            </p>
            <span className="tabular text-[11px] text-muted">
              {fmtNumber(totalCharged)} {isTa ? "கட்டணம்" : "charged"} · {fmtNumber(totalFree)} {isTa ? "இலவசம்" : "free"}
            </span>
          </div>
          <DonutPanel
            slices={slices}
            format="inr"
            size={152}
            centerValue={rupees(totalMonthSpent)}
            centerLabel={`${monthLabel} ${isTa ? "(GST தவிர)" : "ex-GST"}`}
            label={`${monthLabel} ${isTa ? "வகை வாரியான செலவு: மொத்தம்" : "spend by category: total"} ${rupees(totalMonthSpent)}`}
          />
        </div>

        {/* Meta 1,000 Free Service Messages / Month Quota Tracker */}
        <div className="rounded-control border border-emerald-500/25 bg-emerald-500/[0.06] p-2.5 sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold text-ink sm:text-xs">
              {isTa ? "இலவச சேவை வரம்பு (மாதம் 1,000/எண்)" : "Free Service Quota (1,000/mo per number)"}
            </span>
            <Badge tone={serviceQuota.freeRemaining > 150 ? "green" : "amber"}>
              {fmtNumber(serviceQuota.freeRemaining)} {isTa ? "இலவசம் மீதம்" : "free left"}
            </Badge>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{
                width: `${Math.min(100, Math.round((serviceQuota.freeUsed / Math.max(1, serviceQuota.totalFreeLimit)) * 100))}%`,
              }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted sm:text-[11px]">
            <span className="tabular">
              <b className="text-ink">{fmtNumber(serviceQuota.freeUsed)}</b> / {fmtNumber(serviceQuota.totalFreeLimit)}{" "}
              {isTa ? "இலவச 24h பதில்கள்" : "free 24h replies used"} ({serviceQuota.phoneCount} {isTa ? "எண்" : serviceQuota.phoneCount === 1 ? "number" : "numbers"})
            </span>
            <span className="tabular">
              {serviceQuota.overQuotaCharged > 0
                ? `${fmtNumber(serviceQuota.overQuotaCharged)} ${isTa ? "கூடுதல்" : "overage"} (${rupees(serviceQuota.overQuotaCharged * serviceQuota.rateAfterQuota)})`
                : isTa ? `பிறகு ₹${serviceQuota.rateAfterQuota}/செய்தி` : `Then ₹${serviceQuota.rateAfterQuota}/msg`}
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Interactive Apache ECharts Time-Series & Category Analysis */}
      <div className=" flex flex-col justify-between space-y-3.5 p-3 sm:space-y-4 sm:p-5 lg:col-span-7">
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-ink sm:text-sm">
                {tab === "spend"
                  ? (isTa ? "தினசரி Meta செலவு (கடந்த 14 நாட்கள்)" : "Daily Meta spend breakdown (last 14 days)")
                  : tab === "volume"
                    ? (isTa ? "தினசரி கட்டணம் vs. இலவச 24h சாளர செய்திகள்" : "Daily paid vs. free 24h window messages")
                    : (isTa ? `${monthLabel} vs ${lastMonthLabel} வகை ஒப்பீடு` : `${monthLabel} vs ${lastMonthLabel} category comparison`)}
              </p>
              <p className="text-[11px] text-muted sm:text-xs">
                {tab === "spend"
                  ? (isTa ? "விளம்பரம் (₹0.8631) vs பயன்பாடு (₹0.115) தினசரி செலவு" : "Marketing (₹0.8631) vs Utility (₹0.115) daily cost · tap any bar to inspect")
                  : tab === "volume"
                    ? (isTa ? "கட்டண டெம்ப்ளேட்கள் vs இலவச சேவை பதில்கள் (மாதம் 1,000/எண்)" : "Charged templates vs free service replies (1,000/mo free per number)")
                    : (isTa ? "நடப்பு மற்றும் முந்தைய மாதத்திற்கான வகை வாரியான செலவு ஒப்பீடு" : "Category spend comparison across current and previous month")}
              </p>
            </div>

            {/* Mode Switcher Pills — wrapping, zero horizontal scroll */}
            <div role="tablist" aria-label="Spend chart view" className="inline-flex flex-wrap gap-1 self-start rounded-control bg-sunken p-0.5 sm:p-1">
              {(
                [
                  { id: "spend", label: isTa ? "தினசரி ₹" : "Daily ₹" },
                  { id: "volume", label: isTa ? "கட்டணம் vs இலவசம்" : "Paid vs Free" },
                  { id: "compare", label: isTa ? "கடந்த மாத ஒப்பீடு" : "Vs last mo" },
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
                  { label: isTa ? "விளம்பரம் (₹0.8631/செய்தி)" : "Marketing (₹0.8631/msg)", color: "gold" },
                  { label: isTa ? "பயன்பாடு (₹0.115/செய்தி)" : "Utility (₹0.115/msg)", color: "blue" },
                ]}
                label={isTa ? "கடந்த 14 நாட்களின் தினசரி Meta WhatsApp செலவு" : "Daily Meta WhatsApp spend over the last 14 days"}
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
                  { label: isTa ? "கட்டண செய்திகள்" : "Charged messages", color: "gold" },
                  { label: isTa ? "இலவச 24h சேவை / 72h CTWA (₹0)" : "Free 24h service / 72h CTWA (₹0)", color: "emerald" },
                ]}
                label={isTa ? "கடந்த 14 நாட்களின் தினசரி கட்டணம் மற்றும் இலவச செய்திகள்" : "Daily charged vs free WhatsApp messages over the last 14 days"}
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
                  label={`${monthLabel} vs ${lastMonthLabel} ${isTa ? "வகை வாரியான செலவு" : "spend by category"}`}
                />
              </div>
            )}
          </div>

          {/* Selected Day Inspector Pill (when user taps a column in Daily ₹ or Paid vs Free) */}
          {selectedDay && (tab === "spend" || tab === "volume") && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-subtle/60 px-3 py-1.5 text-xs">
              <span className="font-medium text-ink">
                {selectedDay.sub}, {selectedDay.label}: <b className="tabular">{rupees(selectedDay.totalCost)}</b> {isTa ? "(GST தவிர)" : "ex-GST"}
              </span>
              <span className="tabular text-muted">
                {isTa ? "விளம்பரம்" : "Mktg"} {rupees(selectedDay.marketingCost)} · {isTa ? "பயன்பாடு" : "Util"} {rupees(selectedDay.utilityCost)} · {fmtNumber(selectedDay.chargedVolume)} {isTa ? "கட்டணம்" : "paid"} / {fmtNumber(selectedDay.freeVolume)} {isTa ? "இலவசம்" : "free"}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Analytical KPI Strip + Actionable Optimization Insight */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            <div className="rounded-control border border-line bg-subtle/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="truncate text-[9.5px] font-medium uppercase tracking-wide text-muted sm:text-[10px]">{isTa ? "அதிகபட்ச நாள் செலவு" : "Peak day spend"}</p>
              <p className="tabular mt-0.5 truncate text-[11px] font-semibold text-ink sm:text-sm">
                {peakDay && peakDay.totalCost > 0 ? rupees(peakDay.totalCost) : "₹0.00"}
              </p>
              <p className="truncate text-[9.5px] text-muted sm:text-[10px]">{peakDay && peakDay.totalCost > 0 ? `${peakDay.label} · ${peakDay.chargedVolume} ${isTa ? "செய்திகள்" : "msgs"}` : (isTa ? "14 நாட்களில் செலவு இல்லை" : "No charges in 14d")}</p>
            </div>

            <div className="rounded-control border border-line bg-subtle/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="truncate text-[9.5px] font-medium uppercase tracking-wide text-muted sm:text-[10px]">{isTa ? "செயல்முறை கட்டணம்" : "Effective rate"}</p>
              <p className="tabular mt-0.5 truncate text-[11px] font-semibold text-ink sm:text-sm">
                {totalMsgs > 0 ? rupees(effectiveCostPerMsg) : `₹${rates.marketing ?? 0.86}`}
              </p>
              <p className="truncate text-[9.5px] text-muted sm:text-[10px]">{isTa ? `செய்திக்கு (${fmtNumber(totalMsgs)} செய்திகள்)` : `per msg (${fmtNumber(totalMsgs)} msgs)`}</p>
            </div>

            <div className="rounded-control border border-line bg-subtle/35 px-2 py-1.5 sm:px-2.5 sm:py-2">
              <p className="truncate text-[9.5px] font-medium uppercase tracking-wide text-muted sm:text-[10px]">
                {roas > 0 ? "Meta ROAS" : (isTa ? "சேமிக்கப்பட்ட தொகை" : "Window saved")}
              </p>
              <p className="tabular mt-0.5 truncate text-[11px] font-semibold text-success sm:text-sm">
                {roas > 0 ? `${roas}× ${isTa ? "வருமானம்" : "return"}` : rupees(savedByFreeWindow)}
              </p>
              <p className="truncate text-[9.5px] text-muted sm:text-[10px]">
                {roas > 0 ? `₹${monthOrderRevenue.toLocaleString("en-IN")}${monthOrdersCount ? ` (${monthOrdersCount} ${isTa ? "ஆர்டர்கள்" : "orders"})` : ""}` : `${fmtNumber(totalFree)} ${isTa ? "இலவச செய்திகள்" : "free msgs"}`}
              </p>
            </div>
          </div>

          <div className="rounded-control border border-brand/25 bg-brand-soft/35 p-2.5 text-xs text-ink-2 sm:p-3">
            <p className="flex items-center gap-1.5 font-semibold text-brand-deep">
              <Lightbulb aria-hidden className="size-3.5 shrink-0" /> {isTa ? "Meta இந்தியா கட்டண விதிகள் & பண சேமிப்பு குறிப்புகள்" : "Meta India Oct 2026 billing rules & cost saver"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed sm:text-xs">
              {isTa ? (
                <>
                  ஒவ்வொரு எண்ணிற்கும் 24 மணி நேர வாடிக்கையாளர் சாளரத்திற்குள் <b>மாதம் 1,000 இலவச சேவை பதில்கள்</b> கிடைக்கும் (பிறகு <b>₹{rates.service ?? 0.115}/செய்தி</b>). பயன்பாட்டு டெம்ப்ளேட்களின் கட்டணம் <b>₹{rates.utility}/செய்தி</b> (விளம்பரக் கட்டணமான <b>₹{rates.marketing}</b> ஐ விட 7.5 மடங்கு குறைவு). WhatsApp விளம்பரங்கள் மூலம் வரும் பதில்களுக்கு <b>72 மணி நேர இலவச சாளரம்</b> கிடைக்கும்; மேலும் சென்றடைந்த செய்திகளுக்கு மட்டுமே Meta கட்டணம் வசூலிக்கிறது.
                </>
              ) : (
                <>
                  Each number gets <b>1,000 FREE service replies/month</b> inside the 24h customer window (then <b>₹{rates.service ?? 0.115}/msg</b>). Utility templates cost <b>₹{rates.utility}/msg</b> (7.5× cheaper than Marketing at <b>₹{rates.marketing}/msg</b>). Click-to-WhatsApp Ad &amp; FB Page CTA replies unlock a <b>72-hour FREE window</b> across all categories, and Meta charges <b>only on DELIVERED</b> messages (never on failed/held).
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
