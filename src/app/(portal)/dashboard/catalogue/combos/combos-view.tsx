"use client";

import Link from "@/components/intent-link";
import { StaggerGroup, StaggerItem } from "@/components/motion";
import { formatValue } from "@/lib/chart-math";
import { fmtDate, fmtNumber } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/context";

type ComboPair = {
  a: string;
  b: string;
  together: number;
  aOrders: number;
  bOrders: number;
  lift: number;
  price: number;
};

type BestSeller = {
  name: string;
  units: number;
  orders: number;
};

type SlowMover = {
  name: string;
  price: number;
  lastSold: Date | null;
  units: number;
};

export type ComboReportData = {
  orders: number;
  pairs: ComboPair[];
  bestSellers: BestSeller[];
  slow: SlowMover[];
};

/** A round, slightly discounted bundle price: about 8% off, ending in 9. */
const comboPrice = (sum: number) => (sum > 0 ? Math.max(9, Math.floor((sum * 0.92) / 10) * 10 - 1) : 0);

export function CombosView({ report }: { report: ComboReportData }) {
  const { isTa } = useLanguage();
  const anchor = report.bestSellers[0];

  if (report.orders < 5) {
    return (
      <section className="card">
        <h2>{isTa ? "இன்னும் போதுமான ஆர்டர்கள் இல்லை" : "Not enough orders yet"}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {isTa
            ? "ஒன்றுக்கும் மேற்பட்ட பொருட்களைக் கொண்ட சில ஆர்டர்கள் முடிந்த பிறகு சேர்க்கை யோசனைகள் தோன்றும்."
            : "Combo ideas appear after a few paid orders with more than one item."}
        </p>
      </section>
    );
  }

  return (
    <StaggerGroup className="grid split">
      <StaggerItem index={0} className="h-full">
        <div className="card h-full">
          <div className="hd">
            <div>
              <h2>{isTa ? "சேர்த்து வாங்கப்பட்டவை" : "Bought together"}</h2>
              <p>
                {isTa
                  ? `ஒரே ஆர்டரில் வாங்கப்பட்டவை · கடந்த 12 மாதங்கள் · ${fmtNumber(report.orders)} ஆர்டர்கள்`
                  : `Pairs in the same paid order · last 12 months · ${fmtNumber(report.orders)} orders`}
              </p>
            </div>
          </div>
          <div className="list">
            {report.pairs.map((p) => {
              const share = Math.round((p.together / Math.min(p.aOrders, p.bOrders)) * 100);
              return (
                <div key={`${p.a}|${p.b}`} className="row">
                  <div className="grow">
                    <div className="t">
                      {p.a} + {p.b}
                    </div>
                    <div className="muted small">
                      {isTa
                        ? `${fmtNumber(p.together)} ஆர்டர்களில் ஒன்றாக · ${share}% முறை${p.lift >= 1.5 ? ` · வழக்கத்தை விட ${p.lift.toFixed(1)} மடங்கு அதிகம்` : ""}`
                        : `Together in ${fmtNumber(p.together)} orders · ${share}% of the time${p.lift >= 1.5 ? ` · ${p.lift.toFixed(1)}× more than chance` : ""}`}
                    </div>
                  </div>
                  {p.price > 0 && (
                    <div style={{ textAlign: "right" }}>
                      <div className="muted small" style={{ textDecoration: "line-through" }}>
                        {formatValue(p.price, "inr")}
                      </div>
                      <b>
                        {isTa ? "காம்போ " : "Combo "}
                        {formatValue(comboPrice(p.price), "inr")}
                      </b>
                    </div>
                  )}
                </div>
              );
            })}
            {report.pairs.length === 0 && (
              <p className="muted small">
                {isTa
                  ? "எந்த இரண்டு பொருட்களும் இதுவரை இரண்டு முறை ஒன்றாக வாங்கப்படவில்லை. அதிகம் விற்கும் பொருளுடன் மெதுவாக விற்கும் பொருளைச் சேர்த்துப் பாருங்கள்."
                  : "No product pair has been bought together twice yet. Try pairing a slow mover with a best seller."}
              </p>
            )}
          </div>
        </div>
      </StaggerItem>

      <StaggerItem index={1} className="h-full">
        <div className="stack">
          <div className="card">
            <div className="hd">
              <div>
                <h2>{isTa ? "அதிகம் விற்பவை" : "Best sellers"}</h2>
                <p>{isTa ? "ஒவ்வொரு பொருளையும் உள்ளடக்கிய பணம் செலுத்திய ஆர்டர்கள்" : "Paid orders that include each product"}</p>
              </div>
            </div>
            <div className="list">
              {report.bestSellers.map((b) => (
                <div key={b.name} className="row">
                  <Link className="grow t" href={`/dashboard/customers?q=${encodeURIComponent(b.name)}`} style={{ textDecoration: "none" }}>
                    {b.name}
                  </Link>
                  <span className="muted small">
                    {fmtNumber(b.units)} {isTa ? "எண்ணிக்கை" : "units"}
                  </span>
                  <b>
                    {fmtNumber(b.orders)} {isTa ? "ஆர்டர்கள்" : "orders"}
                  </b>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="hd">
              <div>
                <h2>{isTa ? "மெதுவாக விற்பவை" : "Slow movers"}</h2>
                <p>{isTa ? "45+ நாட்களாக விற்பனையாகாதவை" : "Not sold in 45+ days"}</p>
              </div>
            </div>
            <div className="list">
              {report.slow.map((s) => (
                <div key={s.name} className="row">
                  <div className="grow">
                    <div className="t">{s.name}</div>
                    {anchor && anchor.name !== s.name && s.price > 0 && (
                      <div className="muted small">
                        {isTa ? "முயற்சிக்கவும்: " : "Try: "}
                        {anchor.name} + {s.name}
                      </div>
                    )}
                  </div>
                  <span className="muted small">
                    {s.lastSold ? (isTa ? `கடைசியாக ${fmtDate(s.lastSold, "d MMM")}` : `last ${fmtDate(s.lastSold, "d MMM")}`) : isTa ? "விற்கவே இல்லை" : "never sold"}
                  </span>
                </div>
              ))}
              {report.slow.length === 0 && <p className="muted small">{isTa ? "கடந்த 45 நாட்களில் அனைத்தும் விற்பனையாகியுள்ளன." : "Everything sold in the last 45 days."}</p>}
            </div>
          </div>
          <div className="note small">
            <b>{isTa ? "பயன்படுத்தும் முறை: " : "How to use these: "}</b>
            {isTa
              ? "இரண்டு பொருட்களையும் இணைத்து காம்போ விலையில் ஒரு புதிய பொருளாக பட்டியலில் சேர்க்கவும். பிறகு அவற்றில் ஒன்றை வாங்கிய வாடிக்கையாளர்களுக்கு அனுப்பவும்."
              : "add the pair as one catalogue item at the combo price, then send it to customers who already buy one half of it."}
          </div>
        </div>
      </StaggerItem>
    </StaggerGroup>
  );
}
