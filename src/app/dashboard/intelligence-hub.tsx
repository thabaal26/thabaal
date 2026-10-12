"use client";

import { ArrowRight, Check, Copy, MessageCircle, Search, Sparkles, Zap } from "@/components/icons";
import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ChartBar3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader, type Tone } from "@/components/ui";
import { ActionLine, DonutPanel, ProgressRings, StackedRows, StatChip, type ChartColor, type Slice } from "@/components/viz";
import { cssColor } from "@/lib/chart-theme";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtNumber, pct } from "@/lib/format";
import type { CustomerLoyaltySummary } from "@/lib/loyalty";
import { adjustLoyaltyPoints } from "./actions/customers";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. PRODUCT PERFORMANCE & SPECIFIC PRODUCT INTELLIGENCE
 * ═══════════════════════════════════════════════════════════════════════════ */

export type ProductScenarioStatus =
  | "top_seller"
  | "selling"
  | "stuck_in_cart"
  | "dropped_hesitation"
  | "dormant_past"
  | "not_selling";

export type ProductBuyerSummary = {
  customerId: string;
  name: string;
  phone: string;
  qty: number;
  spent: number;
  ordersCount: number;
};

export type ProductUnpaidHolder = {
  customerId: string;
  name: string;
  phone: string;
  orderRef: string;
  qty: number;
  value: number;
};

export type ProductPairInsight = {
  name: string;
  count: number;
};

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
  /** Specific product drill-down: top buyers, unpaid cart holders, and bundle partners */
  topBuyers?: ProductBuyerSummary[];
  unpaidHolders?: ProductUnpaidHolder[];
  pairedProducts?: ProductPairInsight[];
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

/** The same meaning everywhere: sold = emerald, waiting in a cart = gold, dropped = red. */
const SOLD: ChartColor = "emerald";
const CART: ChartColor = "gold";
const DROPPED: ChartColor = "red";

type StatusGroup = "selling" | "stuck_in_cart" | "dropped_hesitation" | "dormant_past" | "not_selling";
const GROUPS: Record<StatusGroup, { label: string; color: ChartColor }> = {
  selling: { label: "Selling", color: SOLD },
  stuck_in_cart: { label: "Stuck in unpaid cart", color: CART },
  dropped_hesitation: { label: "Added, then dropped", color: DROPPED },
  dormant_past: { label: "Sold before, not now", color: "violet" },
  not_selling: { label: "Never sold", color: "neutral" },
};
const groupOf = (s: ProductScenarioStatus): StatusGroup => (s === "top_seller" ? "selling" : s);

