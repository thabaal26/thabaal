"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
import type { ProductDemandStats } from "@/lib/catalog-demand";
import { inr } from "../portal-format";
import { Chips, Pill, type PillTone } from "../portal-ui";

type Kind = "selling" | "stuck" | "stopped" | "never" | "quiet";
const KIND: Record<Kind, { tone: PillTone; label: string }> = {
  selling: { tone: "ok", label: "Selling well" },
  stuck: { tone: "warn", label: "Stuck in carts" },
  stopped: { tone: "mute", label: "Sold before, not now" },
  never: { tone: "bad", label: "Never sold" },
  quiet: { tone: "info", label: "In carts, few sales" },
};
const DAY = 86_400_000;

function kindOf(p: ProductDemandStats, nowMs: number): Kind {
  const recent = p.lastCartedAt ? nowMs - new Date(p.lastCartedAt).getTime() < 30 * DAY : false;
  if (p.cartCount === 0 && p.paidOrdersCount === 0) return "never";
  if (p.paidOrdersCount > 0 && !recent) return "stopped";
  if (p.hesitationCount > 0 && p.hesitationCount >= p.paidOrdersCount) return "stuck";
  if (p.paidOrdersCount > 0) return "selling";
  return "quiet";
}

function advice(p: ProductDemandStats, k: Kind) {
  if (k === "selling") return "Selling well. Use it as the main item in bundles, and message its past buyers when they are due to reorder.";
  if (k === "stuck") return `Added to ${p.hesitationCount} cart${p.hesitationCount === 1 ? "" : "s"} that were not paid. Send a pay link or a small offer to those customers.`;
  if (k === "stopped") return "Sold before, but nobody has added it in the last 30 days. Is it in stock, and is the price still right?";
  if (k === "never") return "No sales yet. Pair it as an add-on with a best seller, or show it in your next campaign.";
  return "Customers add it but few pay. Check the price and photo against similar items.";
}

