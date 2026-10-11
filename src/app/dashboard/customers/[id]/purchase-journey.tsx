import type { Order } from "@prisma/client";
import { ShoppingBag3D } from "@/components/icons-3d";
import { Card, CardHeader } from "@/components/ui";
import { ColumnChart, StatChip } from "@/components/viz";
import { formatValue } from "@/lib/chart-math";
import { cssColor } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { OrderItem } from "@/lib/orders";

const DAY = 86_400_000;
// Paid = emerald, waiting = gold, replaced or cancelled = neutral: the same meaning as every chart.
const PAID = "emerald";
const OPEN = "gold";
const DROPPED = "neutral";

const bought = (o: Pick<Order, "paidAt" | "status">) => Boolean(o.paidAt) || ["CONFIRMED", "PAID", "DISPATCHED", "DELIVERED"].includes(o.status);
const kind = (o: Order) => (o.status === "CANCELLED" ? "dropped" : bought(o) ? "paid" : "open");

/** Every cart this customer sent, oldest to newest: what they paid, what they left, and how often they come back. */
export function PurchaseJourney({ orders, now = new Date() }: { orders: Order[]; now?: Date }) {
  if (!orders.length) return null;
  const list = [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const paid = list.filter((o) => kind(o) === "paid");
  const spent = paid.reduce((n, o) => n + o.total, 0);
  const gaps = paid.slice(1).map((o, i) => (o.createdAt.getTime() - paid[i].createdAt.getTime()) / DAY).filter((g) => g >= 4);
  const avgGap = gaps.length ? Math.round(gaps.reduce((n, g) => n + g, 0) / gaps.length) : null;
  const last = paid[paid.length - 1];
  const nextIn = last && avgGap ? Math.round((last.createdAt.getTime() + avgGap * DAY - now.getTime()) / DAY) : null;

  return (
    <Card className="card-3d">
      <CardHeader tone="gold" icon={<ShoppingBag3D />} title="Purchase journey" description="Every cart they sent, oldest first" />
      <div className="grid grid-cols-2 gap-2.5 border-b border-line bg-subtle/50 p-4 sm:grid-cols-4 sm:p-5">
        <StatChip label="Spent" value={formatValue(spent, "inr")} tone={spent ? "good" : "ink"} />
        <StatChip label="Paid orders" value={fmtNumber(paid.length)} />
        <StatChip label="Comes back every" value={avgGap ? `~${avgGap} days` : "—"} />
        <StatChip
          label="Next refill"
          value={nextIn === null ? "—" : nextIn < 0 ? `${Math.abs(nextIn)}d overdue` : nextIn === 0 ? "today" : `in ${nextIn}d`}
          tone={nextIn !== null && nextIn < 0 ? "bad" : "ink"}
        />
      </div>
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
                  RG-{1000 + o.number} · {formatValue(o.total, "inr")}
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
    </Card>
  );
}
