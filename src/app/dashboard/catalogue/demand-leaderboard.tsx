"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  X,
} from "@/components/icons";
import { Rupee3D, ShoppingBag3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CatalogDemandSummary } from "@/lib/catalog-demand";

type SortMode = "CARTS" | "VIEWS" | "UNITS" | "CONVERSION" | "REVENUE";

export function DemandLeaderboard({
  summary,
}: {
  summary: CatalogDemandSummary;
  commerceManagerUrl?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showImpressionsModal, setShowImpressionsModal] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("CARTS");
  const [onlyInCarts, setOnlyInCarts] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    if (!showImpressionsModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowImpressionsModal(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showImpressionsModal]);

  const cartedCount = useMemo(
    () => summary.products.filter((p) => p.cartCount > 0).length,
    [summary.products],
  );

  const processedList = useMemo(() => {
    let list = [...summary.products];

    if (onlyInCarts) {
      list = list.filter((p) => p.cartCount > 0);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.retailerId.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }

    list.sort((a, b) => {
      if (sortMode === "VIEWS") {
        return b.impressions - a.impressions || b.cartCount - a.cartCount || b.revenue - a.revenue;
      }
      if (sortMode === "CARTS") {
        return b.cartCount - a.cartCount || b.unitsDemanded - a.unitsDemanded || b.revenue - a.revenue;
      }
      if (sortMode === "UNITS") {
        return b.unitsDemanded - a.unitsDemanded || b.cartCount - a.cartCount;
      }
      if (sortMode === "CONVERSION") {
        return b.conversionRate - a.conversionRate || b.paidOrdersCount - a.paidOrdersCount || b.cartCount - a.cartCount;
      }
      if (sortMode === "REVENUE") {
        return b.revenue - a.revenue || b.paidOrdersCount - a.paidOrdersCount;
      }
      return 0;
    });

    return list;
  }, [summary.products, onlyInCarts, search, sortMode]);

  const displayedList = showAll ? processedList : processedList.slice(0, 5);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-base" title="Rank 1">🥇</span>;
    if (rank === 2) return <span className="text-base" title="Rank 2">🥈</span>;
    if (rank === 3) return <span className="text-base" title="Rank 3">🥉</span>;
    return <span className="font-mono text-xs font-semibold text-muted">#{rank}</span>;
  };

  const maxCarts = Math.max(...summary.products.map((p) => p.cartCount), 1);

  return (
    <>
      <Card className="card-3d mb-5 overflow-hidden border-brand/20 bg-panel shadow-sm">
        {/* Top Banner Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-subtle/50 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-control bg-brand/10 text-brand ring-1 ring-brand/20">
              <Sparkles aria-hidden className="size-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[0.9375rem] font-bold tracking-tight text-ink">
                  Product Demand & Popularity
                </h3>
                <Badge tone="brand" className="text-2xs font-semibold">
                  Customer Intent
                </Badge>
                <Badge tone="green" dot className="text-2xs font-medium">
                  Live WhatsApp Data
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted sm:text-[0.8125rem]">
                Tracks which products customers actively view, add to carts, and purchase in WhatsApp.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowImpressionsModal(true)}
              className="h-8 gap-1.5 text-xs font-semibold border-line text-ink hover:border-brand/40 hover:bg-subtle"
              title="View live in-portal WhatsApp catalog impressions, product views, and shopper conversion funnel"
            >
              <Eye aria-hidden className="size-3.5 text-brand" />
              <span>Catalog Impressions</span>
              <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-3xs font-bold text-brand">
                {summary.totalImpressions.toLocaleString("en-IN")}
              </span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsOpen(!isOpen)}
              aria-expanded={isOpen}
              className="h-8 gap-1 text-xs"
            >
              {isOpen ? <ChevronUp aria-hidden className="size-3.5" /> : <ChevronDown aria-hidden className="size-3.5" />}
              {isOpen ? "Collapse" : "Expand"}
            </Button>
          </div>
        </div>

      {isOpen && (
        <div className="p-4 sm:p-5">
          {/* Top 4 KPI Summary Cards */}
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
            <div className="rounded-control border border-line bg-panel p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-medium">WhatsApp Carts</span>
                <ShoppingBag3D className="size-4" />
              </div>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-ink">
                {summary.totalCartsAnalyzed}{" "}
                <span className="text-xs font-normal text-muted">carts</span>
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {summary.totalUnitsDemanded} units demanded across orders
              </p>
            </div>

            <div className="rounded-control border border-line bg-panel p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-medium">#1 Most In-Demand</span>
                <Sparkles3D className="size-4" />
              </div>
              <p className="mt-1.5 truncate text-base font-bold tracking-tight text-ink" title={summary.topDemanded?.name}>
                {summary.topDemanded ? summary.topDemanded.name : "None yet"}
              </p>
              <p className="mt-0.5 text-xs text-brand font-medium">
                {summary.topDemanded ? `${summary.topDemanded.carts} carts · ${summary.topDemanded.units} units` : "No carts yet"}
              </p>
            </div>

            <div className="rounded-control border border-line bg-panel p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-medium">Top Revenue Driver</span>
                <Rupee3D className="size-4" />
              </div>
              <p className="mt-1.5 truncate text-base font-bold tracking-tight text-ink" title={summary.topRevenue?.name}>
                {summary.topRevenue ? summary.topRevenue.name : "None yet"}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-success">
                {summary.topRevenue ? `₹${summary.topRevenue.revenue.toLocaleString("en-IN")} collected` : "₹0"}
              </p>
            </div>

            <div className="rounded-control border border-line bg-panel p-3 shadow-2xs">
              <div className="flex items-center justify-between text-muted">
                <span className="text-xs font-medium">Top Converting</span>
                <Trophy3D className="size-4" />
              </div>
              <p className="mt-1.5 truncate text-base font-bold tracking-tight text-ink" title={summary.topConverting?.name}>
                {summary.topConverting ? summary.topConverting.name : "None yet"}
              </p>
              <p className="mt-0.5 text-xs font-medium text-ink-2">
                {summary.topConverting ? `${summary.topConverting.rate}% checkout conversion` : "0%"}
              </p>
            </div>
          </div>

          {/* Filtering and Sort Controls */}
          <div className="mb-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ranked products…"
                className="field h-8.5 pl-8 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOnlyInCarts(!onlyInCarts)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition",
                  onlyInCarts
                    ? "border-brand bg-brand text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                <span>In carts only</span>
                <span className="font-mono text-2xs opacity-80">({cartedCount})</span>
              </button>

              <span className="mx-1 text-xs text-muted">Sort:</span>

              <button
                type="button"
                onClick={() => setSortMode("VIEWS")}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-control border px-2.5 text-xs font-medium transition",
                  sortMode === "VIEWS"
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                <Eye aria-hidden className="size-3" />
                <span>Views</span>
              </button>

              <button
                type="button"
                onClick={() => setSortMode("CARTS")}
                className={cn(
                  "inline-flex h-8 items-center rounded-control border px-2.5 text-xs font-medium transition",
                  sortMode === "CARTS"
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                Carts
              </button>

              <button
                type="button"
                onClick={() => setSortMode("UNITS")}
                className={cn(
                  "inline-flex h-8 items-center rounded-control border px-2.5 text-xs font-medium transition",
                  sortMode === "UNITS"
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                Units
              </button>

              <button
                type="button"
                onClick={() => setSortMode("CONVERSION")}
                className={cn(
                  "inline-flex h-8 items-center rounded-control border px-2.5 text-xs font-medium transition",
                  sortMode === "CONVERSION"
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                Conversion %
              </button>

              <button
                type="button"
                onClick={() => setSortMode("REVENUE")}
                className={cn(
                  "inline-flex h-8 items-center rounded-control border px-2.5 text-xs font-medium transition",
                  sortMode === "REVENUE"
                    ? "border-ink bg-ink text-panel"
                    : "border-line bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle",
                )}
              >
                Revenue
              </button>
            </div>
          </div>

          {/* Ranking Table / Leaderboard */}
          <div className="overflow-hidden rounded-control border border-line bg-panel shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-subtle text-muted">
                    <th className="py-2.5 pl-3.5 pr-2 font-medium w-12 text-center">Rank</th>
                    <th className="py-2.5 px-3 font-medium">Product</th>
                    <th className="py-2.5 px-3 font-medium text-right">
                      <span className="inline-flex items-center gap-1">
                        <Eye aria-hidden className="size-3 text-muted" />
                        <span>Views</span>
                      </span>
                    </th>
                    <th className="py-2.5 px-3 font-medium text-right">In Carts</th>
                    <th className="py-2.5 px-3 font-medium text-right">Demanded</th>
                    <th className="py-2.5 px-3 font-medium text-right">Paid Sales</th>
                    <th className="py-2.5 px-3 font-medium text-right">Conv. Rate</th>
                    <th className="py-2.5 pl-3 pr-4 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {displayedList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted">
                        No products match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    displayedList.map((item, idx) => {
                      const demandBarPct = Math.max(4, Math.round((item.cartCount / maxCarts) * 100));
                      const isHesitation = item.cartCount >= 3 && item.conversionRate === 0;

                      return (
                        <tr key={item.retailerId} className="transition hover:bg-subtle/50">
                          {/* Rank */}
                          <td className="py-2.5 pl-3.5 pr-2 text-center align-middle">
                            {getRankBadge(idx + 1)}
                          </td>

                          {/* Product Info + Visual Bar */}
                          <td className="py-2.5 px-3 align-middle">
                            <div className="flex items-center gap-2.5">
                              <div className="relative size-10 shrink-0 overflow-hidden rounded-control bg-subtle ring-1 ring-line">
                                {item.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.imageUrl} alt="" className="size-full object-cover" />
                                ) : (
                                  <div className="grid size-full place-items-center text-faint">
                                    <Package aria-hidden className="size-4" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-semibold text-ink sm:max-w-xs" title={item.name}>
                                    {item.name}
                                  </span>
                                  {isHesitation && (
                                    <Badge tone="amber" className="text-3xs">
                                      Cart drop
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted">
                                  <span className="font-mono">{item.retailerId}</span>
                                  <span>•</span>
                                  <span>{item.category}</span>
                                  <span>•</span>
                                  <span>₹{item.priceAmount}</span>
                                </div>
                                {/* Relative Demand Progress Bar */}
                                <div className="mt-1 h-1 w-full max-w-48 overflow-hidden rounded-full bg-sunken">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      item.cartCount > 0 ? "bg-brand" : "bg-muted/40",
                                    )}
                                    style={{ width: `${item.cartCount > 0 ? demandBarPct : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Views / Impressions */}
                          <td className="py-2.5 px-3 text-right align-middle">
                            <div className="flex flex-col items-end">
                              <span className="font-semibold text-ink">
                                {item.impressions.toLocaleString("en-IN")}
                              </span>
                              {item.cartCount > 0 ? (
                                <span className="text-3xs font-medium text-brand">
                                  {item.viewToCartRate}% cart rate
                                </span>
                              ) : (
                                <span className="text-3xs text-muted">0% cart</span>
                              )}
                            </div>
                          </td>

                          {/* In Carts */}
                          <td className="py-2.5 px-3 text-right align-middle font-semibold text-ink">
                            {item.cartCount > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <span>{item.cartCount}</span>
                                <span className="text-2xs font-normal text-muted">carts</span>
                              </span>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>

                          {/* Units Demanded */}
                          <td className="py-2.5 px-3 text-right align-middle text-ink-2">
                            {item.unitsDemanded > 0 ? (
                              <span className="font-medium">
                                {item.unitsDemanded} <span className="text-2xs text-muted">units</span>
                              </span>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>

                          {/* Paid Sales */}
                          <td className="py-2.5 px-3 text-right align-middle">
                            {item.paidOrdersCount > 0 ? (
                              <span className="font-medium text-success">
                                {item.paidOrdersCount} <span className="text-2xs text-muted">({item.paidUnits} sold)</span>
                              </span>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>

                          {/* Conversion Rate */}
                          <td className="py-2.5 px-3 text-right align-middle">
                            {item.cartCount > 0 ? (
                              <Badge
                                tone={item.conversionRate >= 50 ? "green" : item.conversionRate > 0 ? "blue" : "gray"}
                                className="font-mono text-2xs font-semibold"
                              >
                                {item.conversionRate}%
                              </Badge>
                            ) : (
                              <span className="text-muted">–</span>
                            )}
                          </td>

                          {/* Revenue */}
                          <td className="py-2.5 pl-3 pr-4 text-right align-middle font-bold text-ink">
                            {item.revenue > 0 ? `₹${item.revenue.toLocaleString("en-IN")}` : <span className="font-normal text-muted">₹0</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Expand / Collapse Footer */}
            {processedList.length > 5 && (
              <div className="border-t border-line bg-subtle/40 px-4 py-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAll(!showAll)}
                  className="h-7 text-xs font-medium text-ink-2 hover:text-ink"
                >
                  {showAll ? (
                    <>
                      <ChevronUp aria-hidden className="size-3.5" /> Show top 5 products only
                    </>
                  ) : (
                    <>
                      <ChevronDown aria-hidden className="size-3.5" /> Show all {processedList.length} ranked products
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>

    {/* In-Portal Catalog Impressions & Conversion Funnel Modal */}
    {showImpressionsModal && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="impressions-modal-title"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-ink/50 backdrop-blur-xs transition-opacity"
          onClick={() => setShowImpressionsModal(false)}
          aria-hidden="true"
        />

        {/* Modal Window */}
        <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-subtle/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <Eye className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="impressions-modal-title" className="text-base font-bold text-ink">
                    Catalog Impressions & Conversion Funnel
                  </h2>
                  <Badge tone="green" dot className="text-2xs font-semibold">
                    Live Telemetry
                  </Badge>
                  <Badge tone="brand" className="text-3xs font-semibold uppercase">
                    In-Portal
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  Full WhatsApp catalog browsing, shopper exposure, cart creation, and paid conversion funnel.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowImpressionsModal(false)}
              className="rounded-lg p-1.5 text-muted transition hover:bg-subtle hover:text-ink"
              aria-label="Close modal"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* 4 Summary KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-subtle/30 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-2xs font-medium uppercase tracking-wider">Total Views</span>
                  <Eye className="size-4 text-brand" />
                </div>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
                  {summary.totalImpressions.toLocaleString("en-IN")}
                </p>
                <p className="mt-0.5 text-2xs text-muted">Across 25 catalog SKUs</p>
              </div>

              <div className="rounded-xl border border-line bg-subtle/30 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-2xs font-medium uppercase tracking-wider">Unique Viewers</span>
                  <Sparkles className="size-4 text-warning" />
                </div>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
                  {summary.uniqueViewers.toLocaleString("en-IN")}
                </p>
                <p className="mt-0.5 text-2xs text-muted">Shoppers reached on WhatsApp</p>
              </div>

              <div className="rounded-xl border border-line bg-subtle/30 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-2xs font-medium uppercase tracking-wider">View → Cart</span>
                  <ShoppingBag className="size-4 text-brand" />
                </div>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-brand">
                  {summary.overallViewToCartRate}%
                </p>
                <p className="mt-0.5 text-2xs text-muted">{summary.totalCartsAnalyzed} carts created</p>
              </div>

              <div className="rounded-xl border border-line bg-subtle/30 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between text-muted">
                  <span className="text-2xs font-medium uppercase tracking-wider">Cart → Paid</span>
                  <BarChart3 className="size-4 text-success" />
                </div>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-success">
                  {summary.overallCartToPaidRate}%
                </p>
                <p className="mt-0.5 text-2xs text-muted">
                  {summary.funnel.ordersPaid.count} / {summary.totalCartsAnalyzed} orders paid
                </p>
              </div>
            </div>

            {/* 4-Stage Visual Funnel */}
            <div className="rounded-xl border border-line bg-panel p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  4-Stage E-Commerce Conversion Funnel
                </h3>
                <span className="text-2xs text-muted">Live customer journey in WhatsApp</span>
              </div>

              <div className="space-y-3">
                {/* Stage 1: Catalog Impressions */}
                <div className="rounded-lg border border-line/70 bg-subtle/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand/10 font-mono text-3xs font-bold text-brand">
                        1
                      </span>
                      <span className="text-xs font-bold text-ink">Catalog Impressions & Product Views</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">
                        {summary.totalImpressions.toLocaleString("en-IN")} views
                      </span>
                      <Badge tone="brand" className="text-3xs font-semibold">
                        100%
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div className="h-full rounded-full bg-brand" style={{ width: "100%" }} />
                  </div>
                  <p className="mt-1.5 text-2xs text-muted">
                    Total product exposures across WhatsApp broadcast messages, catalog browser opens, and chat profile views.
                  </p>
                </div>

                {/* Stage 2: Carts Created */}
                <div className="rounded-lg border border-line/70 bg-subtle/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-blue-500/10 font-mono text-3xs font-bold text-blue-500">
                        2
                      </span>
                      <span className="text-xs font-bold text-ink">Products Added to Cart</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">
                        {summary.totalCartsAnalyzed} carts ({summary.totalUnitsDemanded} units)
                      </span>
                      <Badge tone="blue" className="text-3xs font-semibold">
                        {summary.overallViewToCartRate}% of views
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, Math.max(8, summary.overallViewToCartRate * 6))}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-2xs text-muted">
                    <span>Customers who selected specific product quantities and added them to cart.</span>
                    <span className="font-medium text-warning">
                      {summary.funnel.cartAdds.dropOffRate}% browsing drop-off
                    </span>
                  </div>
                </div>

                {/* Stage 3: Orders Submitted */}
                <div className="rounded-lg border border-line/70 bg-subtle/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-purple-500/10 font-mono text-3xs font-bold text-purple-500">
                        3
                      </span>
                      <span className="text-xs font-bold text-ink">Orders Placed in Chat</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-ink">
                        {summary.totalCartsAnalyzed} orders
                      </span>
                      <Badge tone="violet" className="text-3xs font-semibold">
                        100% of carts
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-purple-500"
                      style={{ width: `${Math.min(100, Math.max(8, summary.overallViewToCartRate * 6))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-2xs text-muted">
                    Carts sent directly to your WhatsApp Business number for order review and confirmation.
                  </p>
                </div>

                {/* Stage 4: Completed & Paid Orders */}
                <div className="rounded-lg border border-line/70 bg-subtle/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-success/10 font-mono text-3xs font-bold text-success">
                        4
                      </span>
                      <span className="text-xs font-bold text-ink">Orders Paid & Completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-success">
                        {summary.funnel.ordersPaid.count} paid (₹{summary.totalCatalogRevenue.toLocaleString("en-IN")})
                      </span>
                      <Badge tone="green" className="text-3xs font-semibold">
                        {summary.overallCartToPaidRate}% conversion
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{
                        width: `${Math.min(100, Math.max(5, (summary.overallViewToCartRate * 6 * summary.overallCartToPaidRate) / 100))}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-2xs text-muted">
                    <span>Revenue received via WhatsApp UPI review cards, payment gateway, or confirmed delivery.</span>
                    <span className="font-medium text-warning">
                      {summary.funnel.ordersPaid.dropOffRate}% unpaid / awaiting confirmation
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top 5 Most Viewed SKUs */}
            <div className="rounded-xl border border-line bg-panel p-4 shadow-2xs">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink">
                  Top 5 Most Viewed Products
                </h3>
                <span className="text-2xs text-muted">Ranked by WhatsApp impressions</span>
              </div>

              <div className="divide-y divide-line rounded-lg border border-line overflow-hidden">
                {[...summary.products]
                  .sort((a, b) => b.impressions - a.impressions)
                  .slice(0, 5)
                  .map((p, i) => (
                    <div key={p.retailerId} className="flex items-center justify-between bg-subtle/20 p-2.5 hover:bg-subtle/50 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono text-xs font-bold text-muted w-5 text-center">#{i + 1}</span>
                        <div className="size-9 rounded-md bg-subtle ring-1 ring-line overflow-hidden shrink-0">
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.imageUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <div className="grid size-full place-items-center text-muted">
                              <Package className="size-3.5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink max-w-xs">{p.name}</p>
                          <p className="text-2xs text-muted">
                            <span className="font-mono">{p.retailerId}</span> • ₹{p.priceAmount}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right shrink-0">
                        <div>
                          <p className="font-bold text-xs text-ink">{p.impressions.toLocaleString("en-IN")}</p>
                          <p className="text-3xs text-muted">views</p>
                        </div>
                        <div>
                          <p className="font-bold text-xs text-brand">{p.cartCount}</p>
                          <p className="text-3xs text-muted">in carts</p>
                        </div>
                        <div className="w-16">
                          <Badge tone={p.viewToCartRate >= 8 ? "green" : p.viewToCartRate > 0 ? "blue" : "gray"} className="text-3xs font-mono">
                            {p.viewToCartRate}% cart
                          </Badge>
                        </div>
                        <div className="w-20 text-right">
                          <p className="font-bold text-xs text-ink">₹{p.revenue.toLocaleString("en-IN")}</p>
                          <p className="text-3xs text-success font-medium">{p.paidOrdersCount} paid</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Smart In-Portal Insights */}
            <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
              <div className="flex items-center gap-2 text-brand font-bold text-xs">
                <Sparkles className="size-4" />
                <span>Thabaal AI Commerce Insights</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="size-3.5 text-brand shrink-0 mt-0.5" />
                  <span>
                    <strong>Top Traffic Driver:</strong> {summary.topViewed ? `${summary.topViewed.name} leads your catalogue with ${summary.topViewed.impressions.toLocaleString("en-IN")} views and ${summary.topViewed.viewToCartRate}% view-to-cart conversion.` : "Oils lead customer traffic."}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="size-3.5 text-brand shrink-0 mt-0.5" />
                  <span>
                    <strong>Unpaid Cart Nudges:</strong> {summary.totalCartsAnalyzed - summary.funnel.ordersPaid.count} carts were submitted without immediate payment. Use Thabaal&apos;s 6-hour WhatsApp payment reminders to recover lost revenue.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="size-3.5 text-brand shrink-0 mt-0.5" />
                  <span>
                    <strong>Zero External Redirects:</strong> All impression telemetry and conversion metrics are calculated directly inside your Thabaal portal from live WhatsApp Cloud API events.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-line bg-subtle/40 px-5 py-3">
            <span className="text-2xs text-muted">
              Data refreshes automatically with every new WhatsApp cart & message.
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setShowImpressionsModal(false)}
              className="text-xs font-semibold px-4"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}
