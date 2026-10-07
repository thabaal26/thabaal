import { PackageCheck, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { money, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { OrderActions } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "Active", where: { status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } },
  { key: "new", label: "New", where: { status: "NEW" } },
  { key: "done", label: "Delivered", where: { status: "DELIVERED" } },
  { key: "cancelled", label: "Cancelled", where: { status: "CANCELLED" } },
  { key: "all", label: "All", where: {} },
] as const;

const TONE = { NEW: "amber", CONFIRMED: "blue", PAID: "blue", DISPATCHED: "violet", DELIVERED: "green", CANCELLED: "gray" } as const;

export default async function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const { show = "" } = await searchParams;
  const scope = await getScope();
  const tab = TABS.find((t) => t.key === show) ?? TABS[0];
  const mine = owned(scope);

  const [orders, counts] = await Promise.all([
    db.order.findMany({
      where: { ...mine, ...(tab.where as object) },
      include: { customer: { select: { id: true, name: true, phone: true, location: true, client: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.order.groupBy({ by: ["status"], where: mine, _count: true }),
  ]);
  const n = (...s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((sum, c) => sum + c._count, 0);
  const tabCount: Record<string, number> = {
    "": n("NEW", "CONFIRMED", "PAID", "DISPATCHED"),
    new: n("NEW"),
    done: n("DELIVERED"),
    cancelled: n("CANCELLED"),
    all: counts.reduce((sum, c) => sum + c._count, 0),
  };

  return (
    <>
      <PageHeader title="Orders" description="Carts customers send from your WhatsApp catalogue. Confirm, dispatch and track them here." />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/dashboard/orders?show=${t.key}` : "/dashboard/orders"}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition active:scale-95 sm:h-auto sm:py-1.5 sm:text-xs",
              tab.key === t.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink/30",
            )}
          >
            {t.label} <span className="tabular opacity-60">{fmtNumber(tabCount[t.key])}</span>
          </Link>
        ))}
      </div>

      {orders.length ? (
        <div className="space-y-4">
          {orders.map((o) => {
            const items = o.items as OrderItem[];
            return (
              <Card key={o.id}>
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/dashboard/customers/${o.customer.id}`} className="font-medium hover:underline">
                      {o.customer.name}
                    </Link>
                    <span className="tabular text-xs text-muted">{formatPhone(o.customer.phone)}</span>
                    {o.customer.location && <span className="text-xs text-muted">· {o.customer.location}</span>}
                    {!scope.clientId && <Badge>{o.customer.client.name}</Badge>}
                    <Badge tone={TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                    <span className="ml-auto text-xs text-muted">
                      #{o.id.slice(-5).toUpperCase()} · {fmtDate(o.createdAt, "EEE d MMM, h:mm a")}
                    </span>
                  </div>
                  <ul className="divide-y divide-line rounded-lg bg-canvas px-3 text-sm">
                    {items.map((i, k) => (
                      <li key={k} className="flex justify-between gap-3 py-2">
                        <span>
                          {i.quantity} × {i.name ?? i.id}
                        </span>
                        <span className="tabular text-muted">{money(i.price * i.quantity, i.currency)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 py-2 font-semibold">
                      <span>Total</span>
                      <span className="tabular">{money(o.total, o.currency)}</span>
                    </li>
                  </ul>
                  {o.note && (
                    <p className="text-sm">
                      <span className="text-muted">Customer note: </span>
                      {o.note}
                    </p>
                  )}
                  <OrderActions id={o.id} status={o.status} note={o.internalNote} canEdit={scope.isAdmin} />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={show === "done" ? <PackageCheck className="size-5" /> : <ShoppingBag className="size-5" />} title="No orders here yet">
            When a customer sends a cart from your WhatsApp catalogue, it appears here with items, total and a one-tap confirmation.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
