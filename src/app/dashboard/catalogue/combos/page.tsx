import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { PickClientNotice } from "@/components/ui";
import { comboReport } from "@/lib/business-reports";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { PortalPage } from "../../portal-ui";
import { ProductsTabs } from "../products-tabs";

export const metadata: Metadata = { title: "Combo ideas" };
export const dynamic = "force-dynamic";

/** A round, slightly discounted bundle price: about 8% off, ending in 9. */
const comboPrice = (sum: number) => (sum > 0 ? Math.max(9, Math.floor((sum * 0.92) / 10) * 10 - 1) : 0);

export default async function CombosPage() {
  const scope = await getScope();
  const frame = (children: React.ReactNode) => (
    <PortalPage
      title="Products"
      titleTa="பொருட்கள்"
      sub="What you sell, and which items need your attention."
      subTa="நீங்கள் விற்பவை, கவனிக்க வேண்டிய பொருட்கள்."
      actions={
        <Link className="btn primary" href="/dashboard/campaigns/new">
          Announce a combo
        </Link>
      }
    >
      <ProductsTabs active="combos" />
      {children}
    </PortalPage>
  );
  if (!scope.clientId) return frame(<PickClientNotice what="combo ideas" />);

  const r = await comboReport(scope.clientId);
  const anchor = r.bestSellers[0];

  return frame(
    r.orders < 5 ? (
      <section className="card">
        <h2>Not enough orders yet</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Combo ideas appear after a few paid orders with more than one item.
        </p>
      </section>
    ) : (
      <div className="grid split">
        <div className="card">
          <div className="hd">
            <div>
              <h2>Bought together</h2>
              <p>
                Pairs in the same paid order · last 12 months · {fmtNumber(r.orders)} orders
              </p>
            </div>
          </div>
          <div className="list">
            {r.pairs.map((p) => {
              const share = Math.round((p.together / Math.min(p.aOrders, p.bOrders)) * 100);
              return (
                <div key={`${p.a}|${p.b}`} className="row">
                  <div className="grow">
                    <div className="t">
                      {p.a} + {p.b}
                    </div>
                    <div className="muted small">
                      Together in {fmtNumber(p.together)} orders · {share}% of the time{p.lift >= 1.5 ? ` · ${p.lift.toFixed(1)}× more than chance` : ""}
                    </div>
                  </div>
                  {p.price > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div className="muted small" style={{ textDecoration: "line-through" }}>
                        {formatValue(p.price, "inr")}
                      </div>
                      <b>Combo {formatValue(comboPrice(p.price), "inr")}</b>
                    </div>
                  )}
                </div>
              );
            })}
            {r.pairs.length === 0 && <p className="muted small">No product pair has been bought together twice yet. Try pairing a slow mover with a best seller.</p>}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="hd">
              <div>
                <h2>Best sellers</h2>
                <p>Paid orders that include each product</p>
              </div>
            </div>
            <div className="list">
              {r.bestSellers.map((b) => (
                <div key={b.name} className="row">
                  <Link className="grow t" href={`/dashboard/customers?q=${encodeURIComponent(b.name)}`} style={{ textDecoration: "none" }}>
                    {b.name}
                  </Link>
                  <span className="muted small">{fmtNumber(b.units)} units</span>
                  <b>{fmtNumber(b.orders)} orders</b>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="hd">
              <div>
                <h2>Slow movers</h2>
                <p>Not sold in 45+ days</p>
              </div>
            </div>
            <div className="list">
              {r.slow.map((s) => (
                <div key={s.name} className="row">
                  <div className="grow">
                    <div className="t">{s.name}</div>
                    {anchor && anchor.name !== s.name && s.price > 0 && (
                      <div className="muted small">
                        Try: {anchor.name} + {s.name}
                      </div>
                    )}
                  </div>
                  <span className="muted small">{s.lastSold ? `last ${fmtDate(s.lastSold, "d MMM")}` : "never sold"}</span>
                </div>
              ))}
              {r.slow.length === 0 && <p className="muted small">Everything sold in the last 45 days.</p>}
            </div>
          </div>
          <div className="note small">
            <b>How to use these:</b> add the pair as one catalogue item at the combo price, then send it to customers who already buy one half of it.
          </div>
        </div>
      </div>
    ),
  );
}