/** Products › How products sell (portal design), from real carts and paid orders. */
export function ProductsPerf({ products, nowMs, paidSales, unpaidCarts, cartToPaid }: { products: ProductDemandStats[]; nowMs: number; paidSales: number; unpaidCarts: number; cartToPaid: number }) {
  const [f, setF] = useState("all");
  const [pick, setPick] = useState(products[0]?.retailerId ?? "");
  const rows = products.map((p) => ({ p, k: kindOf(p, nowMs) }));
  const count = (k: string) => (k === "all" ? rows.length : rows.filter((r) => r.k === k).length);
  const shown = rows.filter((r) => f === "all" || r.k === f).sort((a, b) => b.p.revenue - a.p.revenue || b.p.cartCount - a.p.cartCount);
  const one = rows.find((r) => r.p.retailerId === pick) ?? rows[0];

  const cats = new Map<string, { sold: number; carts: number }>();
  for (const p of products) {
    const c = cats.get(p.category || "Other") ?? { sold: 0, carts: 0 };
    c.sold += p.revenue;
    c.carts += p.hesitationCount * p.priceAmount;
    cats.set(p.category || "Other", c);
  }
  const catRows = [...cats].sort((a, b) => b[1].sold - a[1].sold).slice(0, 8);
  const catMax = Math.max(1, ...catRows.map(([, c]) => c.sold + c.carts));

  return (
    <>
      <div className="grid g3 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="l">Paid sales</div>
          <div className="v">{inr(paidSales)}</div>
          <div className="d muted">From catalogue products</div>
        </div>
        <div className="card stat">
          <div className="l">Waiting in unpaid carts</div>
          <div className="v">{inr(unpaidCarts)}</div>
          <div className="d muted">Still recoverable</div>
        </div>
        <div className="card stat">
          <div className="l">Carts that got paid</div>
          <div className="v">{Math.round(cartToPaid)}%</div>
          <div className="d muted">Of carts sent from WhatsApp</div>
        </div>
      </div>

      <div className="grid split">
        <div className="card">
          <div className="hd">
            <h2>Which products need attention</h2>
          </div>
          <Chips
            label="Show"
            value={f}
            onChange={setF}
            style={{ marginBottom: 12 }}
            options={[
              { id: "all", label: "All", n: count("all") },
              { id: "selling", label: "Selling", n: count("selling") },
              { id: "stuck", label: "Stuck in cart", n: count("stuck") },
              { id: "stopped", label: "Sold before, not now", n: count("stopped") },
              { id: "never", label: "Never sold", n: count("never") },
            ]}
          />
          <div className="list">
            {shown.map(({ p, k }) => (
              <div key={p.retailerId} className="row">
                <div className="grow">
                  <button type="button" className="linkb t" onClick={() => setPick(p.retailerId)} style={{ textDecoration: "none" }}>
                    {p.name}
                  </button>
                  <div className="muted small">
                    {inr(p.revenue)} paid · {p.cartCount} cart{p.cartCount === 1 ? "" : "s"}
                    {p.hesitationCount > 0 && ` · ${p.hesitationCount} not paid`}
                  </div>
                </div>
                <Pill tone={KIND[k].tone}>{KIND[k].label}</Pill>
              </div>
            ))}
            {shown.length === 0 && <p className="muted small">Nothing here.</p>}
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="hd">
            <h2>Look at one product</h2>
          </div>
          {one ? (
            <>
              <div className="field">
                <label htmlFor="ps2">Product</label>
                <select id="ps2" value={one.p.retailerId} onChange={(e) => setPick(e.target.value)}>
                  {products.map((p) => (
                    <option key={p.retailerId} value={p.retailerId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid g2" style={{ marginTop: 14 }}>
                <div className="stat">
                  <div className="l">Paid sales</div>
                  <div className="v">{inr(one.p.revenue)}</div>
                </div>
                <div className="stat">
                  <div className="l">Not paid</div>
                  <div className="v">{one.p.cartCount ? `${Math.round((one.p.hesitationCount / one.p.cartCount) * 100)}%` : "–"}</div>
                </div>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                {one.p.paidOrdersCount} paid order{one.p.paidOrdersCount === 1 ? "" : "s"} · {one.p.paidUnits} sold · in {one.p.cartCount} cart{one.p.cartCount === 1 ? "" : "s"}
              </p>
              <div className="note" style={{ margin: "12px 0" }}>
                {advice(one.p, one.k)}
              </div>
              <div className="tools">
                <Link className="btn primary sm" href="/dashboard/campaigns/new">
                  {one.k === "stuck" ? "Chase the carts" : one.k === "selling" ? "Message its buyers" : "Promote it"}
                </Link>
                <Link className="btn sm" href={`/dashboard/orders?show=all&q=${encodeURIComponent(one.p.name)}`}>
                  Orders with it
                </Link>
              </div>
            </>
          ) : (
            <p className="muted">No products yet.</p>
          )}
        </div>
      </div>

      {catRows.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="hd">
            <h2>Sales by category</h2>
          </div>
          <div className="list">
            {catRows.map(([name, c]) => (
              <div key={name} className="row">
                <div style={{ width: 140, fontWeight: 600 }}>{name}</div>
                <div className="grow">
                  <div className="bar" style={{ height: 12 }}>
                    <i style={{ width: `${(c.sold / catMax) * 100}%`, background: "#20C985" }} />
                    <i style={{ width: `${(c.carts / catMax) * 100}%`, background: "#FFC329" }} />
                  </div>
                </div>
                <span className="muted small">{inr(c.sold)}</span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span style={{ ["--c" as string]: "#20C985" }}>Sold</span>
            <span style={{ ["--c" as string]: "#FFC329" }}>Still in unpaid carts</span>
          </div>
        </div>
      )}
    </>
  );
}
