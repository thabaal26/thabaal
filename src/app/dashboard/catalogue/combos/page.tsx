import { Lightbulb, Snail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag3D, Sparkles3D, Trophy3D } from "@/components/icons-3d";
import { buttonClass, Callout, Card, CardHeader, EmptyState, PageHeader, PickClientNotice } from "@/components/ui";
import { BarList } from "@/components/viz";
import { comboReport } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";

export const metadata: Metadata = { title: "Combo ideas" };
export const dynamic = "force-dynamic";

/** A round, slightly discounted bundle price: about 8% off, ending in 9. */
const comboPrice = (sum: number) => (sum > 0 ? Math.max(9, Math.floor((sum * 0.92) / 10) * 10 - 1) : 0);

export default async function CombosPage() {
  const scope = await getScope();
  const header = (
    <PageHeader
      title="Combo ideas"
      back={{ href: "/dashboard/catalogue", label: "Catalogue" }}
      description="Products people already buy together, and slow movers to pair with your best sellers. Add a combo to the catalogue, then announce it."
      actions={
        <Link href="/dashboard/campaigns/new" className={buttonClass("primary")}>
          Announce a combo
        </Link>
      }
    />
  );
  if (!scope.clientId)
    return (
      <>
        {header}
        <PickClientNotice what="combo ideas" />
      </>
    );

  const r = await comboReport(scope.clientId);
  const anchor = r.bestSellers[0];

  return (
    <>
      {header}
      {r.orders < 5 ? (
        <Card className="card-3d">
          <EmptyState icon={<ShoppingBag3D />} title="Not enough orders yet">
            Combo ideas appear after a few paid orders with more than one item.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-12">
          <Card className="card-3d xl:col-span-7">
            <CardHeader tone="gold" icon={<Sparkles3D />} title="Bought together" description={`Pairs in the same paid order · last 12 months · ${fmtNumber(r.orders)} orders`} />
            {r.pairs.length ? (
              <ul className="divide-y divide-line">
                {r.pairs.map((p) => {
                  const share = Math.round((p.together / Math.min(p.aOrders, p.bOrders)) * 100);
                  return (
                    <li key={`${p.a}|${p.b}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">
                          {p.a} <span className="text-muted">+</span> {p.b}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-sunken">
                            <span className="block h-full rounded-full bg-[#d4a514]" style={{ width: `${Math.min(100, share)}%` }} />
                          </span>
                          <span className="tabular text-2xs text-muted">
                            together in {fmtNumber(p.together)} orders · {share}% of the time{p.lift >= 1.5 ? ` · ${p.lift.toFixed(1)}× more than chance` : ""}
                          </span>
                        </div>
                      </div>
                      {p.price > 0 && (
                        <div className="shrink-0 text-right">
                          <p className="tabular text-xs text-muted line-through">{formatValue(p.price, "inr")}</p>
                          <p className="tabular text-sm font-semibold text-brand-deep">Combo {formatValue(comboPrice(p.price), "inr")}</p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-5 text-sm text-muted sm:px-5">No product pair has been bought together twice yet. Try pairing a slow mover with a best seller.</p>
            )}
          </Card>

          <div className="space-y-4 sm:space-y-5 xl:col-span-5">
            <Card className="card-3d">
              <CardHeader tone="brand" icon={<Trophy3D />} title="Best sellers" description="Paid orders that include each product" />
              <div className="p-4 sm:p-5">
                <BarList
                  color="#059669"
                  items={r.bestSellers.map((b) => ({ key: b.name, label: b.name, value: b.orders, display: `${fmtNumber(b.orders)} orders`, sub: `${fmtNumber(b.units)} units`, href: `/dashboard/customers?tag=${encodeURIComponent(`product:${b.name}`)}` }))}
                />
              </div>
            </Card>

            <Card className="card-3d">
              <CardHeader tone="violet" icon={<Snail className="size-5" />} title="Slow movers" description="Not sold in 45+ days" />
              {r.slow.length ? (
                <ul className="divide-y divide-line">
                  {r.slow.map((s) => (
                    <li key={s.name} className="px-4 py-2.5 sm:px-5">
                      <p className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium text-ink">{s.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted">{s.lastSold ? `last ${fmtDate(s.lastSold, "d MMM")}` : "never sold"}</span>
                      </p>
                      {anchor && anchor.name !== s.name && s.price > 0 && (
                        <p className="mt-0.5 text-2xs text-muted">
                          Try: {anchor.name} + {s.name}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-5 text-sm text-muted sm:px-5">Everything sold in the last 45 days.</p>
              )}
            </Card>

            <Callout tone="info" icon={<Lightbulb />} title="How to use these">
              Add the pair as one catalogue item at the combo price, then send it to customers who already buy one half of it (filter Customers by product).
            </Callout>
          </div>
        </div>
      )}
    </>
  );
}
