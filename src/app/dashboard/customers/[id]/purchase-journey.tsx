import { orderRef } from "@/lib/order-ref";
import type { Order } from "@prisma/client";
import { MessageCircle, PackageCheck, ShoppingCart, Sparkles, TriangleAlert } from "@/components/icons";
import { ShoppingBag3D, Trophy3D } from "@/components/icons-3d";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, Meter, type Tone } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { ColumnChart, StatChip } from "@/components/viz";
import { formatValue } from "@/lib/chart-math";
import { cssColor } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { APP_TZ, fmtDate, fmtNumber } from "@/lib/format";
import { computeCustomerLoyalty } from "@/lib/loyalty";
import type { OrderItem } from "@/lib/orders";
import { formatInTimeZone } from "date-fns-tz";
import { adjustLoyaltyPoints } from "../../actions/customers";

const DAY = 86_400_000;
// Paid = emerald, waiting = gold, replaced or cancelled = neutral: the same meaning as every chart.
const PAID = "emerald";
const OPEN = "gold";
const DROPPED = "neutral";

const bought = (o: Pick<Order, "paidAt" | "status">) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);
const kind = (o: Order) => (o.status === "CANCELLED" ? "dropped" : bought(o) ? "paid" : "open");

const TIME_WINDOWS = [
  "12am–3am",
  "3am–6am",
  "6am–9am",
  "9am–12pm",
  "12pm–3pm",
  "3pm–6pm",
  "6pm–9pm",
  "9pm–12am",
];

