"use client";

import { ArrowRight, Lightbulb, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartBar3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader, type Tone } from "@/components/ui";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtNumber, pct } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. ALL-PRODUCTS PERFORMANCE, NON-SELLING & SCENARIO INTELLIGENCE HUB
 * ═══════════════════════════════════════════════════════════════════════════ */

export type ProductScenarioStatus =
  | "top_seller"
  | "selling"
  | "stuck_in_cart"
  | "dropped_hesitation"
  | "dormant_past"
  | "not_selling";

export type AllProductAnalyticsItem = {
  id: string;
  retailerId: string;
  name: string;
  category: string;
  priceAmount: number;
  inStock: boolean;
  /** Period paid/confirmed units & revenue */
  soldQty: number;
  soldRevenue: number;
  soldOrders: number;
  /** Period active unpaid cart units & value */
  cartQty: number;
  cartValue: number;
  cartCount: number;
  /** Period dropped/cancelled units & value */
  droppedQty: number;
  droppedValue: number;
  droppedCount: number;
  droppedCustomers: string[];
  /** Kept across multi-cart revisions (anchor conviction) */
  anchorKeptCount: number;
  /** All-time historical buyers (from past orders + order sheet purchases) */
  allTimeBuyers: number;
  allTimeSoldQty: number;
  /** Campaign reach & replies for this product segment in last 30d */
  campaignSent: number;
  campaignRead: number;
  campaignReplies: number;
  /** Computed scenario classification */
  status: ProductScenarioStatus;
  statusLabel: string;
  statusTone: Tone;
  diagnosis: string;
  solution: string;
  nextActionLabel: string;
  nextActionHref: string;
};

export type AllProductsSummaryData = {
  periodLabel: string;
  totalCatalogProducts: number;
  sellingCount: number;
  stuckInCartCount: number;
  droppedCount: number;
  dormantPastCount: number;
  notSellingCount: number;
  totalSoldRevenue: number;
  totalCartPendingValue: number;
  totalDroppedValue: number;
  products: AllProductAnalyticsItem[];
};

type ProductFilterId = "all" | "not_selling" | "hesitation" | "selling";

const STATUS_META: Record<
  ProductScenarioStatus,
  { color: string; bg: string; border: string; short: string }
> = {
  top_seller: {
    color: "#059669",
    bg: "rgba(16, 185, 129, 0.08)",
    border: "rgba(16, 185, 129, 0.3)",
    short: "Top seller",
  },
  selling: {
    color: "#167d63",
    bg: "rgba(22, 125, 99, 0.07)",
    border: "rgba(22, 125, 99, 0.25)",
    short: "Selling",
  },
  stuck_in_cart: {
    color: "#d97706",
    bg: "rgba(245, 158, 11, 0.09)",
    border: "rgba(245, 158, 11, 0.32)",
    short: "In unpaid cart",
  },
  dropped_hesitation: {
    color: "#e11d48",
    bg: "rgba(225, 29, 72, 0.08)",
    border: "rgba(225, 29, 72, 0.28)",
    short: "Added then dropped",
  },
  dormant_past: {
    color: "#6366f1",
    bg: "rgba(99, 102, 241, 0.08)",
    border: "rgba(99, 102, 241, 0.28)",
    short: "0 sales this period (Past buyers exist)",
  },
  not_selling: {
    color: "#64748b",
    bg: "rgba(100, 116, 139, 0.08)",
    border: "rgba(100, 116, 139, 0.28)",
    short: "Not selling (0 orders)",
  },
};

