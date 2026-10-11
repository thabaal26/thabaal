"use client";

import { ArrowRight, Check, Copy, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartBar3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader, type Tone } from "@/components/ui";
import { ActionLine, DonutPanel, ProgressRings, StackedRows, StatChip, type ChartColor, type Slice } from "@/components/viz";
import { cssColor } from "@/lib/chart-theme";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtNumber, pct } from "@/lib/format";

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. PRODUCT PERFORMANCE
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
  const [open, setOpen] = useState<string | null>(null);

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

  const list = data.products
    .filter((p) => !group || groupOf(p.status) === group)
    .sort((a, b) => b.soldRevenue + b.cartValue + b.droppedValue - (a.soldRevenue + a.cartValue + a.droppedValue) || b.allTimeBuyers - a.allTimeBuyers);
  const openItem = list.find((p) => p.id === open) ?? null;
  const zeroSale = data.notSellingCount + data.dormantPastCount;

  return (
    <Card id="all-products-intelligence" className="card-3d scroll-mt-24">
      <CardHeader
        tone="gold"
        icon={<Trophy3D />}
        title="Product performance"
        description={`All ${fmtNumber(data.products.length)} products, ${data.periodLabel}`}
        action={
          <Link href="/dashboard/catalogue" className={buttonClass("secondary", "sm")}>
            Catalogue
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink">Products by status</h4>
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
          <h4 className="mb-3 text-sm font-semibold text-ink">Where the money is</h4>
          <DonutPanel slices={moneySlices} format="inr" centerLabel="sold + in carts + dropped" label="Sales value by stage" size={156} />
        </div>
      </div>

      {zeroSale > 0 && (
        <div className="px-4 pb-4 sm:px-5">
          <ActionLine href="/dashboard/campaigns/new" cta="Promote them">
            <b className="text-ink">{plural(zeroSale, "product")}</b> had no sales this period. Pair them as a small add-on with your best seller.
          </ActionLine>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 border-t border-line p-4 sm:p-5 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <h4 className="mb-3 text-sm font-semibold text-ink">By category</h4>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-ink">
              {group ? GROUPS[group].label : "Every product"} <span className="tabular font-normal text-muted">· {list.length}</span>
            </h4>
            {group && (
              <button type="button" onClick={() => setGroup(null)} className="text-xs font-semibold text-brand-deep hover:underline">
                Show all
              </button>
            )}
          </div>
          <div className="thin-scroll max-h-[440px] overflow-y-auto pr-1">
            <StackedRows
              format="inr"
              activeKey={open}
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
            <p className="mt-3 text-2xs text-muted">Tap a product to see why and what to do next.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

function ProductDetail({ p }: { p: AllProductAnalyticsItem }) {
  return (
    <div className="mt-3 rounded-control border border-line bg-subtle/60 p-3.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`/dashboard/customers?tag=${encodeURIComponent(`product:${p.name}`)}`} className="text-sm font-semibold text-ink hover:underline">
          {p.name}
        </Link>
        <Badge tone={p.statusTone}>{p.statusLabel}</Badge>
        {!p.inStock && <Badge tone="red">Out of stock</Badge>}
        {p.anchorKeptCount > 0 && <Badge tone="green">Kept {p.anchorKeptCount}×</Badge>}
        {p.priceAmount > 0 && <span className="tabular text-xs text-muted">{formatValue(p.priceAmount, "inr")}</span>}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Sold" value={`${fmtNumber(p.soldQty)} · ${formatValue(p.soldRevenue, "inr")}`} tone={p.soldQty ? "good" : "ink"} />
        <StatChip label="In unpaid cart" value={`${fmtNumber(p.cartQty)} · ${formatValue(p.cartValue, "inr")}`} tone={p.cartQty ? "warn" : "ink"} />
        <StatChip label="Dropped" value={`${fmtNumber(p.droppedQty)} · ${formatValue(p.droppedValue, "inr")}`} tone={p.droppedQty ? "bad" : "ink"} />
        <StatChip label="Past buyers" value={fmtNumber(p.allTimeBuyers)} />
      </div>
      {p.campaignSent > 0 && (
        <p className="tabular mt-2 text-2xs text-muted">
          Last 30 days: messaged {fmtNumber(p.campaignSent)} buyers · {pct(p.campaignRead, p.campaignSent)}% read · {plural(p.campaignReplies, "reply", "replies")}
        </p>
      )}
      <p className="mt-2.5 text-xs text-ink-2">
        <b className="text-ink">Why:</b> {p.diagnosis}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        <b className="text-ink">Do next:</b> {p.solution}
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href={p.nextActionHref} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
          {p.nextActionLabel} <ArrowRight aria-hidden className="size-3.5" />
        </Link>
        <Link href={`/dashboard?product=${encodeURIComponent(p.name)}&range=90d`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
          Dashboard for this product <ArrowRight aria-hidden className="size-3.5" />
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

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-5">
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
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                  s.id === active.id ? "border-ink bg-ink text-panel" : "border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink",
                )}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: cssColor(s.color) }} />
                {s.shortTitle}
                <span className="tabular opacity-70">{fmtNumber(s.customersCount)}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-card border border-line p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge tone={active.badgeTone}>{active.badge}</Badge>
                <h3 className="mt-1.5 text-base font-semibold text-ink">{active.title}</h3>
                <p className="tabular mt-0.5 text-xs text-muted">
                  {plural(active.customersCount, "customer")} · {active.revenueLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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

            <div className="mt-4 rounded-control bg-brand-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wide text-brand-deep">Message to send</span>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                  {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-1.5 rounded-[10px] rounded-tl-none bg-panel px-3 py-2 text-sm leading-relaxed text-ink shadow-2xs">{active.suggestedWhatsappCopy}</p>
            </div>

            <details className="group/s mt-3">
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
              <div className="mt-4 border-t border-line pt-3">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted">Customers in this group</p>
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

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span className="flex flex-wrap gap-3">
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
        title="Campaigns by product group"
        description="Last 30 days · how far messages got with each buyer group"
        action={best ? <Badge tone="green">Best read: {best.tag}</Badge> : undefined}
      />
      <div className="p-4 sm:p-5">
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
