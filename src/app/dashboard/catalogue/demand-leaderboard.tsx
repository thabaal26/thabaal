"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
} from "@/components/icons";
import { Rupee3D, ShoppingBag3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CatalogDemandSummary, ProductDemandStats } from "@/lib/catalog-demand";

type SortMode = "CARTS" | "UNITS" | "CONVERSION" | "REVENUE";

export function DemandLeaderboard({
  summary,
  commerceManagerUrl,
}: {
  summary: CatalogDemandSummary;
  commerceManagerUrl: string | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("CARTS");
  const [onlyInCarts, setOnlyInCarts] = useState(false);

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
              Tracks which products customers actively add to carts, units demanded, and checkout conversion.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {commerceManagerUrl && (
            <a
              href={commerceManagerUrl.replace("/products", "/insights")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-panel px-2.5 text-xs font-medium text-ink-2 shadow-2xs transition hover:border-line-strong hover:bg-subtle hover:text-ink"
              title="View Meta's aggregate product impressions and catalogue views"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              <span>Meta Catalog Views</span>
            </a>
          )}
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
                      <td colSpan={7} className="py-8 text-center text-muted">
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
  );
}
