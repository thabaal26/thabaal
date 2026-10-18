"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
import { CheckCircle2, Clock, IndianRupee } from "@/components/icons";
import { Stat } from "@/components/ui";
import type { ProductDemandStats } from "@/lib/catalog-demand";
import { useLanguage } from "@/lib/i18n/context";
import { inr } from "../portal-format";
import { Chips, Pill, type PillTone } from "../portal-ui";

type Kind = "selling" | "stuck" | "dropped" | "stopped" | "never" | "quiet";
const KIND: Record<Kind, { tone: PillTone; label: string; labelTa: string }> = {
  selling: { tone: "ok", label: "Selling well", labelTa: "நன்றாக விற்கிறது" },
  stuck: { tone: "warn", label: "Stuck in carts", labelTa: "கார்ட்டுகளில் தேங்கியுள்ளது" },
  dropped: { tone: "bad", label: "Added, then dropped", labelTa: "சேர்த்து, பின் கைவிடப்பட்டது" },
  stopped: { tone: "mute", label: "Sold before, not now", labelTa: "முன்பு விற்றது, இப்போது இல்லை" },
  never: { tone: "bad", label: "Never sold", labelTa: "இதுவரை விற்கவில்லை" },
  quiet: { tone: "info", label: "In carts, few sales", labelTa: "கார்ட்டில் உள்ளது, குறைவான விற்பனை" },
};
const DAY = 86_400_000;

function kindOf(p: ProductDemandStats, nowMs: number): Kind {
  const recent = p.lastCartedAt ? nowMs - new Date(p.lastCartedAt).getTime() < 30 * DAY : false;
  if (p.cartCount === 0 && p.paidOrdersCount === 0) return "never";
  if (p.paidOrdersCount > 0 && !recent) return "stopped";
  const dropped = p.droppedCount ?? 0;
  const open = p.hesitationCount - dropped;
  if (open > 0 && open >= p.paidOrdersCount) return "stuck";
  if (dropped > 0 && dropped >= p.paidOrdersCount) return "dropped";
  if (p.paidOrdersCount > 0) return "selling";
  return "quiet";
}

function advice(p: ProductDemandStats, k: Kind, isTa = false) {
  if (isTa) {
    if (k === "selling") return "நன்றாக விற்கிறது. காம்போக்களில் முக்கிய பொருளாகச் சேர்த்து விளம்பரப்படுத்துங்கள்.";
    if (k === "stuck") return `${p.hesitationCount} கார்ட்டுகளில் பணம் செலுத்தப்படாமல் உள்ளது. பணம் செலுத்தும் இணைப்பு அல்லது சிறிய தள்ளுபடி அனுப்புங்கள்.`;
    if (k === "dropped") return `${p.droppedCount ?? 0} ஆர்டர்களில் சேர்க்கப்பட்டு பின் ரத்து செய்யப்பட்டது. விலை, டெலிவரி கட்டணம் அல்லது இருப்பைச் சரிபார்க்கவும்.`;
    if (k === "stopped") return "முன்பு விற்றது, ஆனால் கடந்த 30 நாட்களில் யாரும் சேர்க்கவில்லை. இருப்பு மற்றும் விலையைச் சரிபார்க்கவும்.";
    if (k === "never") return "இன்னும் விற்பனையாகவில்லை. அதிகம் விற்கும் பொருட்களுடன் இணைத்து ஆஃபர் வழங்குங்கள்.";
    return "வாடிக்கையாளர்கள் கார்ட்டில் சேர்க்கிறார்கள் ஆனால் பணம் செலுத்தவில்லை. விலை மற்றும் புகைப்படத்தைச் சரிபார்க்கவும்.";
  }
  if (k === "selling") return "Selling well. Use it as the main item in bundles, and message its past buyers when they are due to reorder.";
  if (k === "stuck") return `Added to ${p.hesitationCount} cart${p.hesitationCount === 1 ? "" : "s"} that were not paid. Send a pay link or a small offer to those customers.`;
  if (k === "dropped") {
    const n = p.droppedCount ?? 0;
    return `Added to ${n} order${n === 1 ? "" : "s"} that were then cancelled. Check the price, the delivery charge and whether it was in stock.`;
  }
  if (k === "stopped") return "Sold before, but nobody has added it in the last 30 days. Is it in stock, and is the price still right?";
  if (k === "never") return "No sales yet. Pair it as an add-on with a best seller, or show it in your next campaign.";
  return "Customers add it but few pay. Check the price and photo against similar items.";
}