export function AllProductsIntelligenceCard({ data }: { data: AllProductsSummaryData }) {
  const [filter, setFilter] = useState<ProductFilterId>("all");

  const filtered = data.products.filter((p) => {
    if (filter === "not_selling") return p.status === "not_selling" || p.status === "dormant_past";
    if (filter === "hesitation")
      return p.status === "stuck_in_cart" || p.status === "dropped_hesitation" || p.cartValue > 0 || p.droppedValue > 0;
    if (filter === "selling") return p.soldQty > 0;
    return true;
  });

  const maxTotalActivity = Math.max(
    1,
    ...data.products.map((p) => p.soldRevenue + p.cartValue + p.droppedValue + (p.allTimeBuyers > 0 && p.soldRevenue === 0 ? p.priceAmount : 0)),
  );

  // Category aggregation for visual category bar chart
  const catMap = new Map<
    string,
    { category: string; totalItems: number; sellingItems: number; zeroSaleItems: number; soldRev: number; cartVal: number; droppedVal: number }
  >();
  for (const p of data.products) {
    const row = catMap.get(p.category) ?? {
      category: p.category,
      totalItems: 0,
      sellingItems: 0,
      zeroSaleItems: 0,
      soldRev: 0,
      cartVal: 0,
      droppedVal: 0,
    };
    row.totalItems += 1;
    if (p.soldQty > 0) row.sellingItems += 1;
    else row.zeroSaleItems += 1;
    row.soldRev += p.soldRevenue;
    row.cartVal += p.cartValue;
    row.droppedVal += p.droppedValue;
    catMap.set(p.category, row);
  }
  const categories = [...catMap.values()].sort((a, b) => b.soldRev + b.cartVal - (a.soldRev + a.cartVal) || b.totalItems - a.totalItems);
  const maxCatVal = Math.max(1, ...categories.map((c) => c.soldRev + c.cartVal + c.droppedVal));

  const totalProducts = Math.max(1, data.totalCatalogProducts);
  const zeroSaleTotal = data.notSellingCount + data.dormantPastCount;

  const filterTabs: { id: ProductFilterId; label: string; count: number; badgeColor: string }[] = [
    { id: "all", label: "All products", count: data.products.length, badgeColor: "bg-ink text-white" },
    {
      id: "not_selling",
      label: "Not selling (0 sales)",
      count: zeroSaleTotal,
      badgeColor: "bg-danger-solid text-white",
    },
    {
      id: "hesitation",
      label: "In cart / Dropped",
      count: data.products.filter((p) => p.cartValue > 0 || p.droppedValue > 0).length,
      badgeColor: "bg-warning-solid text-white",
    },
    {
      id: "selling",
      label: "Selling well",
      count: data.sellingCount,
      badgeColor: "bg-brand text-white",
    },
  ];

  return (
    <Card id="all-products-intelligence" className="card-3d mt-4 sm:mt-5">
      <CardHeader
        tone="gold"
        icon={<Trophy3D />}
        title="All products intelligence: selling, cart hesitation & non-selling items"
        description={`Complete diagnostic across all ${fmtNumber(data.products.length)} products (${data.periodLabel}) — what sells, what gets stuck or dropped in carts, what isn't selling at all, and how to fix each item`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/catalogue" className={buttonClass("secondary", "sm")}>
              Manage catalogue
            </Link>
            <Link href="/dashboard/campaigns/new" className={buttonClass("primary", "sm")}>
              Promote slow items
            </Link>
          </div>
        }
      />

      {/* Top Visual Portfolio Health Distribution Strip */}
      <div className="border-b border-line bg-subtle/45 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-2">
            Product portfolio health breakdown ({fmtNumber(data.products.length)} total products)
          </span>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="tabular font-semibold text-success">
              Paid sales: {formatValue(data.totalSoldRevenue, "inr")}
            </span>
            {data.totalCartPendingValue > 0 && (
              <span className="tabular font-semibold text-warning">
                In unpaid carts: {formatValue(data.totalCartPendingValue, "inr")}
              </span>
            )}
            {data.totalDroppedValue > 0 && (
              <span className="tabular font-semibold text-danger">
                Dropped from carts: {formatValue(data.totalDroppedValue, "inr")}
              </span>
            )}
          </div>
        </div>

        {/* Proportional Multi-Segment Portfolio Bar */}
        <div className="track-3d mt-2.5 flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full p-0.5">
          {data.sellingCount > 0 && (
            <div
              className="bar-3d h-full rounded-l-full transition-all duration-500"
              style={{
                width: `${Math.max(6, pct(data.sellingCount, totalProducts))}%`,
                background: "linear-gradient(90deg, #10b981, #059669)",
              }}
              title={`Selling (${data.sellingCount} products)`}
            />
          )}
          {data.stuckInCartCount > 0 && (
            <div
              className="bar-3d h-full transition-all duration-500"
              style={{
                width: `${Math.max(5, pct(data.stuckInCartCount, totalProducts))}%`,
                background: "linear-gradient(90deg, #fbbf24, #d97706)",
              }}
              title={`Stuck in unpaid cart (${data.stuckInCartCount} products)`}
            />
          )}
          {data.droppedCount > 0 && (
            <div
              className="bar-3d h-full transition-all duration-500"
              style={{
                width: `${Math.max(5, pct(data.droppedCount, totalProducts))}%`,
                background: "linear-gradient(90deg, #fb7185, #e11d48)",
              }}
              title={`Added then dropped (${data.droppedCount} products)`}
            />
          )}
          {data.dormantPastCount > 0 && (
            <div
              className="bar-3d h-full transition-all duration-500"
              style={{
                width: `${Math.max(5, pct(data.dormantPastCount, totalProducts))}%`,
                background: "linear-gradient(90deg, #818cf8, #4f46e5)",
              }}
              title={`Dormant this period, sold in past (${data.dormantPastCount} products)`}
            />
          )}
          {data.notSellingCount > 0 && (
            <div
              className="h-full rounded-r-full transition-all duration-500"
              style={{
                width: `${Math.max(6, pct(data.notSellingCount, totalProducts))}%`,
                background: "linear-gradient(90deg, #94a3b8, #475569)",
              }}
              title={`Zero all-time sales (${data.notSellingCount} products)`}
            />
          )}
        </div>

        {/* 5 Visual Scenario Summary Pills */}
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
          <div className="rounded-control border border-line bg-panel px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-success">1. Selling well</span>
              <span className="size-2.5 rounded-full bg-emerald-500" />
            </div>
            <p className="tabular mt-1 text-base font-bold text-ink">
              {fmtNumber(data.sellingCount)} <span className="text-xs font-normal text-muted">items</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">{ pct(data.sellingCount, totalProducts) }% of catalogue active</p>
          </div>

          <div className="rounded-control border border-warning-border/60 bg-warning-bg/35 px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-warning">2. Stuck in cart</span>
              <span className="size-2.5 rounded-full bg-amber-500" />
            </div>
            <p className="tabular mt-1 text-base font-bold text-ink">
              {fmtNumber(data.stuckInCartCount)} <span className="text-xs font-normal text-muted">items</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">Added to cart, 0 paid yet</p>
          </div>

          <div className="rounded-control border border-danger-border/60 bg-danger-bg/30 px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-danger">3. Dropped from cart</span>
              <span className="size-2.5 rounded-full bg-rose-500" />
            </div>
            <p className="tabular mt-1 text-base font-bold text-ink">
              {fmtNumber(data.droppedCount)} <span className="text-xs font-normal text-muted">items</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">Removed during cart revision</p>
          </div>

          <div className="rounded-control border border-line bg-panel px-3 py-2.5 shadow-2xs">
            <div className="flex items-center justify-between gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-indigo-600">4. Dormant mover</span>
              <span className="size-2.5 rounded-full bg-indigo-500" />
            </div>
            <p className="tabular mt-1 text-base font-bold text-ink">
              {fmtNumber(data.dormantPastCount)} <span className="text-xs font-normal text-muted">items</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">Sold in past, ₹0 this period</p>
          </div>

          <div className="rounded-control border border-line bg-panel px-3 py-2.5 shadow-2xs max-xl:col-span-2 max-sm:col-span-2">
            <div className="flex items-center justify-between gap-1">
              <span className="text-2xs font-semibold uppercase tracking-wider text-slate-600">5. Never sold (0 orders)</span>
              <span className="size-2.5 rounded-full bg-slate-500" />
            </div>
            <p className="tabular mt-1 text-base font-bold text-ink">
              {fmtNumber(data.notSellingCount)} <span className="text-xs font-normal text-muted">items</span>
            </p>
            <p className="mt-0.5 text-2xs text-muted">Needs combo bundle or spotlight</p>
          </div>
        </div>
      </div>

      {/* Category Performance Visual Graph + Interactive Filter Bar */}
      <div className="grid grid-cols-1 divide-y divide-line xl:grid-cols-12 xl:divide-x xl:divide-y-0">
        {/* Left 4 cols: Visual Category Demand & Dead-Stock Chart */}
        <div className="p-4 sm:p-5 xl:col-span-4">
          <h4 className="text-sm font-semibold text-ink">Category sales vs. non-selling stock</h4>
          <p className="mt-0.5 text-xs text-muted">
            Which product categories drive revenue vs. where items are sitting unsold
          </p>
          <ul className="mt-3.5 space-y-3.5">
            {categories.map((cat) => {
              const soldShare = pct(cat.soldRev, maxCatVal);
              const cartShare = pct(cat.cartVal, maxCatVal);
              const dropShare = pct(cat.droppedVal, maxCatVal);
              return (
                <li key={cat.category} className="rounded-control border border-line bg-subtle/40 p-3">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-ink">{cat.category}</span>
                    <span className="tabular font-semibold text-ink">
                      {formatValue(cat.soldRev, "inr")}
                      {cat.cartVal > 0 && (
                        <span className="ml-1 font-normal text-warning">(+{formatValue(cat.cartVal, "inr")} cart)</span>
                      )}
                    </span>
                  </div>
                  <div className="track-3d mt-2 flex h-2.5 w-full overflow-hidden rounded-full">
                    {cat.soldRev > 0 && (
                      <div
                        className="bar-3d h-full"
                        style={{ width: `${Math.max(5, soldShare)}%`, background: "#059669" }}
                        title={`Paid sales: ${formatValue(cat.soldRev, "inr")}`}
                      />
                    )}
                    {cat.cartVal > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${Math.max(4, cartShare)}%`, background: "#f59e0b" }}
                        title={`In unpaid cart: ${formatValue(cat.cartVal, "inr")}`}
                      />
                    )}
                    {cat.droppedVal > 0 && (
                      <div
                        className="h-full"
                        style={{ width: `${Math.max(4, dropShare)}%`, background: "#e11d48" }}
                        title={`Dropped from cart: ${formatValue(cat.droppedVal, "inr")}`}
                      />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-2xs text-muted">
                    <span>
                      <b className="text-success">{cat.sellingItems}</b> selling ·{" "}
                      <b className={cat.zeroSaleItems > 0 ? "text-danger" : "text-muted"}>{cat.zeroSaleItems}</b> not selling
                    </span>
                    <span className="tabular">{cat.totalItems} SKU{cat.totalItems === 1 ? "" : "s"}</span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Smart Portfolio Strategy Callout */}
          <div className="mt-4 rounded-control border border-brand/25 bg-brand-soft/40 p-3.5 text-xs text-ink-2">
            <p className="flex items-center gap-1.5 font-semibold text-brand-deep">
              <Lightbulb aria-hidden className="size-4 shrink-0" /> How to move non-selling products
            </p>
            <p className="mt-1 leading-relaxed">
              In WhatsApp catalogues, 80% of customers only tap the top 3 items they already buy. Pair a{" "}
              <b>non-selling item</b> (like Masalas, Flours, or Specialty Oils) as a <b>₹20-off add-on combo</b> with your #1 anchor product, or send a targeted broadcast to past oil buyers introducing the item.
            </p>
          </div>
        </div>

        {/* Right 8 cols: Interactive All-Products Visual Matrix & Solutions */}
        <div className="p-4 sm:p-5 xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter products by performance scenario">
              {filterTabs.map((t) => {
                const active = filter === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(t.id)}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
                      active
                        ? "border-ink bg-ink text-white shadow-2xs"
                        : "border-line bg-panel text-ink-2 hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <span>{t.label}</span>
                    <span
                      className={cn(
                        "tabular rounded-full px-1.5 py-0.2 text-[10px] font-bold",
                        active ? "bg-white/20 text-white" : "bg-sunken text-ink-2",
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-2xs text-muted">
              Showing {filtered.length} of {data.products.length} products
            </span>
          </div>

          {/* All Products Visual Cards */}
          <div className="thin-scroll mt-3.5 max-h-[640px] space-y-2.5 overflow-y-auto pr-1">
            {filtered.map((p) => {
              const meta = STATUS_META[p.status];
              const soldBarW = pct(p.soldRevenue, maxTotalActivity);
              const cartBarW = pct(p.cartValue, maxTotalActivity);
              const dropBarW = pct(p.droppedValue, maxTotalActivity);
              return (
                <div
                  key={p.id}
                  className="rounded-control border border-line bg-panel p-3.5 shadow-2xs transition hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`}
                          className="text-sm font-semibold text-ink hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {p.retailerId}
                        </span>
                        <span className="text-xs text-muted">· {p.category}</span>
                        {p.priceAmount > 0 && (
                          <span className="tabular text-xs font-semibold text-ink-2">
                            · {formatValue(p.priceAmount, "inr")}
                          </span>
                        )}
                        {!p.inStock && <Badge tone="red">Out of stock</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {p.anchorKeptCount > 0 && (
                        <Badge tone="green">Anchor kept {p.anchorKeptCount}×</Badge>
                      )}
                      <Badge tone={p.statusTone}>{p.statusLabel}</Badge>
                    </div>
                  </div>

                  {/* Multi-Segment Visual Demand Bar (Sold vs Unpaid Cart vs Dropped) */}
                  <div className="mt-2.5">
                    <div className="track-3d flex h-2.5 w-full overflow-hidden rounded-full">
                      {p.soldRevenue > 0 && (
                        <div
                          className="bar-3d h-full"
                          style={{ width: `${Math.max(4, soldBarW)}%`, background: "#059669" }}
                          title={`Sold: ${p.soldQty} units (${formatValue(p.soldRevenue, "inr")})`}
                        />
                      )}
                      {p.cartValue > 0 && (
                        <div
                          className="h-full"
                          style={{ width: `${Math.max(4, cartBarW)}%`, background: "#f59e0b" }}
                          title={`In unpaid cart: ${p.cartQty} units (${formatValue(p.cartValue, "inr")})`}
                        />
                      )}
                      {p.droppedValue > 0 && (
                        <div
                          className="h-full"
                          style={{ width: `${Math.max(4, dropBarW)}%`, background: "#e11d48" }}
                          title={`Dropped from cart: ${p.droppedQty} units (${formatValue(p.droppedValue, "inr")})`}
                        />
                      )}
                    </div>

                    {/* Telemetry Metrics Strip */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="tabular">
                          <b className={p.soldQty > 0 ? "text-success" : "text-muted"}>
                            {fmtNumber(p.soldQty)} sold
                          </b>{" "}
                          ({formatValue(p.soldRevenue, "inr")})
                        </span>
                        {p.cartQty > 0 && (
                          <span className="tabular text-warning">
                            · <b>{fmtNumber(p.cartQty)} in unpaid cart</b> ({formatValue(p.cartValue, "inr")})
                          </span>
                        )}
                        {p.droppedQty > 0 && (
                          <span className="tabular text-danger">
                            · <b>{fmtNumber(p.droppedQty)} dropped from cart</b> ({formatValue(p.droppedValue, "inr")})
                          </span>
                        )}
                        <span className="tabular text-muted">
                          · All-time buyers: <b className="text-ink-2">{fmtNumber(p.allTimeBuyers)}</b>
                        </span>
                        {p.campaignSent > 0 && (
                          <span className="tabular text-muted">
                            · 30d campaign reach: <b className="text-ink-2">{fmtNumber(p.campaignSent)}</b> ({pct(p.campaignRead, p.campaignSent)}% read, {p.campaignReplies} replies)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Per-Product Diagnosis & Next-Best-Action Solution Box */}
                  <div
                    className="mt-2.5 flex flex-col justify-between gap-2 rounded-control border px-3 py-2 text-xs sm:flex-row sm:items-center"
                    style={{ background: meta.bg, borderColor: meta.border }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-ink">Why: </span>
                      <span className="text-ink-2">{p.diagnosis} </span>
                      <span className="font-semibold text-ink">Next action: </span>
                      <span className="text-ink-2">{p.solution}</span>
                    </div>
                    <Link
                      href={p.nextActionHref}
                      className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-deep hover:underline"
                    >
                      {p.nextActionLabel} <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CUSTOMER WIN-BACK, RETENTION & SCENARIO ACTION PLAYBOOK ENGINE
 * ═══════════════════════════════════════════════════════════════════════════ */

export type PlaybookCohortLead = {
  id: string;
  name: string;
  phone: string;
  note: string;
  href: string;
};

export type PlaybookScenario = {
  id:
    | "winback_lapsed"
    | "refill_due"
    | "unpaid_cart_recovery"
    | "cart_downsize_recovery"
    | "warm_browsers"
    | "never_ordered"
    | "vip_repeat";
  title: string;
  shortTitle: string;
  badge: string;
  badgeTone: Tone;
  color: string;
  customersCount: number;
  sharePct: number;
  revenueAtStake: number;
  revenueLabel: string;
  whyItHappens: string;
  howToGetThemBack: string[];
  suggestedWhatsappCopy: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  leads: PlaybookCohortLead[];
};

export type CustomerWinbackPlaybookData = {
  totalCustomers: number;
  activeBuyers30d: number;
  refillDue31to60d: number;
  lapsedOver60d: number;
  unpaidCartCustomers: number;
  warmNonBuyers: number;
  coldNeverOrdered: number;
  repeatVipBuyers: number;
  retentionRatePct: number;
  recoverableRevenuePool: number;
  refillConfigured: boolean;
  winbackConfigured: boolean;
  bestReplyDayAndTime: string | null;
  scenarios: PlaybookScenario[];
};

export function CustomerGrowthPlaybookCard({ data }: { data: CustomerWinbackPlaybookData }) {
  const [selectedId, setSelectedId] = useState<PlaybookScenario["id"]>(
    data.scenarios.find((s) => s.customersCount > 0)?.id ?? data.scenarios[0]?.id ?? "winback_lapsed",
  );

  const activeScenario = data.scenarios.find((s) => s.id === selectedId) ?? data.scenarios[0];
  if (!activeScenario) return null;

  const totalBase = Math.max(1, data.totalCustomers);

  const lifecycleSegments = [
    {
      key: "active",
      label: "Active buyers (≤30d)",
      count: data.activeBuyers30d,
      color: "#059669",
      scenarioId: "vip_repeat" as const,
    },
    {
      key: "refill",
      label: "Refill window (31–60d)",
      count: data.refillDue31to60d,
      color: "#0ea5e9",
      scenarioId: "refill_due" as const,
    },
    {
      key: "lapsed",
      label: "Lapsed / Dormant (>60d)",
      count: data.lapsedOver60d,
      color: "#e11d48",
      scenarioId: "winback_lapsed" as const,
    },
    {
      key: "unpaid",
      label: "Unpaid cart right now",
      count: data.unpaidCartCustomers,
      color: "#d97706",
      scenarioId: "unpaid_cart_recovery" as const,
    },
    {
      key: "warm",
      label: "Warm browsers / repliers",
      count: data.warmNonBuyers,
      color: "#7c3aed",
      scenarioId: "warm_browsers" as const,
    },
    {
      key: "cold",
      label: "Never ordered yet",
      count: data.coldNeverOrdered,
      color: "#64748b",
      scenarioId: "never_ordered" as const,
    },
  ];

  return (
    <Card id="growth-playbook" className="card-3d mt-4 sm:mt-5">
      <CardHeader
        tone="brand"
        icon={<Sparkles3D />}
        title="Customer win-back, retention & next-action growth playbook"
        description="Live solutions & step-by-step recommendations based on your data — how to win back dormant buyers, convert cart hesitators, and what to do next"
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {data.recoverableRevenuePool > 0 && (
              <Badge tone="amber">
                Est. recoverable pool: {formatValue(data.recoverableRevenuePool, "inr")}
              </Badge>
            )}
            <Badge tone="green">Repeat buyer rate: {data.retentionRatePct}%</Badge>
          </div>
        }
      />

      {/* Top Visual Customer Lifecycle Distribution Bar */}
      <div className="border-b border-line bg-subtle/40 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-semibold uppercase tracking-wider text-ink-2">
            Customer lifecycle & retention radar ({fmtNumber(data.totalCustomers)} opted-in customers)
          </span>
          {data.bestReplyDayAndTime && (
            <span className="text-xs text-muted">
              Best send window from your data: <b className="font-semibold text-ink">{data.bestReplyDayAndTime}</b>
            </span>
          )}
        </div>

        {/* Interactive Proportional Lifecycle Bar */}
        <div className="track-3d mt-2.5 flex h-4 w-full gap-0.5 overflow-hidden rounded-full p-0.5">
          {lifecycleSegments
            .filter((seg) => seg.count > 0)
            .map((seg) => (
              <button
                key={seg.key}
                type="button"
                onClick={() => setSelectedId(seg.scenarioId)}
                className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full hover:brightness-110"
                style={{
                  width: `${Math.max(5, pct(seg.count, totalBase))}%`,
                  background: seg.color,
                }}
                title={`${seg.label}: ${fmtNumber(seg.count)} customers`}
              />
            ))}
        </div>

        {/* Clickable Lifecycle Cohort Legend Pills */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {lifecycleSegments.map((seg) => {
            const isSelected = selectedId === seg.scenarioId;
            return (
              <button
                key={seg.key}
                type="button"
                onClick={() => setSelectedId(seg.scenarioId)}
                className={cn(
                  "flex flex-col items-start rounded-control border p-2.5 text-left transition",
                  isSelected
                    ? "border-ink bg-panel shadow-sm ring-1 ring-ink"
                    : "border-line bg-panel/75 hover:border-line-strong hover:bg-panel",
                )}
              >
                <span className="flex items-center gap-1.5 text-2xs font-semibold text-ink-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: seg.color }} />
                  <span className="truncate">{seg.label}</span>
                </span>
                <span className="tabular mt-1 text-base font-bold text-ink">
                  {fmtNumber(seg.count)}{" "}
                  <span className="text-2xs font-normal text-muted">({pct(seg.count, totalBase)}%)</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Playbook Workspace: Left Scenario Selector (5 cols) + Right Action Playbook & Script (7 cols) */}
      <div className="grid grid-cols-1 divide-y divide-line xl:grid-cols-12 xl:divide-x xl:divide-y-0">
        {/* Left 5 cols: All Scenarios List */}
        <div className="p-4 sm:p-5 xl:col-span-5">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
            Select a scenario to see the solution & next steps
          </p>
          <ul className="space-y-2">
            {data.scenarios.map((s) => {
              const active = s.id === activeScenario.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={cn(
                      "w-full rounded-control border p-3 text-left transition",
                      active
                        ? "border-brand bg-brand-soft/45 shadow-xs ring-1 ring-brand/40"
                        : "border-line bg-panel hover:border-line-strong hover:bg-subtle/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={s.badgeTone}>{s.badge}</Badge>
                      <span className="tabular text-xs font-semibold text-ink">{s.revenueLabel}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-ink">{s.title}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="tabular font-medium text-ink-2">
                        {fmtNumber(s.customersCount)} customer{s.customersCount === 1 ? "" : "s"}
                      </span>
                      <span className="font-semibold text-brand-deep">See solution →</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right 7 cols: Active Scenario Deep Solution, Playbook Steps, WhatsApp Copy & Target Leads */}
        <div className="flex flex-col justify-between p-4 sm:p-5 xl:col-span-7">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={activeScenario.badgeTone}>{activeScenario.badge}</Badge>
                  <span className="tabular text-xs font-semibold text-ink-2">
                    {fmtNumber(activeScenario.customersCount)} customer{activeScenario.customersCount === 1 ? "" : "s"} · {activeScenario.revenueLabel}
                  </span>
                </div>
                <h3 className="mt-2 text-base font-bold text-ink sm:text-lg">{activeScenario.title}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={activeScenario.primaryCtaHref} className={buttonClass("primary", "sm")}>
                  {activeScenario.primaryCtaLabel} <ArrowRight aria-hidden className="size-3.5" />
                </Link>
                {activeScenario.secondaryCtaHref && activeScenario.secondaryCtaLabel && (
                  <Link href={activeScenario.secondaryCtaHref} className={buttonClass("secondary", "sm")}>
                    {activeScenario.secondaryCtaLabel}
                  </Link>
                )}
              </div>
            </div>

            {/* Why this happens */}
            <div className="rounded-control border border-line bg-subtle/60 p-3.5 text-xs">
              <p className="font-semibold uppercase tracking-wider text-ink-2">
                1. Diagnosis — Why customers act this way
              </p>
              <p className="mt-1 leading-relaxed text-ink-2">{activeScenario.whyItHappens}</p>
            </div>

            {/* Step-by-step Solution & What To Do Next */}
            <div className="rounded-control border border-brand/25 bg-brand-soft/30 p-3.5 text-xs">
              <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-brand-deep">
                <Zap aria-hidden className="size-3.5" /> 2. Actionable Solution — What to do next
              </p>
              <ol className="mt-2 space-y-1.5 pl-4 list-decimal text-ink-2">
                {activeScenario.howToGetThemBack.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            {/* Ready-to-Use WhatsApp Message / Campaign Hook */}
            <div className="rounded-control border border-warning-border/60 bg-warning-bg/35 p-3.5 text-xs">
              <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-ink">
                <Sparkles aria-hidden className="size-3.5 text-gold" /> 3. Recommended WhatsApp message / template hook
              </p>
              <blockquote className="mt-1.5 rounded bg-panel/90 px-3 py-2 font-sans text-xs italic leading-relaxed text-ink shadow-2xs">
                &ldquo;{activeScenario.suggestedWhatsappCopy}&rdquo;
              </blockquote>
            </div>

            {/* Named Customers in this Scenario */}
            {activeScenario.leads.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Customers in this scenario right now (click to open profile & chat)
                </p>
                <ul className="divide-y divide-line rounded-control border border-line bg-panel px-3 py-1 text-xs">
                  {activeScenario.leads.map((lead) => (
                    <li key={lead.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <Link href={lead.href} className="font-semibold text-ink hover:underline">
                          {lead.name}
                        </Link>
                        <span className="ml-1.5 text-muted">· {lead.note}</span>
                      </div>
                      <Link
                        href={lead.href}
                        className="shrink-0 font-semibold text-brand-deep hover:underline"
                      >
                        Open →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Automation Status Footer */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Auto-refill reminder:{" "}
                <b className={data.refillConfigured ? "text-success" : "text-warning"}>
                  {data.refillConfigured ? "Active" : "Not configured"}
                </b>
              </span>
              <span>
                Auto win-back (lapsed):{" "}
                <b className={data.winbackConfigured ? "text-success" : "text-warning"}>
                  {data.winbackConfigured ? "Active" : "Not configured"}
                </b>
              </span>
            </div>
            <Link href="/dashboard/clients" className="font-semibold text-brand-deep hover:underline">
              Configure automations →
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. VISUAL CAMPAIGN RESULTS BY PRODUCT GRAPH (Replaces plain HTML table)
 * ═══════════════════════════════════════════════════════════════════════════ */

export type ProductCampaignRow = {
  tag: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  replies: number;
};

export function ProductCampaignGraphCard({ rows }: { rows: ProductCampaignRow[] }) {
  if (!rows.length) return null;
  const maxSent = Math.max(1, ...rows.map((r) => r.sent));
  const bestReadRow = [...rows].sort((a, b) => pct(b.read, b.delivered) - pct(a.read, a.delivered))[0];
  const bestReplyRow = [...rows].sort((a, b) => pct(b.replies, b.read) - pct(a.replies, a.read))[0];

  return (
    <Card className="card-3d">
      <CardHeader
        tone="brand"
        icon={<ChartBar3D />}
        title="Campaign conversion graph by product segment"
        description="Last 30 days · visual delivery, read & reply funnel for each product buyer group"
        action={
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {bestReadRow && bestReadRow.delivered > 0 && (
              <Badge tone="green">
                Best read: {bestReadRow.tag} ({pct(bestReadRow.read, bestReadRow.delivered)}%)
              </Badge>
            )}
          </div>
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        {rows.map((r) => {
          const delivPct = pct(r.delivered, r.sent);
          const readPct = pct(r.read, r.delivered);
          const replyPct = pct(r.replies, Math.max(1, r.read));
          const sentWidth = pct(r.sent, maxSent);
          const delivWidth = pct(r.delivered, maxSent);
          const readWidth = pct(r.read, maxSent);

          return (
            <div key={r.tag} className="rounded-control border border-line bg-subtle/40 p-3 transition hover:bg-subtle">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/customers?tag=${encodeURIComponent(`product:${r.tag}`)}`}
                    className="text-sm font-semibold text-ink hover:underline"
                  >
                    {r.tag}
                  </Link>
                  {r.replies > 0 && (
                    <Badge tone="blue">
                      {fmtNumber(r.replies)} repl{r.replies === 1 ? "y" : "ies"} ({replyPct}% of readers)
                    </Badge>
                  )}
                </div>
                <div className="tabular flex items-center gap-3 text-xs text-muted">
                  <span>
                    <b className="text-ink">{fmtNumber(r.sent)}</b> sent
                  </span>
                  <span>
                    <b className="text-emerald-700">{delivPct}%</b> delivered
                  </span>
                  <span>
                    <b className="text-purple-700">{readPct}%</b> read
                  </span>
                  {r.failed > 0 && <span className="text-danger">{r.failed} failed</span>}
                </div>
              </div>

              {/* Layered Multi-Metric Funnel Bar */}
              <div className="track-3d relative mt-2 h-3 w-full overflow-hidden rounded-full bg-sunken">
                <div
                  className="absolute inset-y-0 left-0 rounded-full opacity-35"
                  style={{ width: `${Math.max(4, sentWidth)}%`, background: "#167d63" }}
                  title={`Sent: ${r.sent}`}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full opacity-65"
                  style={{ width: `${Math.max(3, delivWidth)}%`, background: "#10b981" }}
                  title={`Delivered: ${r.delivered} (${delivPct}%)`}
                />
                <div
                  className="bar-3d absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max(2, readWidth)}%`, background: "linear-gradient(90deg, #9333ea, #6941c6)" }}
                  title={`Read: ${r.read} (${readPct}%)`}
                />
              </div>
            </div>
          );
        })}

        {/* Legend & Action Recommendation */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#6941c6]" /> Read
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#10b981]" /> Delivered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#167d63]/40" /> Sent
            </span>
          </div>
          {bestReplyRow && bestReplyRow.replies > 0 && (
            <span>
              Top responder segment: <b className="text-ink">{bestReplyRow.tag}</b> — prioritize for new product launches
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