export function AllProductsIntelligenceCard({ data }: { data: AllProductsSummaryData }) {
  const [group, setGroup] = useState<StatusGroup | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(data.products[0]?.id ?? null);

  const statusSlices: Slice[] = (Object.keys(GROUPS) as StatusGroup[]).map((g) => ({
    key: g,
    label: GROUPS[g].label,
    color: GROUPS[g].color,
    value: data.products.filter((p) => groupOf(p.status) === g).length,
  }));
  const moneySlices: Slice[] = [
    { key: "sold", label: "Paid sales", value: data.totalSoldRevenue, color: SOLD },
    { key: "cart", label: "In unpaid carts", value: data.totalCartPendingValue, color: CART },
    { key: "dropped", label: "Dropped from carts", value: data.totalDroppedValue, color: DROPPED },
  ];

  const catMap = new Map<string, { sold: number; cart: number; dropped: number; items: number; zero: number }>();
  for (const p of data.products) {
    const c = catMap.get(p.category) ?? { sold: 0, cart: 0, dropped: 0, items: 0, zero: 0 };
    c.sold += p.soldRevenue;
    c.cart += p.cartValue;
    c.dropped += p.droppedValue;
    c.items += 1;
    if (!p.soldQty) c.zero += 1;
    catMap.set(p.category, c);
  }
  const categories = [...catMap.entries()].sort((a, b) => b[1].sold + b[1].cart - (a[1].sold + a[1].cart) || b[1].items - a[1].items);

  const q = search.trim().toLowerCase();
  const list = data.products
    .filter((p) => (!group || groupOf(p.status) === group) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)))
    .sort((a, b) => b.soldRevenue + b.cartValue + b.droppedValue - (a.soldRevenue + a.cartValue + a.droppedValue) || b.allTimeBuyers - a.allTimeBuyers);
  const openItem = list.find((p) => p.id === open) ?? (list.length === 1 ? list[0] : null);
  const zeroSale = data.notSellingCount + data.dormantPastCount;

  return (
    <Card id="all-products-intelligence" className="card-3d scroll-mt-24">
      <CardHeader
        tone="gold"
        icon={<Trophy3D />}
        title="Product performance & specific product analysis"
        description={`All ${fmtNumber(data.products.length)} products, ${data.periodLabel} · tap any product for its buyer & drop-off breakdown`}
        action={
          <Link href="/dashboard/catalogue" className={buttonClass("secondary", "sm")}>
            Catalogue
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-3 sm:gap-6 sm:p-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold text-ink sm:mb-3 sm:text-sm">Products by status</h4>
          <DonutPanel
            slices={statusSlices}
            centerLabel="products"
            label="Products by sales status"
            size={156}
            selected={group}
            onSelect={(k) => {
              setGroup((g) => (g === k ? null : (k as StatusGroup)));
              setOpen(null);
            }}
          />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold text-ink sm:mb-3 sm:text-sm">Where the money is</h4>
          <DonutPanel slices={moneySlices} format="inr" centerLabel="sold + in carts + dropped" label="Sales value by stage" size={156} />
        </div>
      </div>

      {zeroSale > 0 && (
        <div className="px-3 pb-3 sm:px-5 sm:pb-4">
          <ActionLine href="/dashboard/campaigns/new" cta="Promote them">
            <b className="text-ink">{plural(zeroSale, "product")}</b> had no sales this period. Pair them as a small add-on with your best seller.
          </ActionLine>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 border-t border-line p-3 sm:gap-6 sm:p-5 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <h4 className="mb-2 text-xs font-semibold text-ink sm:mb-3 sm:text-sm">By category</h4>
          <StackedRows
            format="inr"
            legend={[
              { label: "Sold", color: SOLD },
              { label: "In cart", color: CART },
              { label: "Dropped", color: DROPPED },
            ]}
            rows={categories.map(([name, c]) => ({
              key: name,
              label: name,
              right: `${formatValue(c.sold, "inr")} · ${c.items - c.zero}/${c.items} selling`,
              parts: [
                { key: "s", label: "Sold", value: c.sold, color: SOLD },
                { key: "c", label: "In cart", value: c.cart, color: CART },
                { key: "d", label: "Dropped", value: c.dropped, color: DROPPED },
              ],
            }))}
          />
        </div>

        <div className="xl:col-span-8">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
            <h4 className="text-xs font-semibold text-ink sm:text-sm">
              {group ? GROUPS[group].label : "Select a product to inspect"} <span className="tabular font-normal text-muted">· {list.length}</span>
            </h4>
            <div className="flex items-center gap-2">
              {data.products.length > 4 && (
                <div className="relative">
                  <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find product…"
                    aria-label="Find product"
                    className="h-7 w-36 rounded-full border border-line bg-panel pl-7 pr-2.5 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none sm:w-44"
                  />
                </div>
              )}
              {group && (
                <button type="button" onClick={() => setGroup(null)} className="text-xs font-semibold text-brand-deep hover:underline">
                  Show all
                </button>
              )}
            </div>
          </div>
          <div className="thin-scroll max-h-[340px] overflow-y-auto pr-1 sm:max-h-[400px]">
            <StackedRows
              format="inr"
              activeKey={openItem?.id ?? null}
              onRowClick={(k) => setOpen((o) => (o === k ? null : k))}
              rows={list.map((p) => ({
                key: p.id,
                label: p.name,
                dot: GROUPS[groupOf(p.status)].color,
                right: p.soldQty ? `${fmtNumber(p.soldQty)} sold · ${formatValue(p.soldRevenue, "inr")}` : p.allTimeBuyers ? `0 now · ${plural(p.allTimeBuyers, "past buyer")}` : "0 sold",
                parts: [
                  { key: "s", label: "Sold", value: p.soldRevenue, color: SOLD },
                  { key: "c", label: "In cart", value: p.cartValue, color: CART },
                  { key: "d", label: "Dropped", value: p.droppedValue, color: DROPPED },
                ],
              }))}
            />
          </div>
          {openItem ? (
            <ProductDetail p={openItem} />
          ) : (
            <p className="mt-2.5 text-2xs text-muted sm:mt-3">Tap any product above to inspect its top buyers, cart drop-offs, and bundle partners.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

function ProductDetail({ p }: { p: AllProductAnalyticsItem }) {
  const totalCartTouches = p.soldQty + p.cartQty + p.droppedQty;
  const convPct = totalCartTouches > 0 ? pct(p.soldQty, totalCartTouches) : 0;
  const topBuyers = p.topBuyers ?? [];
  const unpaidHolders = p.unpaidHolders ?? [];
  const paired = p.pairedProducts ?? [];

  return (
    <div className="mt-3 rounded-control border border-brand/30 bg-subtle/60 p-3 shadow-xs sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`} className="text-xs font-semibold text-ink hover:underline sm:text-sm">
            {p.name}
          </Link>
          <Badge tone={p.statusTone}>{p.statusLabel}</Badge>
          {!p.inStock && <Badge tone="red">Out of stock</Badge>}
          {p.anchorKeptCount > 0 && <Badge tone="green">Anchor kept {p.anchorKeptCount}×</Badge>}
        </div>
        {p.priceAmount > 0 && <span className="tabular text-xs font-semibold text-ink-2">Catalogue price: {formatValue(p.priceAmount, "inr")}</span>}
      </div>

      {/* Product KPI chips */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:mt-3 sm:grid-cols-5 sm:gap-2">
        <StatChip label="Paid sales" value={`${fmtNumber(p.soldQty)} · ${formatValue(p.soldRevenue, "inr")}`} tone={p.soldQty ? "good" : "ink"} />
        <StatChip label="In unpaid cart" value={`${fmtNumber(p.cartQty)} · ${formatValue(p.cartValue, "inr")}`} tone={p.cartQty ? "warn" : "ink"} />
        <StatChip label="Dropped / cancelled" value={`${fmtNumber(p.droppedQty)} · ${formatValue(p.droppedValue, "inr")}`} tone={p.droppedQty ? "bad" : "ink"} />
        <StatChip label="Cart → Paid rate" value={totalCartTouches > 0 ? `${convPct}%` : "—"} tone={convPct >= 50 ? "good" : totalCartTouches > 0 ? "warn" : "ink"} />
        <StatChip label="All-time buyers" value={`${fmtNumber(p.allTimeBuyers)} (${fmtNumber(p.allTimeSoldQty)} units)`} />
      </div>

      {/* 3-Column Deep-Dive: Top Buyers, Unpaid/Dropped Customers, and Often Bought Together */}
      {(topBuyers.length > 0 || unpaidHolders.length > 0 || p.droppedCustomers.length > 0 || paired.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-line pt-3 sm:grid-cols-3">
          {/* 1. Who Mostly Bought This Product */}
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-success">
              Mostly bought by ({topBuyers.length})
            </p>
            {topBuyers.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {topBuyers.slice(0, 4).map((b) => (
                  <li key={b.customerId} className="flex items-center justify-between gap-1.5">
                    <Link href={`/dashboard/customers/${b.customerId}`} className="min-w-0 truncate font-medium text-ink hover:underline">
                      {b.name}
                    </Link>
                    <span className="tabular shrink-0 text-[11px] font-semibold text-ink-2">
                      {b.qty}× · {formatValue(b.spent, "inr")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted">No buyers in this period yet.</p>
            )}
          </div>

          {/* 2. Who Dropped It / Has It in Unpaid Cart */}
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-warning">
              In cart / dropped by
            </p>
            {unpaidHolders.length > 0 || p.droppedCustomers.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {unpaidHolders.slice(0, 3).map((u) => (
                  <div key={`${u.customerId}-${u.orderRef}`} className="flex items-center justify-between gap-1.5">
                    <Link href={`/dashboard/customers/${u.customerId}`} className="min-w-0 truncate font-medium text-ink hover:underline">
                      {u.name} <span className="font-mono text-[10px] text-warning">(unpaid {u.orderRef})</span>
                    </Link>
                    <span className="tabular shrink-0 text-[11px] font-semibold text-warning">
                      {u.qty}× · {formatValue(u.value, "inr")}
                    </span>
                  </div>
                ))}
                {p.droppedCustomers.length > 0 && (
                  <p className="text-[11px] text-muted">
                    <span className="font-semibold text-danger">Dropped by: </span>
                    {p.droppedCustomers.slice(0, 4).join(", ")}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted">No unpaid carts or drops in this period.</p>
            )}
          </div>

          {/* 3. Often Bought Together */}
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
              Often bought together
            </p>
            {paired.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {paired.slice(0, 4).map((pair) => (
                  <li key={pair.name} className="flex items-center justify-between gap-1.5">
                    <span className="min-w-0 truncate text-ink">{pair.name}</span>
                    <span className="tabular shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand-deep">
                      {pair.count} order{pair.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted">Usually ordered on its own.</p>
            )}
          </div>
        </div>
      )}

      {p.campaignSent > 0 && (
        <p className="tabular mt-2.5 text-2xs text-muted">
          Last 30 days campaign reach: messaged {fmtNumber(p.campaignSent)} buyers · {pct(p.campaignRead, p.campaignSent)}% read · {plural(p.campaignReplies, "reply", "replies")}
        </p>
      )}
      <p className="mt-2 text-xs text-ink-2 sm:mt-2.5">
        <b className="text-ink">Diagnosis:</b> {p.diagnosis}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        <b className="text-ink">Recommended action:</b> {p.solution}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-2.5">
        <Link href={p.nextActionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
          {p.nextActionLabel} <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        <Link href={`/dashboard?view=products&product=${encodeURIComponent(p.name)}&range=90d`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
          Filter Products tab to this item <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        <Link href={`/dashboard/orders?show=all&product=${encodeURIComponent(p.name)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
          View all orders with this item <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CUSTOMER LIFECYCLE & WIN-BACK PLAYBOOKS
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

const COHORTS: { key: string; label: string; color: ChartColor; scenario: PlaybookScenario["id"]; field: keyof CustomerWinbackPlaybookData }[] = [
  { key: "active", label: "Active (≤30 days)", color: "emerald", scenario: "vip_repeat", field: "activeBuyers30d" },
  { key: "refill", label: "Refill due (31–60 days)", color: "blue", scenario: "refill_due", field: "refillDue31to60d" },
  { key: "lapsed", label: "Lapsed (60+ days)", color: "red", scenario: "winback_lapsed", field: "lapsedOver60d" },
  { key: "unpaid", label: "Unpaid cart now", color: "gold", scenario: "unpaid_cart_recovery", field: "unpaidCartCustomers" },
  { key: "warm", label: "Warm, not bought", color: "violet", scenario: "warm_browsers", field: "warmNonBuyers" },
  { key: "cold", label: "Never ordered", color: "neutral", scenario: "never_ordered", field: "coldNeverOrdered" },
];

export function CustomerGrowthPlaybookCard({ data }: { data: CustomerWinbackPlaybookData }) {
  const [selectedId, setSelectedId] = useState<PlaybookScenario["id"]>(
    data.scenarios.find((s) => s.customersCount > 0)?.id ?? data.scenarios[0]?.id ?? "winback_lapsed",
  );
  const [copied, setCopied] = useState(false);
  const active = data.scenarios.find((s) => s.id === selectedId) ?? data.scenarios[0];
  if (!active) return null;

  const slices: Slice[] = COHORTS.map((c) => ({ key: c.scenario, label: c.label, color: c.color, value: Number(data[c.field]) || 0 }));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(active.suggestedWhatsappCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the text is still selectable */
    }
  };

  return (
    <Card id="growth-playbook" className="card-3d scroll-mt-24">
      <CardHeader
        tone="brand"
        icon={<Sparkles3D />}
        title="Customer lifecycle & win-back"
        description={`${fmtNumber(data.totalCustomers)} opted-in customers by when they last bought · pick a group for its playbook`}
        action={data.recoverableRevenuePool > 0 ? <Badge tone="amber">Recoverable: {formatValue(data.recoverableRevenuePool, "inr")}</Badge> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 p-3 sm:gap-6 sm:p-5 xl:grid-cols-12">
        <div className="space-y-4 sm:space-y-5 xl:col-span-5">
          <DonutPanel slices={slices} centerLabel="customers" label="Customers by lifecycle stage" size={160} selected={selectedId} onSelect={(k) => setSelectedId(k as PlaybookScenario["id"])} />
          <ProgressRings
            label="Customer health"
            title="Customer health"
            size={88}
            rings={[
              { key: "repeat", label: "Repeat buyers", value: data.retentionRatePct, color: "emerald" },
              { key: "active", label: "Active now", value: pct(data.activeBuyers30d, Math.max(1, data.totalCustomers)), color: "blue", sub: `${fmtNumber(data.activeBuyers30d)} customers` },
              { key: "lapsed", label: "Lapsed", value: pct(data.lapsedOver60d, Math.max(1, data.totalCustomers)), color: "red", sub: `${fmtNumber(data.lapsedOver60d)} to win back` },
            ]}
          />
        </div>

        <div className="min-w-0 xl:col-span-7">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Playbooks">
            {data.scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === active.id}
                onClick={() => setSelectedId(s.id)}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition sm:min-h-9 sm:gap-1.5 sm:px-3 sm:text-xs",
                  s.id === active.id ? "border-ink bg-ink text-panel" : "border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink",
                )}
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: cssColor(s.color) }} />
                <span className="truncate">{s.shortTitle}</span>
                <span className="tabular opacity-70">{fmtNumber(s.customersCount)}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-card border border-line p-3 sm:mt-4 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
              <div className="min-w-0">
                <Badge tone={active.badgeTone}>{active.badge}</Badge>
                <h3 className="mt-1.5 text-sm font-semibold text-ink sm:text-base">{active.title}</h3>
                <p className="tabular mt-0.5 text-xs text-muted">
                  {plural(active.customersCount, "customer")} · {active.revenueLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <Link href={active.primaryCtaHref} className={buttonClass("primary", "sm")}>
                  {active.primaryCtaLabel}
                </Link>
                {active.secondaryCtaHref && active.secondaryCtaLabel && (
                  <Link href={active.secondaryCtaHref} className={buttonClass("secondary", "sm")}>
                    {active.secondaryCtaLabel}
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-3 rounded-control bg-brand-soft p-2.5 sm:mt-4 sm:p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-brand-deep">Message to send</span>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                  {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 rounded-[10px] rounded-tl-none bg-panel px-2.5 py-2 text-xs leading-relaxed text-ink shadow-2xs sm:px-3 sm:text-sm">{active.suggestedWhatsappCopy}</p>
            </div>

            <details className="group/s mt-2.5 sm:mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                <Zap aria-hidden className="size-3.5 text-gold" /> Why it happens & {active.howToGetThemBack.length} steps
              </summary>
              <p className="mt-2 text-xs leading-relaxed text-muted">{active.whyItHappens}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-ink-2">
                {active.howToGetThemBack.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>

            {active.leads.length > 0 && (
              <div className="mt-3 border-t border-line pt-2.5 sm:mt-4 sm:pt-3">
                <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-muted sm:mb-2">Customers in this group</p>
                <ul className="flex flex-wrap gap-1.5">
                  {active.leads.map((l) => (
                    <li key={l.id}>
                      <Link href={l.href} title={l.note} className="inline-flex max-w-[14rem] items-center rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-line-2 hover:text-ink">
                        <span className="truncate">{l.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted sm:mt-3">
            <span className="flex flex-wrap gap-2.5 sm:gap-3">
              <span>
                Refill reminder <b className={data.refillConfigured ? "text-success" : "text-warning"}>{data.refillConfigured ? "on" : "off"}</b>
              </span>
              <span>
                Win-back <b className={data.winbackConfigured ? "text-success" : "text-warning"}>{data.winbackConfigured ? "on" : "off"}</b>
              </span>
              {data.bestReplyDayAndTime && (
                <span>
                  Best time <b className="text-ink">{data.bestReplyDayAndTime}</b>
                </span>
              )}
            </span>
            <Link href="/dashboard/clients" className="font-semibold text-brand-deep hover:underline">
              Automations →
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. CAMPAIGN RESULTS BY PRODUCT GROUP
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
  const best = [...rows].filter((r) => r.delivered >= 5).sort((a, b) => pct(b.read, b.delivered) - pct(a.read, a.delivered))[0];
  return (
    <Card className="card-3d h-full">
      <CardHeader
        tone="brand"
        icon={<ChartBar3D />}
        title="Campaigns by product"
        description="Last 30 days · how far messages got with each catalogue product's buyers"
        action={best ? <Badge tone="green">Best read: {best.tag}</Badge> : undefined}
      />
      <div className="p-3 sm:p-5">
        <StackedRows
          legend={[
            { label: "Read", color: "violet" },
            { label: "Delivered, unread", color: "emerald" },
            { label: "Not delivered", color: "neutral" },
          ]}
          rows={rows.map((r) => ({
            key: r.tag,
            label: r.tag,
            href: `/dashboard/customers?tag=${encodeURIComponent(`product:${r.tag}`)}`,
            right: `${pct(r.read, r.delivered)}% read${r.replies ? ` · ${plural(r.replies, "reply", "replies")}` : ""}`,
            parts: [
              { key: "r", label: "Read", value: r.read, color: "violet" },
              { key: "d", label: "Delivered, unread", value: Math.max(0, r.delivered - r.read), color: "emerald" },
              { key: "n", label: "Not delivered", value: Math.max(0, r.sent - r.delivered), color: "neutral" },
            ],
          }))}
        />
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. FREQUENT BUYERS, TOP CUSTOMERS, RFM RATIO & LOYALTY REWARDS
 * ═══════════════════════════════════════════════════════════════════════════ */

export type TopCustomerLoyaltyItem = {
  id: string;
  name: string;
  phone: string;
  location: string | null;
  paidOrdersCount: number;
  totalSpent: number;
  aov: number;
  avgGapDays: number | null;
  daysSinceLastOrder: number | null;
  lastOrderLabel: string | null;
  mostlyBought: { name: string; qty: number; spent: number }[];
  mostlyDropped: { name: string; qty: number; value: number }[];
  unpaidCartValue: number;
  sheetPurchases: string | null;
  loyalty: CustomerLoyaltySummary;
};

export type TopFrequentCustomersData = {
  canManage: boolean;
  totalBuyersCount: number;
  frequentBuyersCount: number;
  topSpendersCount: number;
  repeatPurchaseRatioPct: number;
  avgCustomerLtv: number;
  totalLoyaltyPointsPool: number;
  totalRewardRupeesPool: number;
  customers: TopCustomerLoyaltyItem[];
};

type LeaderboardTab = "all" | "top_spenders" | "frequent" | "champions" | "hesitators";

export function TopFrequentCustomersCard({ data }: { data: TopFrequentCustomersData }) {
  const [tab, setTab] = useState<LeaderboardTab>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.customers[0]?.id ?? null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!data.customers.length) return null;

  const q = search.trim().toLowerCase();
  const filtered = data.customers
    .filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !(c.location ?? "").toLowerCase().includes(q)) {
        return false;
      }
      if (tab === "top_spenders") return c.loyalty.isTopCustomer || c.totalSpent >= 800;
      if (tab === "frequent") return c.loyalty.isFrequentBuyer;
      if (tab === "champions") return c.loyalty.rfmRatioPct >= 73 || c.loyalty.tier === "platinum" || c.loyalty.tier === "gold";
      if (tab === "hesitators") return c.mostlyDropped.length > 0 || c.unpaidCartValue > 0 || c.loyalty.rfmSegment === "Big Spender · At Risk";
      return true;
    })
    .sort((a, b) => {
      if (tab === "frequent") {
        return b.paidOrdersCount - a.paidOrdersCount || b.totalSpent - a.totalSpent || b.loyalty.totalPoints - a.loyalty.totalPoints;
      }
      if (tab === "champions") {
        return b.loyalty.rfmRatioPct - a.loyalty.rfmRatioPct || b.loyalty.totalPoints - a.loyalty.totalPoints;
      }
      return b.totalSpent - a.totalSpent || b.paidOrdersCount - a.paidOrdersCount || b.loyalty.totalPoints - a.loyalty.totalPoints;
    });

  const activeCustomer = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const copyOffer = async (c: TopCustomerLoyaltyItem) => {
    try {
      await navigator.clipboard.writeText(c.loyalty.whatsappOfferCopy);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const TABS: { id: LeaderboardTab; label: string; count: number }[] = [
    { id: "all", label: "All ranked", count: data.customers.length },
    { id: "top_spenders", label: "Top spenders", count: data.customers.filter((c) => c.loyalty.isTopCustomer || c.totalSpent >= 800).length },
    { id: "frequent", label: "Frequent buyers (2+)", count: data.customers.filter((c) => c.loyalty.isFrequentBuyer).length },
    { id: "champions", label: "High RFM / VIP", count: data.customers.filter((c) => c.loyalty.rfmRatioPct >= 73 || c.loyalty.tier === "platinum" || c.loyalty.tier === "gold").length },
    { id: "hesitators", label: "Dropped / At-risk", count: data.customers.filter((c) => c.mostlyDropped.length > 0 || c.unpaidCartValue > 0 || c.loyalty.rfmSegment === "Big Spender · At Risk").length },
  ];

  return (
    <Card id="top-frequent-customers" className="card-3d scroll-mt-24">
      <CardHeader
        tone="gold"
        icon={<Trophy3D />}
        title="Frequent buyers, top customers, RFM ratio & loyalty rewards"
        description="Ranked by spend, repeat order frequency, and RFM (Recency · Frequency · Monetary) ratio · give loyalty points or send a tailored offer in 1 tap"
        action={
          <Link href="/dashboard/customers?stage=repeat" className={buttonClass("secondary", "sm")}>
            All repeat buyers
          </Link>
        }
      />

      {/* Top 5 KPIs */}
      <div className="grid grid-cols-2 gap-2 border-b border-line bg-subtle/50 p-3 sm:grid-cols-5 sm:gap-2.5 sm:p-4">
        <StatChip
          label="Repeat purchase ratio"
          value={`${data.repeatPurchaseRatioPct}%`}
          tone={data.repeatPurchaseRatioPct >= 30 ? "good" : "warn"}
        />
        <StatChip label="Frequent buyers (2+)" value={`${fmtNumber(data.frequentBuyersCount)} customers`} tone="good" />
        <StatChip label="Top spenders (VIP)" value={`${fmtNumber(data.topSpendersCount)} customers`} tone="good" />
        <StatChip label="Avg customer LTV" value={formatValue(data.avgCustomerLtv, "inr")} />
        <StatChip
          label="Loyalty points pool"
          value={`${fmtNumber(data.totalLoyaltyPointsPool)} pts (₹${fmtNumber(data.totalRewardRupeesPool)})`}
        />
      </div>

      {/* Collapsible Guide: How RFM Ratio & Loyalty Points Work */}
      <details className="border-b border-line bg-brand-soft/25 px-3 py-2.5 text-xs sm:px-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-ink hover:text-brand-deep [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles aria-hidden className="size-3.5 text-brand-deep" /> How Loyalty Points, Tiers &amp; RFM (Recency · Frequency · Monetary) Ratio Work
          </span>
          <span className="text-[11px] font-medium text-brand-deep">Tap to view formula ▾</span>
        </summary>
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 pb-1 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="font-semibold text-ink">1. How Loyalty Points Are Earned</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-ink-2">
              <li><strong>Order Spend:</strong> <code>1 pt</code> per <code>₹10</code> spent (5% reward value)</li>
              <li><strong>Repeat Frequency Bonus:</strong> <code>+50 pts</code> for every repeat paid order (2nd, 3rd, 4th+)</li>
              <li><strong>Historical Sheet Orders:</strong> <code>+35 pts</code> per recorded sheet item</li>
              <li><strong>Manual Bonus:</strong> Award <code>+50 / +100 / +200 pts</code> anytime</li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="font-semibold text-ink">2. Tiers &amp; ₹ Redemption Value</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-ink-2">
              <li><strong>Redemption Rate:</strong> <code>100 pts = ₹50 off</code> (<code>1 pt = ₹0.50</code>)</li>
              <li><strong>Platinum VIP:</strong> <code>500+ pts</code> or <code>4+ orders</code> / <code>₹3,000+</code></li>
              <li><strong>Gold Regular:</strong> <code>250–499 pts</code> or <code>2–3 orders</code> / <code>₹1,500+</code></li>
              <li><strong>Silver Member:</strong> <code>100–249 pts</code> or <code>1st order</code></li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-panel p-2.5">
            <p className="font-semibold text-ink">3. RFM Ratio (R·F·M Scored 1–5 Each)</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-ink-2">
              <li><strong>R (Recency 1–5):</strong> How recently they ordered (<code>5</code> = ≤15d, <code>1</code> = &gt;90d)</li>
              <li><strong>F (Frequency 1–5):</strong> Total orders placed (<code>5</code> = 4+ orders, <code>2</code> = 1 order)</li>
              <li><strong>M (Monetary 1–5):</strong> Total ₹ spent (<code>5</code> = ₹2,500+, <code>3</code> = ₹800+)</li>
              <li><strong>RFM %:</strong> <code>(R + F + M) ÷ 15 × 100</code> (e.g. <code>5-4-5 = 93% Champion</code>)</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Filter Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5 sm:px-5">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Customer segments">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex min-h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition sm:min-h-8 sm:text-xs",
                tab === t.id ? "border-ink bg-ink text-panel" : "border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink",
              )}
            >
              <span>{t.label}</span>
              <span className="tabular opacity-75">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find buyer…"
            aria-label="Find buyer"
            className="h-7 w-40 rounded-full border border-line bg-panel pl-7 pr-2.5 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none sm:w-48"
          />
        </div>
      </div>

      {/* Main Split View: Ranked List (Left) + Selected Customer Offer & Loyalty Inspector (Right) */}
      <div className="grid grid-cols-1 gap-4 p-3 sm:gap-5 sm:p-5 xl:grid-cols-12">
        {/* Ranked List */}
        <div className="thin-scroll max-h-[420px] space-y-2 overflow-y-auto pr-1 xl:col-span-7">
          {filtered.length > 0 ? (
            filtered.slice(0, 25).map((c, idx) => {
              const isSelected = activeCustomer?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(c.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer rounded-control border p-2.5 transition sm:p-3",
                    isSelected
                      ? "border-brand bg-brand-soft/40 shadow-2xs"
                      : "border-line bg-panel hover:border-line-2 hover:bg-subtle/40",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="tabular inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle text-[11px] font-bold text-ink">
                          {idx + 1}
                        </span>
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-xs font-semibold text-ink hover:underline sm:text-sm"
                        >
                          {c.name}
                        </Link>
                        <Badge tone={c.loyalty.tierTone}>
                          {c.loyalty.tierLabel} · {c.loyalty.totalPoints} pts
                        </Badge>
                        <Badge tone={c.loyalty.rfmTone}>
                          RFM {c.loyalty.rfmCode} ({c.loyalty.rfmRatioPct}%)
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">
                        {c.mostlyBought[0]
                          ? `Mostly buys: ${c.mostlyBought[0].name} (${c.mostlyBought[0].qty}×)`
                          : c.sheetPurchases
                            ? `Past sheet: ${c.sheetPurchases}`
                            : "No confirmed item yet"}
                        {c.mostlyDropped[0] ? ` · Dropped: ${c.mostlyDropped[0].name}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-xs font-bold text-ink sm:text-sm">
                        {formatValue(c.totalSpent, "inr")}
                      </p>
                      <p className="tabular text-[11px] text-muted">
                        {c.paidOrdersCount} order{c.paidOrdersCount === 1 ? "" : "s"}
                        {c.avgGapDays ? ` · ~${c.avgGapDays}d cycle` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-6 text-center text-xs text-muted">No customers match this filter.</p>
          )}
        </div>

        {/* Selected Customer Loyalty & Offer Action Panel */}
        <div className="xl:col-span-5">
          {activeCustomer ? (
            <div className="sticky top-24 rounded-card border border-brand/35 bg-subtle/50 p-3.5 shadow-xs sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/dashboard/customers/${activeCustomer.id}`} className="text-sm font-bold text-ink hover:underline sm:text-base">
                      {activeCustomer.name}
                    </Link>
                    <Badge tone={activeCustomer.loyalty.tierTone}>{activeCustomer.loyalty.tierLabel}</Badge>
                  </div>
                  <p className="tabular mt-0.5 text-xs text-muted">
                    +{activeCustomer.phone}
                    {activeCustomer.location ? ` · ${activeCustomer.location}` : ""}
                    {activeCustomer.lastOrderLabel ? ` · Last order ${activeCustomer.lastOrderLabel}` : ""}
                  </p>
                </div>
                <Link href={`/dashboard/customers/${activeCustomer.id}`} className={buttonClass("secondary", "sm")}>
                  Open profile
                </Link>
              </div>

              {/* Customer Loyalty & RFM Mini-Grid */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-md border border-line bg-panel p-2 text-center">
                  <p className="text-[10px] font-medium uppercase text-muted">Loyalty Points</p>
                  <p className="tabular mt-0.5 text-sm font-bold text-brand-deep">
                    {fmtNumber(activeCustomer.loyalty.totalPoints)} pts
                  </p>
                  <p className="text-[10px] text-muted">= ₹{fmtNumber(activeCustomer.loyalty.rewardRupees)} credit</p>
                </div>
                <div className="rounded-md border border-line bg-panel p-2 text-center">
                  <p className="text-[10px] font-medium uppercase text-muted">RFM Ratio</p>
                  <p className="tabular mt-0.5 text-sm font-bold text-ink">
                    {activeCustomer.loyalty.rfmCode} ({activeCustomer.loyalty.rfmRatioPct}%)
                  </p>
                  <p className="truncate text-[10px] text-muted">{activeCustomer.loyalty.rfmSegment}</p>
                </div>
                <div className="rounded-md border border-line bg-panel p-2 text-center">
                  <p className="text-[10px] font-medium uppercase text-muted">Orders &amp; Spend</p>
                  <p className="tabular mt-0.5 text-sm font-bold text-ink">
                    {activeCustomer.paidOrdersCount} · {formatValue(activeCustomer.totalSpent, "inr")}
                  </p>
                  <p className="text-[10px] text-muted">
                    {activeCustomer.avgGapDays ? `Every ~${activeCustomer.avgGapDays}d` : `AOV ${formatValue(activeCustomer.aov, "inr")}`}
                  </p>
                </div>
              </div>

              {/* Mostly Bought & Mostly Dropped Summary */}
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-line bg-panel p-2.5 text-xs">
                  <p className="font-semibold text-success">Mostly bought</p>
                  {activeCustomer.mostlyBought.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {activeCustomer.mostlyBought.slice(0, 3).map((m) => (
                        <li key={m.name} className="flex justify-between gap-1.5">
                          <span className="truncate text-ink">{m.name}</span>
                          <span className="tabular shrink-0 font-semibold text-ink-2">{m.qty}×</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">{activeCustomer.sheetPurchases || "No WhatsApp orders yet"}</p>
                  )}
                </div>
                <div className="rounded-md border border-line bg-panel p-2.5 text-xs">
                  <p className="font-semibold text-warning">Mostly dropped / hesitated</p>
                  {activeCustomer.mostlyDropped.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {activeCustomer.mostlyDropped.slice(0, 3).map((d) => (
                        <li key={d.name} className="flex justify-between gap-1.5">
                          <span className="truncate text-ink">{d.name}</span>
                          <span className="tabular shrink-0 font-semibold text-danger">{d.qty}×</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted">0 dropped items</p>
                  )}
                </div>
              </div>

              {/* Award / Redeem Loyalty Points directly */}
              {data.canManage && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-2">
                  <span className="mr-1 text-[11px] font-semibold text-ink-2">Give loyalty points:</span>
                  <ActionButton action={adjustLoyaltyPoints.bind(null, activeCustomer.id, 50)} variant="secondary" size="sm">
                    +50 pts
                  </ActionButton>
                  <ActionButton action={adjustLoyaltyPoints.bind(null, activeCustomer.id, 100)} variant="secondary" size="sm">
                    +100 pts
                  </ActionButton>
                  <ActionButton action={adjustLoyaltyPoints.bind(null, activeCustomer.id, 200)} variant="secondary" size="sm">
                    +200 VIP
                  </ActionButton>
                  {activeCustomer.loyalty.totalPoints >= 100 && (
                    <ActionButton
                      action={adjustLoyaltyPoints.bind(null, activeCustomer.id, -100)}
                      variant="ghost"
                      size="sm"
                      confirm={`Redeem 100 points (₹50 discount) for ${activeCustomer.name}?`}
                    >
                      Redeem 100
                    </ActionButton>
                  )}
                </div>
              )}

              {/* Smart Offer Suggestion Box */}
              <div className="mt-3 rounded-control border border-brand/30 bg-brand-soft/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wide text-brand-deep">
                    <Sparkles aria-hidden className="size-3.5" /> Smart offer suggestion
                  </span>
                  <Badge tone="green">{activeCustomer.loyalty.offerBadge}</Badge>
                </div>
                <p className="mt-1 text-xs font-semibold text-ink">{activeCustomer.loyalty.offerHeadline}</p>
                <p className="mt-0.5 text-[11px] text-muted">{activeCustomer.loyalty.offerReason}</p>
                <p className="mt-2 rounded-md bg-panel p-2 text-xs leading-relaxed text-ink shadow-2xs">
                  {activeCustomer.loyalty.whatsappOfferCopy}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => copyOffer(activeCustomer)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline"
                  >
                    {copiedId === activeCustomer.id ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                    {copiedId === activeCustomer.id ? "Copied offer" : "Copy offer text"}
                  </button>
                  <a
                    href={`https://wa.me/${activeCustomer.phone}?text=${encodeURIComponent(activeCustomer.loyalty.whatsappOfferCopy)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonClass("primary", "sm")}
                  >
                    <MessageCircle aria-hidden className="size-3.5" /> Send offer on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