/** Products › How products sell (portal design), from real carts and paid orders. */
export function ProductsPerf({ products, nowMs, paidSales, unpaidCarts, cartToPaid }: { products: ProductDemandStats[]; nowMs: number; paidSales: number; unpaidCarts: number; cartToPaid: number }) {
  const { isTa } = useLanguage();
  const [f, setF] = useState("all");
  const [pick, setPick] = useState(products[0]?.retailerId ?? "");
  const rows = products.map((p) => ({ p, k: kindOf(p, nowMs) }));
  const count = (k: string) => (k === "all" ? rows.length : rows.filter((r) => r.k === k).length);
  const shown = rows.filter((r) => f === "all" || r.k === f).sort((a, b) => b.p.revenue - a.p.revenue || b.p.cartCount - a.p.cartCount);
  const one = rows.find((r) => r.p.retailerId === pick) ?? rows[0];

  const cats = new Map<string, { sold: number; carts: number; dropped: number }>();
  for (const p of products) {
    const c = cats.get(p.category || (isTa ? "இதர பொருட்கள்" : "Other")) ?? { sold: 0, carts: 0, dropped: 0 };
    const dropped = p.droppedCount ?? 0;
    c.sold += p.revenue;
    c.carts += (p.hesitationCount - dropped) * p.priceAmount;
    c.dropped += dropped * p.priceAmount;
    cats.set(p.category || (isTa ? "இதர பொருட்கள்" : "Other"), c);
  }
  const catRows = [...cats].sort((a, b) => b[1].sold - a[1].sold).slice(0, 8);
  const catMax = Math.max(1, ...catRows.map(([, c]) => c.sold + c.carts + c.dropped));
  const anyDropped = catRows.some(([, c]) => c.dropped > 0);

  return (
    <>
      <div className="grid g3 keep2" style={{ marginBottom: 16 }}>
        <Stat
          label={isTa ? "விற்பனை தொகை" : "Paid sales"}
          value={inr(paidSales)}
          sub={isTa ? "பொருட்களின் விற்பனை" : "From catalogue products"}
          icon={<IndianRupee className="size-4 shrink-0" />}
          tone="brand"
        />
        <Stat
          label={isTa ? "கார்ட்டில் நிலுவை" : "Waiting in unpaid carts"}
          value={inr(unpaidCarts)}
          sub={isTa ? "மீட்டெடுக்கக்கூடியவை" : "Still recoverable"}
          icon={<Clock className="size-4 shrink-0" />}
          tone="amber"
          href="/dashboard/orders?show=unpaid"
        />
        <Stat
          label={isTa ? "செலுத்தப்பட்ட கார்ட்டுகள்" : "Carts that got paid"}
          value={`${Math.round(cartToPaid)}%`}
          sub={isTa ? "ஆர்டரான விகிதம்" : "Of carts sent from WhatsApp"}
          icon={<CheckCircle2 className="size-4 shrink-0" />}
          tone="info"
          meter={Math.round(cartToPaid)}
        />
      </div>

      <div className="grid split">
        <div className="card">
          <div className="hd">
            <h2>{isTa ? "கவனிக்க வேண்டிய பொருட்கள்" : "Which products need attention"}</h2>
          </div>
          <Chips
            label={isTa ? "காட்டு" : "Show"}
            value={f}
            onChange={setF}
            style={{ marginBottom: 12 }}
            options={[
              { id: "all", label: isTa ? "அனைத்தும்" : "All", n: count("all") },
              { id: "selling", label: isTa ? "விற்பவை" : "Selling", n: count("selling") },
              { id: "stuck", label: isTa ? "கார்ட்டில் உள்ளவை" : "Stuck in cart", n: count("stuck") },
              { id: "dropped", label: isTa ? "சேர்த்து கைவிட்டவை" : "Added, then dropped", n: count("dropped") },
              { id: "stopped", label: isTa ? "முன்பு விற்றவை" : "Sold before, not now", n: count("stopped") },
              { id: "never", label: isTa ? "விற்காதவை" : "Never sold", n: count("never") },
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
                    {inr(p.revenue)} {isTa ? "விற்பனை" : "paid"} · {p.cartCount} {isTa ? "கார்ட்" : `cart${p.cartCount === 1 ? "" : "s"}`}
                    {p.hesitationCount > 0 && (isTa ? ` · ${p.hesitationCount} செலுத்தப்படவில்லை` : ` · ${p.hesitationCount} not paid`)}
                  </div>
                </div>
                <Pill tone={KIND[k].tone}>{isTa ? KIND[k].labelTa : KIND[k].label}</Pill>
              </div>
            ))}
            {shown.length === 0 && <p className="muted small">{isTa ? "பொருட்கள் எதுவும் இல்லை." : "Nothing here."}</p>}
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="hd">
            <h2>{isTa ? "ஒரு பொருளின் விவரம்" : "Look at one product"}</h2>
          </div>
          {one ? (
            <>
              <div className="field">
                <label htmlFor="ps2">{isTa ? "பொருள்" : "Product"}</label>
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
                  <div className="l">{isTa ? "விற்பனை தொகை" : "Paid sales"}</div>
                  <div className="v">{inr(one.p.revenue)}</div>
                </div>
                <div className="stat">
                  <div className="l">{isTa ? "செலுத்தாதவை" : "Not paid"}</div>
                  <div className="v">{one.p.cartCount ? `${Math.round((one.p.hesitationCount / one.p.cartCount) * 100)}%` : "–"}</div>
                </div>
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>
                {one.p.paidOrdersCount} {isTa ? "ஆர்டர்கள்" : `paid order${one.p.paidOrdersCount === 1 ? "" : "s"}`} · {one.p.paidUnits} {isTa ? "விற்பனை" : "sold"} · {one.p.cartCount} {isTa ? "கார்ட்டுகளில்" : `cart${one.p.cartCount === 1 ? "" : "s"}`}
              </p>
              <div className="note" style={{ margin: "12px 0" }}>
                {advice(one.p, one.k, isTa)}
              </div>
              <div className="tools">
                <Link className="btn primary sm" href="/dashboard/campaigns/new">
                  {one.k === "stuck"
                    ? (isTa ? "கார்ட் வாடிக்கையாளர்களுக்கு நினைவூட்டு" : "Chase the carts")
                    : one.k === "selling"
                      ? (isTa ? "வாங்கியவர்களுக்கு செய்தி அனுப்பு" : "Message its buyers")
                      : (isTa ? "விளம்பரப்படுத்து" : "Promote it")}
                </Link>
                <Link className="btn sm" href={`/dashboard/orders?show=all&q=${encodeURIComponent(one.p.name)}`}>
                  {isTa ? "இந்த பொருள் உள்ள ஆர்டர்கள்" : "Orders with it"}
                </Link>
              </div>
            </>
          ) : (
            <p className="muted">{isTa ? "இன்னும் பொருட்கள் எதுவும் இல்லை." : "No products yet."}</p>
          )}
        </div>
      </div>

      {catRows.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="hd">
            <h2>{isTa ? "வகை வாரியாக விற்பனை" : "Sales by category"}</h2>
          </div>
          <div className="list">
            {catRows.map(([name, c]) => (
              <div key={name} className="row">
                <div style={{ width: 140, fontWeight: 600 }}>{name}</div>
                <div className="grow">
                  <div className="bar" style={{ height: 12 }}>
                    <i style={{ width: `${(c.sold / catMax) * 100}%`, background: "#20C985" }} />
                    <i style={{ width: `${(c.carts / catMax) * 100}%`, background: "#FFC329" }} />
                    {c.dropped > 0 && <i style={{ width: `${(c.dropped / catMax) * 100}%`, background: "#F46B4E" }} />}
                  </div>
                </div>
                <span className="muted small">{inr(c.sold)}</span>
              </div>
            ))}
          </div>
          <div className="legend">
            <span style={{ ["--c" as string]: "#20C985" }}>{isTa ? "விற்பனையானவை" : "Sold"}</span>
            <span style={{ ["--c" as string]: "#FFC329" }}>{isTa ? "கார்ட்டில் நிலுவை" : "Still in unpaid carts"}</span>
            {anyDropped && <span style={{ ["--c" as string]: "#F46B4E" }}>{isTa ? "கைவிடப்பட்டவை" : "Dropped"}</span>}
          </div>
        </div>
      )}
    </>
  );
}
