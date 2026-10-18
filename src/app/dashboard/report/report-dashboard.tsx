"use client";

import { useState, useEffect } from "react";
import { AlertCircle, ArrowUpRight, Clock, IndianRupee, Repeat, ShoppingBag, Users } from "@/components/icons";
import Link from "@/components/intent-link";
import { PageTools } from "@/components/shell-tools";
import { LangButton, useLang } from "../portal-ui";
import type { ComprehensiveReportData, PeriodFigures, PeriodKey } from "@/lib/reports-data";
import "./reports.css";

function R(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function ReportBars({
  labels,
  series,
  fmt = (v: number) => String(v),
  label = "Chart",
  stacked = true,
}: {
  labels: string[];
  series: { name: string; color: string; vals: number[] }[];
  fmt?: (v: number) => string;
  label?: string;
  stacked?: boolean;
}) {
  const W = 640;
  const H = 220;
  const pl = 44;
  const pb = 26;
  const pt = 10;
  const iw = W - pl - 6;
  const ih = H - pb - pt;
  const n = labels.length;

  const tot = labels.map((_, i) => series.reduce((a, s) => a + (s.vals[i] || 0), 0));
  let mx = Math.max(...(stacked === false ? series.flatMap((s) => s.vals) : tot)) || 1;
  const step = Math.pow(10, Math.floor(Math.log(mx) / Math.LN10));
  mx = Math.ceil(mx / step) * step;

  const gridLines = [];
  for (let k = 0; k <= 4; k++) {
    const y = pt + ih - (ih * k) / 4;
    gridLines.push({
      y,
      val: fmt(Math.round((mx * k) / 4)),
    });
  }

  const bw = iw / n;
  const gap = bw * 0.28;
  const bwid = bw - gap;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {gridLines.map((g, i) => (
        <g key={i}>
          <line x1={pl} x2={W - 6} y1={g.y} y2={g.y} stroke="currentColor" opacity="0.12" />
          <text x={pl - 8} y={g.y + 4} textAnchor="end">
            {g.val}
          </text>
        </g>
      ))}
      {labels.map((lb, i) => {
        const x = pl + i * bw + gap / 2;
        let acc = 0;
        return (
          <g key={`${lb}-${i}`}>
            {series.map((s, j) => {
              const val = s.vals[i] || 0;
              const hh = (ih * val) / mx;
              if (stacked === false) {
                const sw = bwid / series.length;
                return (
                  <rect
                    key={s.name}
                    x={x + j * sw}
                    y={pt + ih - hh}
                    width={Math.max(1, sw - 2)}
                    height={hh}
                    rx={3}
                    fill={s.color}
                  >
                    <title>{`${s.name}: ${fmt(val)}`}</title>
                  </rect>
                );
              } else {
                acc += hh;
                const r = acc === hh ? 3 : 0;
                return (
                  <rect
                    key={s.name}
                    x={x}
                    y={pt + ih - acc}
                    width={bwid}
                    height={hh}
                    rx={r}
                    fill={s.color}
                  >
                    <title>{`${lb} · ${s.name}: ${fmt(val)}`}</title>
                  </rect>
                );
              }
            })}
            <text x={x + bwid / 2} y={H - 8} textAnchor="middle">
              {lb}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ReportDashboard({ data }: { data: ComprehensiveReportData }) {
  const [per, setPer] = useState<PeriodKey>("m");
  const [tab, setTab] = useState<"ov" | "camp" | "cust" | "prod">("ov");
  const [cs, setCs] = useState<"a" | "b">("a");

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (h === "ov" || h === "camp" || h === "cust" || h === "prod") {
        setTab(h);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const lang = useLang();

  const selectTab = (t: "ov" | "camp" | "cust" | "prod") => {
    setTab(t);
    try {
      window.history.replaceState(null, "", "#" + t);
    } catch {
      /* ignore */
    }
  };

  // English or Tamil, from the portal's language switch (shared with every page).
  const tr = (en: string, ta?: string) => (lang === "ta" && ta ? ta : en);

  const d: PeriodFigures = per === "m" ? data.overview.m : data.overview.w;
  const r = d.returnRatio;
  const good = r >= 10;
  const okv = r >= 3;

  const k = [
    [tr("WhatsApp cost", "வாட்ஸ்அப் கட்டணம்"), R(d.cost), tr("Meta message charges", "மெட்டா மெசேஜ் கட்டணம்"), <IndianRupee key="c" className="size-4" />],
    [tr("Paid sales", "செலுத்தப்பட்ட விற்பனை"), R(d.sales), tr("From customers you messaged", "மெசேஜ் அனுப்பிய வாடிக்கையாளர்களிடமிருந்து"), <ShoppingBag key="s" className="size-4" />],
    [tr("Money waiting", "நிலுவை பணம்"), R(d.wait), tr("Ordered, not yet paid", "ஆர்டர் செய்யப்பட்டது, பணம் செலுத்தப்படவில்லை"), <Clock key="w" className="size-4" />],
    [tr("Return per ₹1", "ரூ.1-க்கு வருமானம்"), R(r), tr("Sales, not profit", "விற்பனை, லாபம் அல்ல"), <ArrowUpRight key="r" className="size-4" />],
  ] as const;

  const J = [
    [tr("Messages sent", "அனுப்பப்பட்ட செய்திகள்"), d.sent, tr("Customers you chose", "நீங்கள் தேர்ந்தெடுத்த வாடிக்கையாளர்கள்")],
    [tr("Reached their phone", "அவர்களின் போனை அடைந்தது"), d.reached, ""],
    [tr("Read it", "பார்த்தவர்கள்"), d.read, ""],
    [tr("Replied", "பதிலளித்தவர்கள்"), d.rep, tr("Within 3 days", "3 நாட்களுக்குள்")],
    [tr("Ordered", "ஆர்டர் செய்தவர்கள்"), d.ord, tr("Within 7 days", "7 நாட்களுக்குள்")],
    [tr("Paid", "பணம் செலுத்தியவர்கள்"), d.paid, tr("Money in your account", "உங்கள் கணக்கில் உள்ள பணம்")],
  ] as const;

  const readDiff = Math.max(0, d.read - d.rep);
  const A = [
    [`${d.wait > 0 ? "1" : "0"} ${tr("unpaid order", "நிலுவை ஆர்டர்")}`, R(d.wait), tr("Send reminder", "நினைவூட்டல் அனுப்பு"), "/dashboard/orders?show=unpaid"],
    [`${readDiff} ${tr("read it, did not order", "பார்த்தனர், ஆர்டர் செய்யவில்லை")}`, tr("Follow up", "தொடர்பு கொள்"), tr("Create campaign", "பிரச்சாரம் தொடங்கு"), "/dashboard/campaigns/new"],
    [`${data.customers.followUps[1]?.sub || tr("Reorder due", "மறு ஆர்டர் தேவை")}`, tr("Reach today", "இன்றே தொடர்பு கொள்"), tr("View customers", "வாடிக்கையாளர்களைப் பார்"), "/dashboard/refills"],
  ] as const;

  const { wallet, spend, daily, breakdown, limits } = data.overview;

  return (
    <div className="thabaal-reports">
      <div className="wrapin">
        {/* Top Header */}
        <header className="top">
          <div>
            <h1>{tr("Reports", "அறிக்கை")}</h1>
            <p className="sub">
              {tr(
                "Is WhatsApp bringing business? One answer, then the reason, then what to do.",
                "வாட்ஸ்அப் வணிகத்தை கொண்டு வருகிறதா? ஒரு பதில், காரணம், அடுத்து என்ன செய்வது."
              )}
            </p>
          </div>
          <div className="tools">
            <PageTools lang={<LangButton />} />
          </div>
        </header>

      {/* Top Verdict Card */}
      <div
        className="card"
        style={{
          marginBottom: 16,
          borderLeft: `6px solid ${good ? "var(--ok)" : okv ? "var(--bar2)" : "var(--bad)"}`,
        }}
      >
        <div className="hd" style={{ marginBottom: 6 }}>
          <div>
            <h2 style={{ fontSize: 22 }} id="verd">
              {tr(
                good
                  ? `WhatsApp is working well ${per === "m" ? "this month" : "this week"}.`
                  : okv
                  ? `WhatsApp is doing alright ${per === "m" ? "this month" : "this week"}.`
                  : `WhatsApp is not paying back ${per === "m" ? "this month" : "this week"}.`,
                good
                  ? `${per === "m" ? "இந்த மாதம்" : "இந்த வாரம்"} வாட்ஸ்அப் சிறப்பாக செயல்படுகிறது.`
                  : okv
                  ? `${per === "m" ? "இந்த மாதம்" : "இந்த வாரம்"} வாட்ஸ்அப் சராசரியாக உள்ளது.`
                  : `${per === "m" ? "இந்த மாதம்" : "இந்த வாரம்"} வாட்ஸ்அப் போதிய பலன் தரவில்லை.`
              )}
            </h2>
          </div>
          <div className="seg" id="rp">
            <button
              type="button"
              data-v="m"
              aria-pressed={per === "m"}
              onClick={() => setPer("m")}
            >
              {tr("This month", "இந்த மாதம்")}
            </button>
            <button
              type="button"
              data-v="w"
              aria-pressed={per === "w"}
              onClick={() => setPer("w")}
            >
              {tr("This week", "இந்த வாரம்")}
            </button>
          </div>
        </div>
        <p id="verds">
          {tr(
            `You spent ${R(d.cost)} on messages and received ${R(d.sales)} in paid orders. Every ₹1 spent brought back ${R(r)} in sales.`,
            `செய்திகளுக்கு ${R(d.cost)} செலவழித்து ${R(d.sales)} மதிப்புள்ள செலுத்தப்பட்ட ஆர்டர்களைப் பெற்றுள்ளீர்கள். செலவழித்த ஒவ்வொரு ₹1-க்கும் ${R(r)} விற்பனை வந்துள்ளது.`
          )}
        </p>
      </div>

      {/* 4-KPI Grid */}
      <div className="grid g4 keep2" id="rk" style={{ marginBottom: 16 }}>
        {k.map((x) => (
          <div key={x[0]} className="card stat">
            <div className="l">
              <span>{x[0]}</span>
              {x[3]}
            </div>
            <div className="v">{x[1]}</div>
            <div className="d muted">{x[2]}</div>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="tabs" data-tabs role="tablist">
        <button
          type="button"
          role="tab"
          data-tab="ov"
          aria-selected={tab === "ov"}
          onClick={() => selectTab("ov")}
        >
          {tr("Overview", "கண்ணோட்டம்")}
        </button>
        <button
          type="button"
          role="tab"
          data-tab="camp"
          aria-selected={tab === "camp"}
          onClick={() => selectTab("camp")}
        >
          {tr("Campaigns", "பிரச்சாரங்கள்")}
        </button>
        <button
          type="button"
          role="tab"
          data-tab="cust"
          aria-selected={tab === "cust"}
          onClick={() => selectTab("cust")}
        >
          {tr("Customers", "வாடிக்கையாளர்கள்")}
        </button>
        <button
          type="button"
          role="tab"
          data-tab="prod"
          aria-selected={tab === "prod"}
          onClick={() => selectTab("prod")}
        >
          {tr("Products", "பொருட்கள்")}
        </button>
      </div>

      {/* SECTION 1: OVERVIEW */}
      <section data-panel="ov" hidden={tab !== "ov"}>
        {/* From message to money */}
        <div className="card">
          <div className="hd">
            <div>
              <h2>{tr("From message to money", "செய்தியிலிருந்து விற்பனை வரை")}</h2>
              <p>{tr("Out of the customers you messaged, this is how far they came.", "நீங்கள் செய்தி அனுப்பிய வாடிக்கையாளர்களில் எத்தனை பேர் எந்த நிலையை அடைந்துள்ளனர்.")}</p>
            </div>
          </div>
          <div className="list" id="jl">
            {J.map((j, i) => {
              const p = d.sent ? Math.round((j[1] / d.sent) * 100) : 0;
              const barBg = i === 0 ? "var(--bar)" : i > 3 ? "var(--bar4)" : "var(--bar2)";
              return (
                <div key={j[0]} className="row">
                  <div className="grow">
                    <div className="t">{j[0]}</div>
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i style={{ width: `${p}%`, background: barBg }}></i>
                    </div>
                    {j[2] ? <div className="muted small" style={{ marginTop: 4 }}>{j[2]}</div> : null}
                  </div>
                  <div style={{ textAlign: "right", minWidth: 120 }}>
                    <b style={{ font: "600 18px var(--display)" }}>{j[1].toLocaleString("en-IN")}</b>
                    {i ? <div className="muted small">{tr(`${p} of 100 sent`, `100-ல் ${p}`)}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* What you should do now */}
        <h2 style={{ font: "600 19px var(--title)", margin: "18px 0 10px" }}>{tr("What you should do now", "அடுத்து நீங்கள் செய்ய வேண்டியவை")}</h2>
        <div className="grid g3" id="acts">
          {A.map((a) => (
            <div key={a[0]} className="card">
              <div className="muted small">{a[0]}</div>
              <div className="v" style={{ font: "600 22px var(--display)", margin: "6px 0" }}>
                {a[1]}
              </div>
              <Link className="btn primary sm" href={a[3]}>
                {a[2]}
              </Link>
            </div>
          ))}
        </div>

        {/* Costblock: Wallet, Spend, Daily spend, Limits */}
        <div id="costblock" style={{ marginTop: 16 }}>
          <div className="grid g2" style={{ marginBottom: 16 }}>
            {/* Wallet */}
            <div className="card">
              <div className="hd">
                <h2>{tr("Wallet", "வாலட்")}</h2>
                <div className="tools">
                  <a className="btn sm primary" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">
                    {tr("Recharge", "ரீசார்ஜ்")}
                  </a>
                  <a className="btn sm" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">
                    {tr("Billing on Meta", "Meta-வில் கட்டண விவரம்")}
                  </a>
                </div>
              </div>
              {wallet.synced ? (
                <>
                  <div className="stat">
                    <div className="l">{tr("Balance", "இருப்பு")}</div>
                    <div className="v">{R(wallet.balance)}</div>
                  </div>
                  <div className="bar" style={{ margin: "12px 0" }}>
                    <i
                      style={{
                        width: `${Math.min(100, Math.max(4, Math.round((wallet.balance / 2000) * 100)))}%`,
                        background: wallet.isLow ? "var(--bar3)" : "var(--bar2)",
                      }}
                    ></i>
                  </div>
                  <p className="small">
                    <span className={`pill ${wallet.isLow ? "warn" : "ok"}`}>
                      {wallet.isLow ? tr("Low balance", "குறைந்த இருப்பு") : tr("Healthy balance", "போதுமான இருப்பு")}
                    </span>{" "}
                    {tr(
                      `Enough for about ${wallet.marketingMsgsLeft.toLocaleString("en-IN")} marketing or ${wallet.utilityMsgsLeft.toLocaleString("en-IN")} utility messages.${wallet.isLow ? " Top up soon." : ""}`,
                      `சுமார் ${wallet.marketingMsgsLeft.toLocaleString("en-IN")} விளம்பர அல்லது ${wallet.utilityMsgsLeft.toLocaleString("en-IN")} சேவை செய்திகளுக்குப் போதுமானது.${wallet.isLow ? " விரைவில் ரீசார்ஜ் செய்யவும்." : ""}`
                    )}
                  </p>
                </>
              ) : (
                <>
                  <div className="stat">
                    <div className="l">{tr("Spent this month", "இந்த மாதச் செலவு")}</div>
                    <div className="v">{R(spend.thisMonthGst)}</div>
                  </div>
                  <p className="small muted" style={{ marginTop: 10 }}>
                    {tr(
                      "Meta bills you directly for these messages. Your balance, payment method and invoices are on Meta.",
                      "இந்தச் செய்திகளுக்கு Meta நேரடியாக வசூலிக்கிறது. இருப்பு, கட்டண முறை, விலைப்பட்டியல்கள் Meta-வில் உள்ளன."
                    )}
                  </p>
                </>
              )}
            </div>

            {/* Spend */}
            <div className="card">
              <div className="hd">
                <h2>{tr("Spend", "செலவு")}</h2>
              </div>
              <div className="grid g2">
                <div className="stat">
                  <div className="l">{tr("This month", "இந்த மாதம்")}</div>
                  <div className="v">{R(spend.thisMonth)}</div>
                  <div className="d muted">{R(spend.thisMonthGst)} {tr("with GST", "GST உடன்")}</div>
                </div>
                <div className="stat">
                  <div className="l">{tr("Last month", "கடந்த மாதம்")}</div>
                  <div className="v">{R(spend.lastMonth)}</div>
                </div>
                <div className="stat">
                  <div className="l">{tr("Free replies left", "மீதமுள்ள இலவச பதில்கள்")}</div>
                  <div className="v">{spend.freeRepliesLeft.toLocaleString("en-IN")}</div>
                  <div className="d muted">{tr(`of ${spend.freeRepliesTotal.toLocaleString("en-IN")} this month`, `இந்த மாத மொத்த ${spend.freeRepliesTotal.toLocaleString("en-IN")}-ல்`)}</div>
                </div>
                <div className="stat">
                  <div className="l">{tr("Return per ₹1", "ரூ.1-க்கு வருமானம்")}</div>
                  <div className="v">{R(spend.returnPerRupee)}</div>
                  <div className="d up">{tr("in sales", "விற்பனையில்")}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily spend split */}
          <div className="grid split">
            <div className="card">
              <div className="hd">
                <h2>{tr("Daily spend", "தினசரி செலவு")}</h2>
                <div className="seg" id="cs">
                  <button
                    type="button"
                    data-v="a"
                    aria-pressed={cs === "a"}
                    onClick={() => setCs("a")}
                  >
                    {tr("Daily ₹", "தினசரி ₹")}
                  </button>
                  <button
                    type="button"
                    data-v="b"
                    aria-pressed={cs === "b"}
                    onClick={() => setCs("b")}
                  >
                    {tr("Paid vs free", "கட்டணம் vs இலவசம்")}
                  </button>
                </div>
              </div>
              <div id="cc">
                {cs === "a" ? (
                  <ReportBars
                    labels={daily.days}
                    series={[
                      { name: tr("Marketing", "விளம்பரம்"), color: "#F46B4E", vals: daily.marketing },
                      { name: tr("Utility", "பயன்பாடு"), color: "#FFC329", vals: daily.utility },
                    ]}
                    fmt={(x) => "₹" + Math.round(x)}
                    label={tr("Daily WhatsApp spend", "தினசரி WhatsApp செலவு")}
                  />
                ) : (
                  <ReportBars
                    labels={daily.days}
                    series={[
                      { name: tr("Paid messages", "கட்டண செய்திகள்"), color: "#10283B", vals: daily.paid },
                      { name: tr("Free messages", "இலவச செய்திகள்"), color: "#20C985", vals: daily.free },
                    ]}
                    fmt={(x) => String(Math.round(x))}
                    label={tr("Paid and free messages per day", "ஒரு நாளின் கட்டண மற்றும் இலவச செய்திகள்")}
                  />
                )}
              </div>
              <div className="legend" id="cg">
                {cs === "a" ? (
                  <>
                    <span style={{ "--c": "#F46B4E" } as React.CSSProperties}>{tr("Marketing", "விளம்பரம்")}</span>
                    <span style={{ "--c": "#FFC329" } as React.CSSProperties}>{tr("Utility", "பயன்பாடு")}</span>
                  </>
                ) : (
                  <>
                    <span style={{ "--c": "#10283B" } as React.CSSProperties}>{tr("Paid", "கட்டணம்")}</span>
                    <span style={{ "--c": "#20C985" } as React.CSSProperties}>{tr("Free", "இலவசம்")}</span>
                  </>
                )}
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                {tr(
                  `Highest day: ₹${daily.highestDay}.${daily.costPerDelivered > 0 ? ` Cost per delivered message: ₹${daily.costPerDelivered}.` : ""}`,
                  `அதிகபட்ச நாள் செலவு: ₹${daily.highestDay}.${daily.costPerDelivered > 0 ? ` வழங்கப்பட்ட ஒரு செய்தியின் செலவு: ₹${daily.costPerDelivered}.` : ""}`
                )}
              </p>
            </div>

            <div className="stack">
              <div className="card">
                <h2 style={{ marginBottom: 12 }}>{tr("Where the money goes", "செலவு எங்கு செல்கிறது")}</h2>
                <div className="row">
                  <div className="grow">
                    {tr("Marketing", "விளம்பரம்")}
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i
                        style={{
                          width: `${Math.round((breakdown.marketing / Math.max(1, breakdown.marketing + breakdown.utility)) * 100)}%`,
                          background: "var(--bar3)",
                        }}
                      ></i>
                    </div>
                  </div>
                  <b>{R(breakdown.marketing)}</b>
                </div>
                <div className="row">
                  <div className="grow">
                    {tr("Utility", "பயன்பாடு")}
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i
                        style={{
                          width: `${Math.round((breakdown.utility / Math.max(1, breakdown.marketing + breakdown.utility)) * 100)}%`,
                          background: "var(--bar2)",
                        }}
                      ></i>
                    </div>
                  </div>
                  <b>{R(breakdown.utility)}</b>
                </div>
                <div className="row">
                  <div className="grow">
                    {tr("Service replies", "வாடிக்கையாளர் சேவை பதில்கள்")}
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i style={{ width: "100%", background: "var(--bar4)" }}></i>
                    </div>
                  </div>
                  <b>{tr("Free", "இலவசம்")}</b>
                </div>
              </div>

              <div className="card">
                <h2 style={{ marginBottom: 6 }}>{tr("Sending limit today", "இன்றைய செய்தி வரம்பு")}</h2>
                <p className="muted small">{tr("Meta lets you message a set number of new people every 24 hours.", "ஒவ்வொரு 24 மணி நேரத்திலும் குறிப்பிட்ட புதிய நபர்களுக்கு செய்தி அனுப்ப Meta அனுமதிக்கிறது.")}</p>
                <div className="bar" style={{ margin: "12px 0 6px" }}>
                  <i
                    style={{
                      width: `${Math.min(100, Math.round((limits.used / Math.max(1, limits.limit)) * 100))}%`,
                      background: "var(--bar)",
                    }}
                  ></i>
                </div>
                <p className="small">
                  {tr(
                    `${limits.used} of ${limits.limit} used · ${limits.left} more allowed · a small buffer is kept for retries`,
                    `${limits.used} / ${limits.limit} பயன்படுத்தப்பட்டது · இன்னும் ${limits.left} அனுப்பலாம் · மறுமுயற்சிகளுக்கு சிறிதளவு ஒதுக்கப்பட்டுள்ளது`
                  )}
                </p>
              </div>
            </div>
          </div>

          <details className="card more" style={{ marginTop: 16 }}>
            <summary>
              <b style={{ font: "600 18px var(--display)" }}>{tr("How WhatsApp charges for messages", "WhatsApp செய்திகளுக்கான கட்டண முறை")}</b>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <p>{tr("Replies to a customer within 24 hours of their message are free (first 1,000 a month).", "வாடிக்கையாளர் செய்தி அனுப்பிய 24 மணி நேரத்திற்குள் அனுப்பும் பதில்கள் இலவசம் (மாதம் முதல் 1,000 உரையாடல்கள் வரை).")}</p>
              <p>{tr("Utility messages (order updates) cost less than marketing messages (offers).", "பயன்பாட்டுச் செய்திகள் (ஆர்டர் தகவல்கள்) விளம்பரச் செய்திகளை விட குறைந்த கட்டணம் கொண்டவை.")}</p>
              <p>{tr("Replies to customers who came from your ads are free for 72 hours.", "விளம்பரங்கள் மூலம் வந்த வாடிக்கையாளர்களுக்கு 72 மணி நேரம் வரை பதிலளிக்க இலவசம்.")}</p>
              <p>{tr("You pay only for messages that are delivered.", "வாடிக்கையாளருக்குச் சென்றடைந்த செய்திகளுக்கு மட்டுமே நீங்கள் கட்டணம் செலுத்துகிறீர்கள்.")}</p>
              <div className="note">
                <b>{tr("Save money:", "பணத்தை மிச்சப்படுத்த:")}</b> {tr("send offers to people who recently replied, and keep order updates as utility messages.", "சமீபத்தில் பதிலளித்தவர்களுக்கு சலுகைகளை அனுப்பவும், ஆர்டர் தகவல்களை பயன்பாட்டுச் செய்திகளாகவே வைக்கவும்.")}
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* SECTION 2: CAMPAIGNS */}
      <section data-panel="camp" hidden={tab !== "camp"}>
        <p className="muted" style={{ marginBottom: 12 }}>
          {tr(
            "Which broadcast worked best? Sorted by money back for every ₹1 spent.",
            "எந்த பிரச்சாரம் சிறந்த பலன் தந்தது? செலவழித்த ஒவ்வொரு ₹1-க்கும் கிடைத்த வருமானத்தின் அடிப்படையில் வரிசைப்படுத்தப்பட்டுள்ளது."
          )}
        </p>
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>{tr("Campaign", "பிரச்சாரம்")}</th>
                  <th className="num">{tr("Sent", "அனுப்பப்பட்டது")}</th>
                  <th className="num">{tr("Read", "பார்த்தவர்கள்")}</th>
                  <th className="num">{tr("Replies", "பதில்கள்")}</th>
                  <th className="num">{tr("Paid orders", "செலுத்தப்பட்ட ஆர்டர்கள்")}</th>
                  <th className="num">{tr("Spent", "செலவு")}</th>
                  <th className="num">{tr("Sales", "விற்பனை")}</th>
                  <th className="num">{tr("Back per ₹1", "ரூ.1-க்கு வருமானம்")}</th>
                  <th>{tr("Verdict", "முடிவு")}</th>
                </tr>
              </thead>
              <tbody id="ct">
                {data.campaigns.campaigns.length ? (
                  data.campaigns.campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.name}</b>
                      </td>
                      <td className="num">{c.sent.toLocaleString("en-IN")}</td>
                      <td className="num">{c.read.toLocaleString("en-IN")}</td>
                      <td className="num">{c.replies.toLocaleString("en-IN")}</td>
                      <td className="num">{c.paidOrders.toLocaleString("en-IN")}</td>
                      <td className="num">{R(c.spent)}</td>
                      <td className="num">{R(c.sales)}</td>
                      <td className="num">
                        <b>{R(c.returnRatio)}</b>
                      </td>
                      <td>
                        <span className={`pill ${c.verdict}`}>{c.verdictLabel}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 24 }} className="muted">
                      {tr(
                        "No broadcast campaigns run yet. Create a campaign to start tracking returns.",
                        "இன்னும் பிரச்சாரங்கள் எதுவும் நடத்தப்படவில்லை. வருமானத்தைக் கண்காணிக்க புதிய பிரச்சாரத்தை உருவாக்கவும்."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid g2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>{tr("Best day and time", "சிறந்த நாள் மற்றும் நேரம்")}</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              {tr("Based on when your customers read and replied.", "வாடிக்கையாளர்கள் எப்போது பார்த்தார்கள், பதிலளித்தார்கள் என்பதன் அடிப்படையில்.")}
            </p>
            <div className="list">
              {data.campaigns.bestTimes.length ? (
                data.campaigns.bestTimes.map((bt) => (
                  <div key={bt.slot} className="row">
                    <div className="grow">{bt.slot}</div>
                    <span className={`pill ${bt.badgeType}`}>{bt.badge}</span>
                  </div>
                ))
              ) : (
                <p className="muted small">{tr("Not enough customer reply activity yet.", "இன்னும் போதுமான வாடிக்கையாளர் பதில் விவரங்கள் இல்லை.")}</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>{tr("What to repeat", "மீண்டும் செய்ய வேண்டியவை")}</h2>
            <div className="list">
              {data.campaigns.whatToRepeat.length ? (
                data.campaigns.whatToRepeat.map((rpt, idx) => (
                  <div key={idx} className="row">
                    <div className="grow">{rpt.title}</div>
                    {rpt.isPill ? (
                      <span className={`pill ${rpt.pillType || "bad"}`}>{rpt.actionText}</span>
                    ) : (
                      <Link className="btn sm" href={rpt.actionHref || "/dashboard/campaigns/new"}>
                        {rpt.actionText}
                      </Link>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted small">{tr("Run your first broadcast campaign to see performance insights.", "செயல்திறன் நுண்ணறிவுகளைப் பார்க்க உங்கள் முதல் பிரச்சாரத்தை இயக்கவும்.")}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: CUSTOMERS */}
      <section data-panel="cust" hidden={tab !== "cust"}>
        <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="l">
              <span>{tr("Bought this month", "இந்த மாதம் வாங்கியவர்கள்")}</span>
              <ShoppingBag className="size-4" />
            </div>
            <div className="v">{data.customers.boughtThisMonth.toLocaleString("en-IN")}</div>
            <div className="d up">{data.customers.boughtDiff}</div>
          </div>
          <div className="card stat">
            <div className="l">
              <span>{tr("New customers", "புதிய வாடிக்கையாளர்கள்")}</span>
              <Users className="size-4" />
            </div>
            <div className="v">{data.customers.newCustomers.toLocaleString("en-IN")}</div>
          </div>
          <div className="card stat">
            <div className="l">
              <span>{tr("Came back", "மீண்டும் வந்தவர்கள்")}</span>
              <Repeat className="size-4" />
            </div>
            <div className="v">{data.customers.cameBack.toLocaleString("en-IN")}</div>
            <div className="d muted">{data.customers.repeatRatioLabel}</div>
          </div>
          <div className="card stat">
            <div className="l">
              <span>{tr("Have not bought in 60 days", "60 நாட்களாக வாங்காதவர்கள்")}</span>
              <AlertCircle className="size-4" />
            </div>
            <div className="v">{data.customers.lapsed60Days.toLocaleString("en-IN")}</div>
          </div>
        </div>

        <div className="grid g2">
          <div className="card">
            <div className="hd">
              <div>
                <h2>{tr("Who needs a follow-up", "யாருக்கு நினைவூட்டல் தேவை")}</h2>
                <p>{tr("Each group has a message ready.", "ஒவ்வொரு குழுவிற்கும் செய்தி தயாராக உள்ளது.")}</p>
              </div>
            </div>
            <div className="list" id="cs2">
              {data.customers.followUps.map((fu) => (
                <div key={fu.title} className="row">
                  <div className="grow">
                    <div className="t">{fu.title}</div>
                    <div className="muted small">{fu.sub}</div>
                  </div>
                  <Link className="btn sm" href={fu.href}>
                    {fu.action}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <h2>{tr("Where your customers are", "உங்கள் வாடிக்கையாளர்கள் இருக்கும் பகுதிகள்")}</h2>
            </div>
            <div className="list">
              {data.customers.locations.map((loc) => (
                <div key={loc.name} className="row">
                  <div className="grow">
                    {loc.name}
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i style={{ width: `${loc.pct}%`, background: "var(--bar)" }}></i>
                    </div>
                  </div>
                  <b>{loc.count.toLocaleString("en-IN")}</b>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 10 }}>
              {data.customers.topLocationInsight}
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: PRODUCTS */}
      <section data-panel="prod" hidden={tab !== "prod"}>
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>{tr("Product", "பொருள்")}</th>
                  <th className="num">{tr("Sold", "விற்கப்பட்டது")}</th>
                  <th className="num">{tr("Sales", "விற்பனை")}</th>
                  <th className="num">{tr("Left in carts", "கார்ட்டில் விடுபட்டவை")}</th>
                  <th>{tr("What to do", "என்ன செய்ய வேண்டும்")}</th>
                </tr>
              </thead>
              <tbody id="pt2">
                {data.products.products.map((p) => (
                  <tr key={p.name}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td className="num">{p.sold.toLocaleString("en-IN")}</td>
                    <td className="num">{R(p.sales)}</td>
                    <td className="num">{p.leftInCarts.toLocaleString("en-IN")}</td>
                    <td>
                      <span className={`pill ${p.pillType}`}>{p.action}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid g2">
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>{tr("Stuck in carts", "கார்ட்டுகளில் தேங்கியுள்ளவை")}</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              {tr(
                `Customers added these and did not pay. Worth ${R(data.products.stuckInCarts.totalWaiting)} in total.`,
                `வாடிக்கையாளர்கள் இவற்றைச் சேர்த்துவிட்டு பணம் செலுத்தவில்லை. மொத்த மதிப்பு ${R(data.products.stuckInCarts.totalWaiting)}.`
              )}
            </p>
            <div className="list">
              {data.products.stuckInCarts.items.length ? (
                data.products.stuckInCarts.items.map((it, idx) => (
                  <div key={idx} className="row">
                    <div className="grow">{it.text}</div>
                    <Link className="btn sm" href={it.href}>
                      {tr("Chase payment", "பணம் பெற நினைவூட்டு")}
                    </Link>
                  </div>
                ))
              ) : (
                <p className="muted small">{tr("No items currently stuck in unpaid carts.", "தற்போது செலுத்தப்படாத கார்ட்டுகளில் எந்தப் பொருளும் இல்லை.")}</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>{tr("Worth promoting", "விளம்பரப்படுத்த தகுதியானவை")}</h2>
            <div className="list">
              {data.products.worthPromoting.length ? (
                data.products.worthPromoting.map((wp, idx) => (
                  <div key={idx} className="row">
                    <div className="grow">
                      <div className="t">{wp.title}</div>
                      <div className="muted small">{wp.desc}</div>
                    </div>
                    <Link className={`btn sm ${wp.primary ? "primary" : ""}`} href={wp.actionHref}>
                      {wp.actionText}
                    </Link>
                  </div>
                ))
              ) : (
                <p className="muted small">{tr("Add products to your catalogue to get promotional recommendations.", "விளம்பர பரிந்துரைகளைப் பெற உங்கள் பட்டியலில் பொருட்களைச் சேர்க்கவும்.")}</p>
              )}
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
