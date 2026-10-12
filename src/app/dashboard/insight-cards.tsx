import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin3D, ShoppingBag3D, Sparkles3D, Target3D } from "@/components/icons-3d";
import { Badge, Card, CardHeader } from "@/components/ui";
import { ActionLine, BarList, ChangeDumbbells, Disclosure, DonutPanel, ProgressRings, StatChip, type Slice } from "@/components/viz";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { CartMentalitySummaryData, CustomerScenariosData, ScenarioLead } from "./overview-cards";

const plural = (n: number, one: string, many = `${one}s`) => `${fmtNumber(n)} ${n === 1 ? one : many}`;

/* ───────────────────────── Customer journey ───────────────────────── */

function LeadChips({ leads }: { leads: ScenarioLead[] }) {
  if (!leads.length) return <p className="text-2xs text-muted">No names to show.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {leads.map((l) => (
        <li key={`${l.customerId}-${l.at.toISOString()}`}>
          <Link
            href={l.href}
            title={`${l.detail} · ${fmtDate(l.at, "d MMM, h:mm a")}`}
            className="inline-flex max-w-[15rem] items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-ink-2 transition hover:border-line-2 hover:text-ink"
          >
            <span className="truncate font-medium">{l.name}</span>
            {l.amount !== undefined && l.amount > 0 && <span className="tabular shrink-0 text-muted">{formatValue(l.amount, "inr")}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Where customers stopped this period, as one donut, two conversion rings and names on demand. */
export function CustomerScenariosCard({ data }: { data: CustomerScenariosData }) {
  const groups = [
    { key: "bought", label: "Bought", color: "emerald", value: data.convertedBuyers.customers, sub: `${formatValue(data.convertedBuyers.revenue, "inr")} · ${plural(data.convertedBuyers.repeatBuyers, "repeat buyer")}`, href: "/dashboard/orders?show=all", leads: data.convertedBuyers.leads, tip: "Send dispatch updates and set a reorder reminder." },
    { key: "unpaid", label: "Cart sent, not paid", color: "gold", value: data.addedToCartUnpaid.customers, sub: `${formatValue(data.addedToCartUnpaid.value, "inr")} in ${plural(data.addedToCartUnpaid.carts, "cart")}`, href: "/dashboard/orders?show=unpaid", leads: data.addedToCartUnpaid.leads, tip: "Follow up with a 1-tap UPI link or offer COD." },
    { key: "replaced", label: "Cart replaced / cancelled", color: "red", value: data.cancelledCarts.customers, sub: `${formatValue(data.cancelledCarts.value, "inr")} revised away`, href: "/dashboard?view=carts", leads: data.cancelledCarts.leads, tip: "See which items they removed in the Carts view." },
    { key: "browsed", label: "Browsed, no cart", color: "blue", value: data.browsedNoCart.customers, sub: "viewed catalogue or prices", href: "/dashboard/replies", leads: data.browsedNoCart.leads, tip: "Send a personal pick before the 24h window closes." },
    { key: "chatting", label: "Chatting, no catalogue", color: "violet", value: data.repliedInquiryOnly.customers, sub: "asked or replied", href: "/dashboard/replies?show=all", leads: data.repliedInquiryOnly.leads, tip: "Send the catalogue from their chat in one tap." },
    { key: "silent", label: "Read, no action", color: "neutral", value: data.readNoAction.customers, sub: "opened the message only", href: "/dashboard/messages?status=READ", leads: [], tip: "Try clearer buttons like ‘View price list’ next time." },
  ];
  const slices: Slice[] = groups.map((g) => ({ key: g.key, label: g.label, value: g.value, color: g.color, href: g.href, sub: g.sub }));
  const reached = groups.reduce((n, g) => n + g.value, 0);
  const named = groups.filter((g) => g.leads.length);

  return (
    <Card id="customer-scenarios" className="card-3d scroll-mt-24">
      <CardHeader tone="brand" icon={<Target3D />} title="Customer journey" description={`Where each customer got to, ${data.periodLabel}`} />
      <div className="grid grid-cols-1 gap-4 p-3 sm:gap-5 sm:p-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {reached ? (
            <DonutPanel slices={slices} centerLabel="customers engaged" label="Customers by furthest step reached" />
          ) : (
            <p className="py-6 text-center text-sm text-muted sm:py-8">No customer activity in this period yet.</p>
          )}
        </div>
        <div className="flex flex-col justify-center gap-3 border-t border-line pt-3 sm:gap-4 sm:pt-4 lg:col-span-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <ProgressRings
            label="Conversion rates"
            title="Conversion rates"
            size={92}
            rings={[
              { key: "cat", label: "Catalogue → cart", value: data.catalogueToCartPct, color: "gold" },
              { key: "paid", label: "Cart → paid", value: data.cartToBuyPct, color: "emerald" },
              { key: "buy", label: "Engaged → bought", value: reached ? Math.round((data.convertedBuyers.customers / reached) * 100) : 0, color: "blue", sub: `${fmtNumber(data.convertedBuyers.customers)} of ${fmtNumber(reached)}` },
            ]}
          />
          {data.addedToCartUnpaid.value > 0 && (
            <ActionLine href="/dashboard/orders?show=unpaid" cta="Follow up">
              <b className="text-ink">{formatValue(data.addedToCartUnpaid.value, "inr")}</b> is waiting in unpaid carts.
            </ActionLine>
          )}
        </div>
      </div>
      {named.length > 0 && (
        <Disclosure summary={<>Who is in each group</>}>
          <div className="grid grid-cols-1 gap-3.5 sm:gap-4 md:grid-cols-2">
            {named.map((g) => (
              <div key={g.key}>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink sm:text-sm">
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: g.color }} />
                  {g.label}
                  <span className="tabular font-normal text-muted">· {fmtNumber(g.value)}</span>
                </p>
                <p className="mb-1.5 mt-0.5 text-2xs text-muted sm:mb-2">{g.tip}</p>
                <LeadChips leads={g.leads} />
              </div>
            ))}
          </div>
        </Disclosure>
      )}
    </Card>
  );
}

/* ───────────────────────── Cart revisions ───────────────────────── */

const BEHAVIOUR = {
  downsized: { label: "Cut budget", color: "red" },
  upsized: { label: "Added more", color: "emerald" },
  swapped: { label: "Swapped items", color: "blue" },
  duplicate_retry: { label: "Re-sent same cart", color: "gold" },
} as const;

function ItemPills({ items, tone }: { items: { name: string; quantity: number; price: number }[]; tone: "red" | "green" | "brand" }) {
  return (
    <>
      {items.map((i) => (
        <Badge key={i.name} tone={tone}>
          {i.name}
          {i.price > 0 ? ` · ${formatValue(i.price * i.quantity, "inr")}` : ""}
        </Badge>
      ))}
    </>
  );
}

/** Customers who sent more than one cart: what they cut, what they kept, and how the total moved. */
export function CartMentalityCard({ data }: { data: CartMentalitySummaryData }) {
  if (data.totalRevisers === 0 && data.droppedProducts.length === 0) {
    return (
      <Card className="card-3d">
        <CardHeader tone="amber" icon={<Sparkles3D />} title="Cart revisions" description={`No customer changed their cart ${data.periodLabel}.`} />
      </Card>
    );
  }
  const slices: Slice[] = [
    { key: "downsized", label: BEHAVIOUR.downsized.label, value: data.downsizedCount, color: BEHAVIOUR.downsized.color, sub: data.downsizedValueLost ? `−${formatValue(data.downsizedValueLost, "inr")}` : undefined },
    { key: "swapped", label: BEHAVIOUR.swapped.label, value: data.swappedCount, color: BEHAVIOUR.swapped.color },
    { key: "upsized", label: BEHAVIOUR.upsized.label, value: data.upsizedCount, color: BEHAVIOUR.upsized.color, sub: data.upsizedValueGained ? `+${formatValue(data.upsizedValueGained, "inr")}` : undefined },
    { key: "retry", label: BEHAVIOUR.duplicate_retry.label, value: data.retriedCount, color: BEHAVIOUR.duplicate_retry.color, sub: "wanted a fresh pay link" },
  ];
  const topDropped = data.droppedProducts[0];

  return (
    <Card className="card-3d">
      <CardHeader
        tone="amber"
        icon={<Sparkles3D />}
        title="Cart revisions & hesitation"
        description={`Customers who changed their cart before paying, ${data.periodLabel}`}
        action={
          <Link href="/dashboard/orders?show=cancelled" className="text-xs font-semibold text-brand-deep hover:underline">
            Replaced carts →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2 border-b border-line bg-subtle/50 p-3 sm:grid-cols-4 sm:gap-2.5 sm:p-5">
        <StatChip label="Customers revising" value={fmtNumber(data.totalRevisers)} />
        <StatChip label="Carts replaced" value={fmtNumber(data.totalSupersededCarts)} />
        <StatChip label="Budget trimmed" value={data.downsizedValueLost ? `−${formatValue(data.downsizedValueLost, "inr")}` : "₹0"} tone={data.downsizedValueLost ? "bad" : "ink"} />
        <StatChip label="Added on revision" value={data.upsizedValueGained ? `+${formatValue(data.upsizedValueGained, "inr")}` : "₹0"} tone={data.upsizedValueGained ? "good" : "ink"} />
      </div>

      <div className="grid grid-cols-1 gap-4 p-3 sm:gap-6 sm:p-5 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <h4 className="mb-2 text-xs font-semibold text-ink sm:mb-3 sm:text-sm">What they did</h4>
          <DonutPanel slices={slices} centerLabel="revised carts" label="Cart revisions by behaviour" size={156} />
        </div>
        <div className="xl:col-span-7">
          <h4 className="mb-2 text-xs font-semibold text-ink sm:mb-3 sm:text-sm">First cart → latest cart</h4>
          {data.journeys.length ? (
            <ChangeDumbbells
              fromLabel="First cart"
              toLabel="Latest"
              rows={data.journeys.map((j) => ({
                key: j.latestOrderId,
                label: j.customerName,
                href: `/dashboard/customers/${j.customerId}`,
                from: j.firstCartTotal,
                to: j.latestTotal,
                tag: `${j.attemptCount} carts · ${j.latestPaid ? "paid" : "unpaid"}`,
                tagTone: j.latestPaid ? "good" : "bad",
              }))}
            />
          ) : (
            <p className="text-sm text-muted">No multi-cart customers in this period.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-line p-3 sm:gap-6 sm:p-5 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold text-ink sm:text-sm">Dropped from carts</h4>
          <p className="mb-2 text-2xs text-muted sm:mb-3">Wanted, then removed: price or pack-size hesitation</p>
          <BarList
            format="inr"
            color="red"
            empty="Nothing dropped in this period."
            items={data.droppedProducts.map((d) => ({
              key: d.name,
              label: d.name,
              value: d.droppedValue,
              href: `/dashboard/customers?tag=${encodeURIComponent(`product:${d.name}`)}`,
              sub: `${plural(d.droppedQty, "unit")} · ${plural(d.droppedCount, "cart")} · ${d.customerNames.slice(0, 2).join(", ")}${d.customerNames.length > 2 ? ` +${d.customerNames.length - 2}` : ""}`,
            }))}
          />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-ink sm:text-sm">Always kept</h4>
          <p className="mb-2 text-2xs text-muted sm:mb-3">Never removed, even when the budget was cut</p>
          <BarList
            color="emerald"
            empty="No anchor products yet."
            items={data.anchorProducts.map((a) => ({
              key: a.name,
              label: a.name,
              value: a.keptCount,
              display: `Kept ${a.keptCount}×`,
              href: `/dashboard/customers?tag=${encodeURIComponent(`product:${a.name}`)}`,
              sub: a.customerNames.slice(0, 2).join(", "),
            }))}
          />
        </div>
      </div>

      {topDropped && (
        <div className="px-3 pb-3 sm:px-5 sm:pb-5">
          <ActionLine href="/dashboard/campaigns/new" cta="Create offer">
            <b className="text-ink">{topDropped.name}</b> is dropped most. Try a smaller pack or a combo with a kept item{data.anchorProducts[0] ? ` like ${data.anchorProducts[0].name}` : ""}.
          </ActionLine>
        </div>
      )}

      {data.journeys.length > 0 && (
        <Disclosure summary="Cart-by-cart changes">
          <ul className="divide-y divide-line">
            {data.journeys.map((j) => (
              <li key={j.latestOrderId} className="py-2.5 first:pt-0 last:pb-0 sm:py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/dashboard/customers/${j.customerId}`} className="text-xs font-semibold text-ink hover:underline sm:text-sm">
                    {j.customerName}
                  </Link>
                  <span className="tabular text-2xs text-muted">
                    {j.firstCartRef} → {j.latestOrderRef} · {fmtDate(j.at, "d MMM, h:mm a")}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <ItemPills items={j.droppedItems} tone="red" />
                  <ItemPills items={j.addedItems} tone="green" />
                  <ItemPills items={j.keptItems} tone="brand" />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 flex flex-wrap gap-3 text-2xs text-muted sm:mt-3">
            <span><Badge tone="red">red</Badge> dropped</span>
            <span><Badge tone="green">green</Badge> added</span>
            <span><Badge tone="brand">teal</Badge> kept</span>
          </p>
        </Disclosure>
      )}
    </Card>
  );
}

/* ───────────────────────── Customer mix ───────────────────────── */

/** Fixed palette order; past six groups the rest fold into "Other". */
const MIX_COLORS = ["emerald", "blue", "gold", "violet", "coral", "cyan"] as const;

/** What customers buy (catalogue products only), as a donut whose slices open that product's buyers. */
export function CustomerProductsCard({ items }: { items: { tag: string; label: string; n: number }[] }) {
  if (!items.length) return null;
  const top = items.slice(0, 6);
  const rest = items.slice(6).reduce((n, t) => n + t.n, 0);
  const slices: Slice[] = [
    ...top.map((t, i) => ({ key: t.tag, label: t.label, value: t.n, color: MIX_COLORS[i], href: `/dashboard/customers?tag=${encodeURIComponent(t.tag)}` })),
    ...(rest ? [{ key: "_other", label: "Other products", value: rest, color: "neutral", href: "/dashboard/customers" }] : []),
  ];
  return (
    <Card className="card-3d h-full">
      <CardHeader tone="gold" icon={<ShoppingBag3D />} title="What customers buy" description="Customers per catalogue product · tap to open them" />
      <div className="p-3 sm:p-5">
        <DonutPanel slices={slices} centerLabel="product buyers" label="Customers by catalogue product" size={160} />
      </div>
    </Card>
  );
}

const AREA_COLORS = ["emerald", "blue", "violet", "gold", "coral", "cyan"] as const;

export function CustomerAreasCard({ regions, children }: { regions: { key: string; label: string; n: number; href: string }[]; children?: ReactNode }) {
  if (regions.length < 2) return null;
  const slices: Slice[] = regions.map((r, i) => ({ key: r.key, label: r.label, value: r.n, color: AREA_COLORS[i] ?? "neutral", href: `/dashboard/customers?area=${encodeURIComponent(r.href)}` }));
  return (
    <Card className="card-3d h-full">
      <CardHeader tone="info" icon={<MapPin3D />} title="Customers by area" description="From the order sheets · tap to open" />
      <div className="space-y-4 p-3 sm:space-y-5 sm:p-5">
        <DonutPanel slices={slices} centerLabel="customers" label="Customers by region" size={160} />
        {children}
      </div>
    </Card>
  );
}