/** Every cart this customer sent, oldest to newest: what they mostly bought, what they dropped, RFM ratio, loyalty points, and smart offer. */
export function PurchaseJourney({
  customer,
  brandName,
  canManage = false,
  orders,
  replies = [],
  readDates = [],
  sheetPurchases,
  now = new Date(),
}: {
  customer?: { id: string; name: string; phone: string; tags: string[] };
  brandName?: string;
  canManage?: boolean;
  orders: Order[];
  replies?: { receivedAt: Date; text: string; kind: string }[];
  readDates?: Date[];
  sheetPurchases?: string | null;
  now?: Date;
}) {
  if (!orders.length && !replies.length && !sheetPurchases && !customer) return null;

  const list = [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const paid = list.filter((o) => kind(o) === "paid");
  const openCarts = list.filter((o) => kind(o) === "open");
  const droppedCarts = list.filter((o) => kind(o) === "dropped");

  const spent = paid.reduce((n, o) => n + o.total, 0);
  const unpaidCartValue = openCarts.reduce((n, o) => n + o.total, 0);
  const aov = paid.length > 0 ? Math.round(spent / paid.length) : 0;
  const gaps = paid.slice(1).map((o, i) => (o.createdAt.getTime() - paid[i].createdAt.getTime()) / DAY).filter((g) => g >= 4);
  const avgGap = gaps.length ? Math.round(gaps.reduce((n, g) => n + g, 0) / gaps.length) : null;
  const last = paid[paid.length - 1];
  const daysSinceLastOrder = last ? Math.max(0, Math.round((now.getTime() - last.createdAt.getTime()) / DAY)) : null;
  const nextIn = last && avgGap ? Math.round((last.createdAt.getTime() + avgGap * DAY - now.getTime()) / DAY) : null;

  // 1. Mostly Bought Products (aggregated across all paid/confirmed orders)
  const boughtMap = new Map<string, { name: string; qty: number; ordersCount: number; spent: number; lastAt: Date }>();
  for (const o of paid) {
    const seenInOrder = new Set<string>();
    for (const it of (o.items as OrderItem[] | null) ?? []) {
      const rawName = (it.name ?? it.id ?? "").trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const existing = boughtMap.get(key) ?? { name: rawName, qty: 0, ordersCount: 0, spent: 0, lastAt: o.createdAt };
      existing.qty += qty;
      existing.spent += price * qty;
      if (!seenInOrder.has(key)) {
        existing.ordersCount += 1;
        seenInOrder.add(key);
      }
      if (o.createdAt > existing.lastAt) existing.lastAt = o.createdAt;
      boughtMap.set(key, existing);
    }
  }
  const mostlyBought = [...boughtMap.values()].sort((a, b) => b.qty - a.qty || b.spent - a.spent);
  const maxBoughtQty = Math.max(1, mostlyBought[0]?.qty ?? 1);

  // 2. Mostly Dropped / Hesitated Products (from replaced or cancelled carts)
  const droppedMap = new Map<string, { name: string; qty: number; cartsCount: number; value: number; boughtLater: boolean }>();
  for (const o of droppedCarts) {
    const seenInCart = new Set<string>();
    for (const it of (o.items as OrderItem[] | null) ?? []) {
      const rawName = (it.name ?? it.id ?? "").trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      const qty = Number(it.quantity) || 1;
      const price = Number(it.price) || 0;
      const existing = droppedMap.get(key) ?? {
        name: rawName,
        qty: 0,
        cartsCount: 0,
        value: 0,
        boughtLater: boughtMap.has(key),
      };
      existing.qty += qty;
      existing.value += price * qty;
      if (!seenInCart.has(key)) {
        existing.cartsCount += 1;
        seenInCart.add(key);
      }
      droppedMap.set(key, existing);
    }
  }
  const mostlyDropped = [...droppedMap.values()].sort((a, b) => b.cartsCount - a.cartsCount || b.value - a.value);

  // 3. Active Unpaid Cart Items right now
  const unpaidItems = openCarts.flatMap((o) =>
    ((o.items as OrderItem[] | null) ?? []).map((it) => ({
      orderRef: orderRef(o),
      name: (it.name ?? it.id ?? "Item").trim(),
      qty: Number(it.quantity) || 1,
      value: (Number(it.price) || 0) * (Number(it.quantity) || 1),
    })),
  );

  // 4. Customer Activity & Best Time to Message
  const activityDates = [...replies.map((r) => r.receivedAt), ...readDates];
  const bucketCounts = new Array<number>(8).fill(0);
  for (const d of activityDates) {
    const hour = Number(formatInTimeZone(d, APP_TZ, "H"));
    const bucket = Math.min(7, Math.floor(hour / 3));
    bucketCounts[bucket] += 1;
  }
  const bestBucketIdx = bucketCounts.reduce((bestIdx, count, idx) => (count > bucketCounts[bestIdx] ? idx : bestIdx), 0);
  const bestTimeLabel = bucketCounts[bestBucketIdx] > 0 ? TIME_WINDOWS[bestBucketIdx] : null;

  // 5. Loyalty Points, RFM Ratio & Smart Offer Engine
  const loyalty = computeCustomerLoyalty({
    name: customer?.name ?? "Customer",
    brandName,
    paidOrdersCount: paid.length,
    totalSpent: spent,
    sheetPurchases,
    tags: customer?.tags,
    favoriteProduct: mostlyBought[0]?.name ?? null,
    droppedProduct: mostlyDropped.find((d) => !d.boughtLater)?.name ?? mostlyDropped[0]?.name ?? null,
    unpaidCartValue,
    daysSinceLastOrder,
    avgGapDays: avgGap,
    // Points used on orders that still stand (a cancelled order gave its points back).
    redeemedPoints: list.reduce((n, o) => n + (o.status !== "CANCELLED" ? (o.pointsRedeemed ?? 0) : 0), 0),
  });

  // Buyer Persona Badge
  const persona: { label: string; tone: Tone } =
    paid.length >= 3
      ? { label: "VIP Repeat Champion", tone: "green" }
      : paid.length === 2
        ? { label: "Repeat Buyer", tone: "green" }
        : paid.length === 1 && droppedCarts.length > 0
          ? { label: "Cart Reviser · Converted", tone: "blue" }
          : paid.length === 1
            ? { label: "First-Time Buyer", tone: "green" }
            : openCarts.length > 0
              ? { label: "Unpaid Cart Waiting", tone: "amber" }
              : droppedCarts.length > 0
                ? { label: "Cart Hesitator (Dropped)", tone: "red" }
                : sheetPurchases
                  ? { label: "Past Sheet Buyer", tone: "violet" }
                  : { label: "Inquiry / Contact", tone: "gray" };

  return (
    <Card className="card-3d">
      <CardHeader
        tone="gold"
        icon={<ShoppingBag3D />}
        title="Customer product, RFM & loyalty intelligence"
        description="What this customer mostly buys, what they dropped from carts, their RFM ratio, and loyalty rewards"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={loyalty.tierTone}>{loyalty.tierLabel} · {fmtNumber(loyalty.totalPoints)} pts</Badge>
            <Badge tone={persona.tone}>{persona.label}</Badge>
          </div>
        }
      />

      {/* Top KPI strip */}
      <div className="grid grid-cols-2 gap-2 border-b border-line bg-subtle/50 p-3 sm:grid-cols-5 sm:gap-2.5 sm:p-4">
        <StatChip label="Total spent" value={formatValue(spent, "inr")} tone={spent ? "good" : "ink"} />
        <StatChip label="Paid orders" value={paid.length ? `${fmtNumber(paid.length)} (avg ₹${fmtNumber(aov)})` : "0"} />
        <StatChip
          label="RFM ratio (R·F·M)"
          value={`${loyalty.rfmCode} (${loyalty.rfmRatioPct}%)`}
          tone={loyalty.rfmRatioPct >= 75 ? "good" : loyalty.rfmRatioPct >= 50 ? "warn" : "ink"}
        />
        <StatChip
          label="Next refill"
          value={nextIn === null ? (avgGap ? `~${avgGap}d` : "—") : nextIn < 0 ? `${Math.abs(nextIn)}d overdue` : nextIn === 0 ? "today" : `in ${nextIn}d`}
          tone={nextIn !== null && nextIn < 0 ? "bad" : "ink"}
        />
        <StatChip label="Best time to message" value={bestTimeLabel ?? "Not known yet"} />
      </div>

      {/* Loyalty Points, RFM Breakdown & Smart Offer Suggestion */}
      <div className="border-b border-line bg-brand-soft/30 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Left: Loyalty Points Balance & Manual Point Controls */}
          <div className="rounded-control border border-line bg-panel p-3 sm:p-3.5 lg:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Trophy3D className="size-5 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-ink sm:text-sm">
                    Loyalty wallet: <span className="tabular text-brand-deep">{fmtNumber(loyalty.totalPoints)} pts</span>{" "}
                    <span className="font-normal text-muted">(= ₹{fmtNumber(loyalty.rewardRupees)} reward value)</span>
                  </h4>
                  <p className="text-[11px] text-muted">
                    1 pt per ₹100 spent + 50 bonus pts per repeat order · 100 pts = ₹50 off
                  </p>
                </div>
              </div>
              <Badge tone={loyalty.rfmTone}>{loyalty.rfmSegment}</Badge>
            </div>

            {/* Points breakdown pills */}
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-md bg-subtle px-2 py-0.5 text-ink-2">
                Spend: <strong className="tabular text-ink">+{loyalty.spendPoints} pts</strong>
              </span>
              <span className="rounded-md bg-subtle px-2 py-0.5 text-ink-2">
                Repeat frequency: <strong className="tabular text-ink">+{loyalty.frequencyPoints} pts</strong>
              </span>
              {loyalty.sheetPoints > 0 && (
                <span className="rounded-md bg-subtle px-2 py-0.5 text-ink-2">
                  Past sheet: <strong className="tabular text-ink">+{loyalty.sheetPoints} pts</strong>
                </span>
              )}
              {loyalty.manualPoints !== 0 && (
                <span className={cn("rounded-md px-2 py-0.5 font-medium", loyalty.manualPoints > 0 ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
                  Admin adjustment: <strong className="tabular">{loyalty.manualPoints > 0 ? `+${loyalty.manualPoints}` : loyalty.manualPoints} pts</strong>
                </span>
              )}
              <span className="rounded-md bg-subtle px-2 py-0.5 text-ink-2" title="Recency (1-5) · Frequency (1-5) · Monetary (1-5)">
                RFM: <strong className="tabular text-ink">R:{loyalty.rScore} · F:{loyalty.fScore} · M:{loyalty.mScore}</strong>
              </span>
            </div>

            {loyalty.nextTierLabel && (
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                  <span>Progress to <strong className="text-ink-2">{loyalty.nextTierLabel}</strong></span>
                  <span className="tabular">{loyalty.pointsToNextTier} more pts needed</span>
                </div>
                <Meter value={loyalty.progressPct} label="Tier progress" />
              </div>
            )}

            {/* Admin Quick Award / Redeem Loyalty Points */}
            {canManage && customer && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
                <span className="mr-1 text-[11px] font-medium text-muted">Give / redeem points:</span>
                <ActionButton
                  action={adjustLoyaltyPoints.bind(null, customer.id, 50)}
                  variant="secondary"
                  size="sm"
                  title="Award +50 bonus loyalty points (₹25 value)"
                >
                  +50 pts
                </ActionButton>
                <ActionButton
                  action={adjustLoyaltyPoints.bind(null, customer.id, 100)}
                  variant="secondary"
                  size="sm"
                  title="Award +100 bonus loyalty points (₹50 value)"
                >
                  +100 pts
                </ActionButton>
                <ActionButton
                  action={adjustLoyaltyPoints.bind(null, customer.id, 200)}
                  variant="secondary"
                  size="sm"
                  title="Award +200 VIP bonus points (₹100 value)"
                >
                  +200 VIP pts
                </ActionButton>
                {loyalty.totalPoints >= 100 && (
                  <ActionButton
                    action={adjustLoyaltyPoints.bind(null, customer.id, -100)}
                    variant="ghost"
                    size="sm"
                    confirm={`Redeem 100 points for ${customer.name}? Take ₹50 off their order when you confirm it.`}
                  >
                    Redeem 100 pts (-₹50)
                  </ActionButton>
                )}
              </div>
            )}
          </div>

          {/* Right: Smart Offer Recommendation for this customer */}
          <div className="flex flex-col justify-between rounded-control border border-brand/30 bg-panel p-3 sm:p-3.5 lg:col-span-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
                  <Sparkles aria-hidden className="size-4" /> Recommended offer for {customer?.name.split(/\s+/)[0] ?? "this customer"}
                </span>
                <Badge tone="green">{loyalty.offerBadge}</Badge>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-ink sm:text-sm">{loyalty.offerHeadline}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">{loyalty.offerReason}</p>
              <div className="mt-2 rounded-md border border-line bg-subtle/60 px-2.5 py-2 text-xs leading-relaxed text-ink-2">
                &ldquo;{loyalty.whatsappOfferCopy}&rdquo;
              </div>
            </div>
            {customer && (
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2 pt-1">
                <a
                  href={`https://wa.me/${customer.phone}?text=${encodeURIComponent(loyalty.whatsappOfferCopy)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("primary", "sm")}
                >
                  <MessageCircle aria-hidden className="size-3.5" /> Send offer on WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mostly Bought vs Mostly Dropped Breakdown */}
      {(mostlyBought.length > 0 || mostlyDropped.length > 0 || unpaidItems.length > 0 || sheetPurchases) && (
        <div className="grid grid-cols-1 gap-3.5 border-b border-line p-3 sm:gap-5 sm:p-5 md:grid-cols-2">
          {/* Column 1: Mostly Bought Products */}
          <div className="rounded-control border border-line bg-canvas/40 p-3 sm:p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ink sm:text-sm">
                <PackageCheck aria-hidden className="size-4 text-success" /> Mostly bought products
              </h4>
              {mostlyBought.length > 0 && (
                <span className="text-[11px] text-muted">{mostlyBought.length} product{mostlyBought.length === 1 ? "" : "s"}</span>
              )}
            </div>
            {mostlyBought.length > 0 ? (
              <ul className="space-y-2.5">
                {mostlyBought.slice(0, 6).map((item, idx) => (
                  <li key={item.name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-medium text-ink">
                        {idx === 0 && <span className="mr-1 text-2xs font-bold text-success">#1</span>}
                        {item.name}
                      </span>
                      <span className="tabular shrink-0 font-semibold text-ink">
                        {item.qty}× · {formatValue(item.spent, "inr")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/60">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${Math.max(12, Math.round((item.qty / maxBoughtQty) * 100))}%` }}
                        />
                      </div>
                      <span className="tabular shrink-0 text-[10px] text-muted">
                        {item.ordersCount} order{item.ordersCount === 1 ? "" : "s"} · last {fmtDate(item.lastAt, "d MMM")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : sheetPurchases ? (
              <div className="space-y-1 text-xs text-ink-2">
                <p className="font-medium text-ink">Recorded from order sheet:</p>
                <p className="rounded bg-panel p-2 text-xs text-ink-2">{sheetPurchases}</p>
              </div>
            ) : (
              <p className="py-3 text-xs text-muted">No confirmed product purchases yet.</p>
            )}
          </div>

          {/* Column 2: Mostly Dropped / Hesitated Products & Unpaid Carts */}
          <div className="rounded-control border border-line bg-canvas/40 p-3 sm:p-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ink sm:text-sm">
                <TriangleAlert aria-hidden className="size-4 text-warning" /> Mostly dropped / hesitated
              </h4>
              {mostlyDropped.length > 0 && (
                <span className="text-[11px] text-muted">{droppedCarts.length} replaced/cancelled cart{droppedCarts.length === 1 ? "" : "s"}</span>
              )}
            </div>

            {unpaidItems.length > 0 && (
              <div className="mb-2.5 rounded-md border border-warning-border/60 bg-warning-bg/40 p-2.5 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <ShoppingCart aria-hidden className="size-3.5 text-warning" /> Waiting in unpaid cart right now:
                </p>
                <ul className="mt-1 space-y-0.5 text-ink-2">
                  {unpaidItems.map((u, i) => (
                    <li key={`${u.orderRef}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate">{u.qty}× {u.name} <span className="font-mono text-[10px] text-muted">({u.orderRef})</span></span>
                      <span className="tabular font-semibold">{formatValue(u.value, "inr")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mostlyDropped.length > 0 ? (
              <ul className="space-y-2">
                {mostlyDropped.slice(0, 6).map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2 rounded-md bg-panel px-2.5 py-1.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{item.name}</p>
                      <p className="text-[11px] text-muted">
                        Dropped in {item.cartsCount} cart{item.cartsCount === 1 ? "" : "s"} ({item.qty} unit{item.qty === 1 ? "" : "s"})
                        {item.boughtLater ? " · Bought in another order" : " · Never bought"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular block font-semibold text-danger">{formatValue(item.value, "inr")}</span>
                      <Badge tone={item.boughtLater ? "amber" : "red"}>
                        {item.boughtLater ? "Reconsidered" : "Dropped"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-xs text-muted">
                <Sparkles aria-hidden className="mr-1 inline size-3.5 text-brand" />
                Zero dropped or cancelled carts — this customer is decisive when ordering.
              </p>
            )}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <>
          <div className="p-4 sm:p-5">
            <ColumnChart
              format="inr"
              minWidth={Math.max(280, list.length * 36)}
              height={110}
              label="Value of each cart they sent"
              legend={[
                { label: "Paid", color: PAID },
                { label: "Unpaid", color: OPEN },
                { label: "Replaced or cancelled", color: DROPPED },
              ]}
              columns={list.map((o) => ({
                key: o.id,
                label: fmtDate(o.createdAt, "d MMM"),
                parts: [{ key: kind(o), label: kind(o) === "paid" ? "Paid" : kind(o) === "open" ? "Unpaid" : "Replaced", value: o.total, color: kind(o) === "paid" ? PAID : kind(o) === "open" ? OPEN : DROPPED }],
              }))}
            />
          </div>
          <ol className="relative mx-4 mb-4 border-l-2 border-line pl-4 sm:mx-5 sm:mb-5">
            {[...list].reverse().map((o, i, arr) => {
              const k = kind(o);
              const prev = arr[i + 1];
              const gap = prev ? Math.round((o.createdAt.getTime() - prev.createdAt.getTime()) / DAY) : null;
              const items = ((o.items as OrderItem[] | null) ?? []).map((it) => `${it.quantity}× ${it.name ?? it.id}`);
              return (
                <li key={o.id} className="relative pb-3.5 last:pb-0">
                  <span
                    aria-hidden
                    className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-panel"
                    style={{ background: cssColor(k === "paid" ? PAID : k === "open" ? OPEN : DROPPED) }}
                  />
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span className={cn("font-medium", k === "dropped" ? "text-muted line-through" : "text-ink")}>
                      {orderRef(o)} · {formatValue(o.total, "inr")}
                    </span>
                    <span className="tabular text-2xs text-muted">
                      {fmtDate(o.createdAt, "d MMM yyyy")}
                      {gap !== null && gap > 0 ? ` · ${gap}d after previous` : ""}
                    </span>
                  </p>
                  <p className={cn("text-2xs font-semibold uppercase tracking-wide", k === "paid" ? "text-success" : k === "open" ? "text-warning" : "text-muted")}>
                    {k === "paid" ? (o.paidAt ? "Paid" : o.status.toLowerCase()) : k === "open" ? "Not paid yet" : /superseded/i.test(o.internalNote ?? "") ? "Replaced by a newer cart" : "Cancelled"}
                  </p>
                  {items.length > 0 && <p className="mt-0.5 line-clamp-2 text-xs text-ink-2">{items.join(", ")}</p>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Card>
  );
}
