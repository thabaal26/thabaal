"use client";

import { useState, useEffect } from "react";
import Link from "@/components/intent-link";
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
          <g key={lb}>
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

type NotifItem = {
  t: "order" | "reply" | "call" | "alert";
  u: number;
  h: string;
  s: string;
  a: string;
  l: string;
};

const INITIAL_NOTIFS: NotifItem[] = [
  { t: "order", u: 1, h: "New order #1048 · ₹1,240", s: "Meena R. · 4 items · 10 min ago", a: "View order", l: "/dashboard/orders" },
  { t: "reply", u: 1, h: "Reply from Karthik S.", s: "“Is the 5 kg pack available?” · 25 min ago", a: "Reply", l: "/dashboard/replies" },
  { t: "call", u: 1, h: "Missed WhatsApp call", s: "Priya V. · 1 h ago", a: "Call back", l: "/dashboard/calls" },
  { t: "alert", u: 0, h: "Wallet is getting low", s: "About 140 marketing messages left · 3 h ago", a: "Top up", l: "/dashboard/wallet" },
  { t: "order", u: 0, h: "Order #1044 delivered", s: "Yesterday, 6:40 pm", a: "View order", l: "/dashboard/orders" },
  { t: "reply", u: 0, h: "Reply from Lakshmi N.", s: "“Thank you, received.” · Yesterday", a: "Reply", l: "/dashboard/replies" },
];

export function ReportDashboard({ data }: { data: ComprehensiveReportData }) {
  const [per, setPer] = useState<PeriodKey>("m");
  const [tab, setTab] = useState<"ov" | "camp" | "cust" | "prod">("ov");
  const [cs, setCs] = useState<"a" | "b">("a");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<"all" | "unread" | "order" | "reply" | "call" | "alert">("all");
  const [notifs, setNotifs] = useState<NotifItem[]>(INITIAL_NOTIFS);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "ta">("en");

  const tr = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2600);
  };

  const toggleLang = () => {
    const next = lang === "en" ? "ta" : "en";
    setLang(next);
    showToast(next === "ta" ? "தமிழ்" : "English");
  };

  const toggleTheme = () => {
    const isDark =
      document.documentElement.classList.contains("dark") ||
      document.documentElement.getAttribute("data-theme") === "dark";
    const next = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("th-theme", next);
      localStorage.setItem("theme", next);
    } catch {}
    window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
    showToast(next === "dark" ? "Dark mode on" : "Light mode on");
  };

  const markAllRead = () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, u: 0 })));
    showToast("All marked read");
  };

  const unreadCount = notifs.filter((n) => n.u).length;
  const filteredNotifs = notifs.filter((n) => {
    if (notifFilter === "all") return true;
    if (notifFilter === "unread") return n.u > 0;
    return n.t === notifFilter;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const selectTab = (t: "ov" | "camp" | "cust" | "prod") => {
    setTab(t);
    try {
      window.history.replaceState(null, "", "#" + t);
    } catch {
      /* ignore */
    }
  };

  const d: PeriodFigures = per === "m" ? data.overview.m : data.overview.w;
  const r = d.returnRatio;
  const good = r >= 10;
  const okv = r >= 3;

  const k = [
    [tr("WhatsApp cost", "வாட்ஸ்அப் கட்டணம்"), R(d.cost), tr("Meta message charges", "மெட்டா மெசேஜ் கட்டணம்")],
    [tr("Paid sales", "செலுத்தப்பட்ட விற்பனை"), R(d.sales), tr("From customers you messaged", "மெசேஜ் அனுப்பிய வாடிக்கையாளர்களிடமிருந்து")],
    [tr("Money waiting", "நிலுவை பணம்"), R(d.wait), tr("Ordered, not yet paid", "ஆர்டர் செய்யப்பட்டது, பணம் செலுத்தப்படவில்லை")],
    [tr("Return per ₹1", "ரூ.1-க்கு வருமானம்"), R(r), tr("Sales, not profit", "விற்பனை, லாபம் அல்ல")],
  ];

  const J = [
    ["Messages sent", d.sent, "Customers you chose"],
    ["Reached their phone", d.reached, ""],
    ["Read it", d.read, ""],
    ["Replied", d.rep, "Within 3 days"],
    ["Ordered", d.ord, "Within 7 days"],
    ["Paid", d.paid, "Money in your account"],
  ] as const;

  const readDiff = Math.max(0, d.read - d.rep);
  const A = [
    [`${d.wait > 0 ? "1" : "0"} unpaid order`, R(d.wait), "Send reminder", "/dashboard/orders?show=unpaid"],
    [`${readDiff} read it, did not order`, "Follow up", "Create campaign", "/dashboard/campaigns/new"],
    [`${data.customers.followUps[1]?.sub || "Reorder due"}`, "Reach today", "View customers", "/dashboard/refills"],
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
            <button
              type="button"
              className="iconbtn"
              data-bell
              aria-label="Notifications"
              onClick={() => setDrawerOpen(true)}
              title="Notifications"
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {unreadCount > 0 && <span className="b">{unreadCount}</span>}
            </button>
            <button
              type="button"
              className="iconbtn"
              id="langBtn"
              aria-label="Language: English or Tamil"
              style={{ width: "auto", padding: "0 12px", fontWeight: 700 }}
              onClick={toggleLang}
            >
              {lang === "ta" ? "EN" : "தமிழ்"}
            </button>
            <button
              type="button"
              className="iconbtn"
              id="themeBtn"
              aria-label="Switch light or dark"
              onClick={toggleTheme}
            >
              <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
              </svg>
            </button>
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
          {lang === "ta" ? (
            <>
              செய்திகளுக்கு <b>{R(d.cost)}</b> செலவழித்து, <b>{R(d.sales)}</b> மதிப்புள்ள கட்டணம் செலுத்தப்பட்ட ஆர்டர்களைப் பெற்றுள்ளீர்கள். செலவழித்த ஒவ்வொரு <b>₹1</b>-க்கும் <b>{R(r)}</b> விற்பனை வந்துள்ளது.
            </>
          ) : (
            <>
              You spent <b>{R(d.cost)}</b> on messages and received <b>{R(d.sales)}</b> in paid orders. Every{" "}
              <b>₹1</b> spent brought back <b>{R(r)}</b> in sales.
            </>
          )}
        </p>
      </div>

      {/* 4-KPI Grid */}
      <div className="grid g4 keep2" id="rk" style={{ marginBottom: 16 }}>
        {k.map((x) => (
          <div key={x[0]} className="card stat">
            <div className="l">{x[0]}</div>
            <div className="v">{x[1]}</div>
            <div className="d muted">{x[2]}</div>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <div className="tabs" data-tabs role="tablist">
        <button
          type="button"
          data-tab="ov"
          data-ta="மொத்தம்"
          aria-selected={tab === "ov"}
          onClick={() => selectTab("ov")}
        >
          Overview
        </button>
        <button
          type="button"
          data-tab="camp"
          aria-selected={tab === "camp"}
          onClick={() => selectTab("camp")}
        >
          Campaigns
        </button>
        <button
          type="button"
          data-tab="cust"
          aria-selected={tab === "cust"}
          onClick={() => selectTab("cust")}
        >
          Customers
        </button>
        <button
          type="button"
          data-tab="prod"
          aria-selected={tab === "prod"}
          onClick={() => selectTab("prod")}
        >
          Products
        </button>
      </div>

      {/* SECTION 1: OVERVIEW */}
      <section data-panel="ov" hidden={tab !== "ov"}>
        {/* From message to money */}
        <div className="card">
          <div className="hd">
            <div>
              <h2>From message to money</h2>
              <p>Out of the customers you messaged, this is how far they came.</p>
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
                    {i ? <div className="muted small">{p} of 100 sent</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* What you should do now */}
        <h2 style={{ font: "600 18px var(--display)", margin: "18px 0 10px" }}>What you should do now</h2>
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
                <h2>Wallet</h2>
                <div className="tools">
                  <a className="btn sm primary" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">
                    Recharge
                  </a>
                  <a className="btn sm" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">
                    Billing on Meta
                  </a>
                </div>
              </div>
              <div className="stat">
                <div className="l">Balance</div>
                <div className="v">{R(wallet.balance)}</div>
              </div>
              <div className="bar" style={{ margin: "12px 0" }}>
                <i
                  style={{
                    width: `${Math.min(100, Math.max(10, Math.round((wallet.balance / 2000) * 100)))}%`,
                    background: "var(--bar3)",
                  }}
                ></i>
              </div>
              <p className="small">
                <span className={`pill ${wallet.isLow ? "warn" : "ok"}`}>
                  {wallet.isLow ? "Low balance" : "Healthy balance"}
                </span>{" "}
                You can send about <b>{wallet.marketingMsgsLeft.toLocaleString("en-IN")}</b> marketing or{" "}
                <b>{wallet.utilityMsgsLeft.toLocaleString("en-IN")}</b> utility messages. Top up soon.
              </p>
            </div>

            {/* Spend */}
            <div className="card">
              <div className="hd">
                <h2>Spend</h2>
              </div>
              <div className="grid g2">
                <div className="stat">
                  <div className="l">This month</div>
                  <div className="v">{R(spend.thisMonth)}</div>
                  <div className="d muted">{R(spend.thisMonthGst)} with GST</div>
                </div>
                <div className="stat">
                  <div className="l">Last month</div>
                  <div className="v">{R(spend.lastMonth)}</div>
                </div>
                <div className="stat">
                  <div className="l">Free replies left</div>
                  <div className="v">{spend.freeRepliesLeft.toLocaleString("en-IN")}</div>
                  <div className="d muted">of {spend.freeRepliesTotal.toLocaleString("en-IN")} this month</div>
                </div>
                <div className="stat">
                  <div className="l">Return per ₹1</div>
                  <div className="v">{R(spend.returnPerRupee)}</div>
                  <div className="d up">in sales</div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily spend split */}
          <div className="grid split">
            <div className="card">
              <div className="hd">
                <h2>Daily spend</h2>
                <div className="seg" id="cs">
                  <button
                    type="button"
                    data-v="a"
                    aria-pressed={cs === "a"}
                    onClick={() => setCs("a")}
                  >
                    Daily ₹
                  </button>
                  <button
                    type="button"
                    data-v="b"
                    aria-pressed={cs === "b"}
                    onClick={() => setCs("b")}
                  >
                    Paid vs free
                  </button>
                </div>
              </div>
              <div id="cc">
                {cs === "a" ? (
                  <ReportBars
                    labels={daily.days}
                    series={[
                      { name: "Marketing", color: "#F46B4E", vals: daily.marketing },
                      { name: "Utility", color: "#FFC329", vals: daily.utility },
                    ]}
                    fmt={(x) => "₹" + Math.round(x)}
                    label="Daily WhatsApp spend"
                  />
                ) : (
                  <ReportBars
                    labels={daily.days}
                    series={[
                      { name: "Paid messages", color: "#10283B", vals: daily.paid },
                      { name: "Free messages", color: "#20C985", vals: daily.free },
                    ]}
                    fmt={(x) => String(Math.round(x))}
                    label="Paid and free messages per day"
                  />
                )}
              </div>
              <div className="legend" id="cg">
                {cs === "a" ? (
                  <>
                    <span style={{ "--c": "#F46B4E" } as React.CSSProperties}>Marketing</span>
                    <span style={{ "--c": "#FFC329" } as React.CSSProperties}>Utility</span>
                  </>
                ) : (
                  <>
                    <span style={{ "--c": "#10283B" } as React.CSSProperties}>Paid</span>
                    <span style={{ "--c": "#20C985" } as React.CSSProperties}>Free</span>
                  </>
                )}
              </div>
              <p className="muted small" style={{ marginTop: 10 }}>
                Highest day: ₹{daily.highestDay}. Cost per delivered message: ₹{daily.costPerDelivered}.
              </p>
            </div>

            <div className="stack">
              <div className="card">
                <h2 style={{ marginBottom: 12 }}>Where the money goes</h2>
                <div className="row">
                  <div className="grow">
                    Marketing
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
                    Utility
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
                    Service replies
                    <div className="bar" style={{ marginTop: 6 }}>
                      <i style={{ width: "100%", background: "var(--bar4)" }}></i>
                    </div>
                  </div>
                  <b>Free</b>
                </div>
              </div>

              <div className="card">
                <h2 style={{ marginBottom: 6 }}>Sending limit today</h2>
                <p className="muted small">Meta lets you message a set number of new people every 24 hours.</p>
                <div className="bar" style={{ margin: "12px 0 6px" }}>
                  <i
                    style={{
                      width: `${Math.min(100, Math.round((limits.used / Math.max(1, limits.limit)) * 100))}%`,
                      background: "var(--bar)",
                    }}
                  ></i>
                </div>
                <p className="small">
                  <b>{limits.used}</b> of {limits.limit} used · <b>{limits.left}</b> more allowed · a small buffer is kept for retries
                </p>
              </div>
            </div>
          </div>

          <details className="card more" style={{ marginTop: 16 }}>
            <summary>
              <b style={{ font: "600 18px var(--display)" }}>How WhatsApp charges, in plain words</b>
            </summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <p>Replies to a customer within 24 hours of their message are free (first 1,000 a month).</p>
              <p>Utility messages (order updates) cost less than marketing messages (offers).</p>
              <p>Replies to customers who came from your ads are free for 72 hours.</p>
              <p>You pay only for messages that are delivered.</p>
              <div className="note">
                <b>Save money:</b> send offers to people who recently replied, and keep order updates as utility messages.
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* SECTION 2: CAMPAIGNS */}
      <section data-panel="camp" hidden={tab !== "camp"}>
        <p className="muted" style={{ marginBottom: 12 }}>
          Which broadcast worked best? Sorted by money back for every ₹1 spent.
        </p>
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th className="num">Sent</th>
                  <th className="num">Read</th>
                  <th className="num">Replies</th>
                  <th className="num">Paid orders</th>
                  <th className="num">Spent</th>
                  <th className="num">Sales</th>
                  <th className="num">Back per ₹1</th>
                  <th>Verdict</th>
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
                      No broadcast campaigns run yet. Create a campaign to start tracking returns.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid g2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Best day and time</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Based on when your customers read and replied.
            </p>
            <div className="list">
              {data.campaigns.bestTimes.map((bt) => (
                <div key={bt.slot} className="row">
                  <div className="grow">{bt.slot}</div>
                  <span className={`pill ${bt.badgeType}`}>{bt.badge}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>What to repeat</h2>
            <div className="list">
              {data.campaigns.whatToRepeat.map((rpt, idx) => (
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
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: CUSTOMERS */}
      <section data-panel="cust" hidden={tab !== "cust"}>
        <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
          <div className="card stat">
            <div className="l">Bought this month</div>
            <div className="v">{data.customers.boughtThisMonth.toLocaleString("en-IN")}</div>
            <div className="d up">{data.customers.boughtDiff}</div>
          </div>
          <div className="card stat">
            <div className="l">New customers</div>
            <div className="v">{data.customers.newCustomers.toLocaleString("en-IN")}</div>
          </div>
          <div className="card stat">
            <div className="l">Came back</div>
            <div className="v">{data.customers.cameBack.toLocaleString("en-IN")}</div>
            <div className="d muted">{data.customers.repeatRatioLabel}</div>
          </div>
          <div className="card stat">
            <div className="l">Have not bought in 60 days</div>
            <div className="v">{data.customers.lapsed60Days.toLocaleString("en-IN")}</div>
          </div>
        </div>

        <div className="grid g2">
          <div className="card">
            <div className="hd">
              <div>
                <h2>Who needs a follow-up</h2>
                <p>Each group has a message ready.</p>
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
              <h2>Where your customers are</h2>
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
                  <th>Product</th>
                  <th className="num">Sold</th>
                  <th className="num">Sales</th>
                  <th className="num">Left in carts</th>
                  <th>What to do</th>
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
            <h2 style={{ marginBottom: 10 }}>Stuck in carts</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Customers added these and did not pay. Worth {R(data.products.stuckInCarts.totalWaiting)} in total.
            </p>
            <div className="list">
              {data.products.stuckInCarts.items.length ? (
                data.products.stuckInCarts.items.map((it, idx) => (
                  <div key={idx} className="row">
                    <div className="grow">{it.text}</div>
                    <Link className="btn sm" href={it.href}>
                      Chase payment
                    </Link>
                  </div>
                ))
              ) : (
                <p className="muted small">No items currently stuck in unpaid carts.</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Worth promoting</h2>
            <div className="list">
              {data.products.worthPromoting.map((wp, idx) => (
                <div key={idx} className="row">
                  <div className="grow">
                    <div className="t">{wp.title}</div>
                    <div className="muted small">{wp.desc}</div>
                  </div>
                  <Link className={`btn sm ${wp.primary ? "primary" : ""}`} href={wp.actionHref}>
                    {wp.actionText}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 backdrop-blur-[2px] transition-opacity"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Notifications Drawer */}
      <aside
        className={`drawer ${drawerOpen ? "open" : ""}`}
        id="drawer"
        aria-label="Notifications"
      >
        <div className="hd">
          <h2>{tr("Notifications", "அறிவிப்புகள்")}</h2>
          <div className="tools">
            <button type="button" className="btn sm" id="nread" onClick={markAllRead}>
              {tr("Mark all read", "அனைத்தும் படித்ததாக குறி")}
            </button>
            <button
              type="button"
              className="btn sm"
              id="nclose"
              onClick={() => setDrawerOpen(false)}
            >
              {tr("Close", "மூடு")}
            </button>
          </div>
        </div>

        <div className="chips" id="nchips">
          {(
            [
              { key: "all", label: tr("All", "அனைத்தும்") },
              { key: "unread", label: `${tr("Unread", "படிக்காதவை")} (${unreadCount})` },
              { key: "order", label: tr("Orders", "ஆர்டர்கள்") },
              { key: "reply", label: tr("Replies", "பதில்கள்") },
              { key: "call", label: tr("Calls", "அழைப்புகள்") },
              { key: "alert", label: tr("Alerts", "எச்சரிக்கைகள்") },
            ] as const
          ).map((c) => (
            <button
              key={c.key}
              type="button"
              className="chip"
              data-f={c.key}
              aria-pressed={notifFilter === c.key}
              onClick={() => setNotifFilter(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="list" id="nlist">
          {filteredNotifs.length ? (
            filteredNotifs.map((n, idx) => (
              <div key={idx} className={`row ${n.u ? "unread" : ""}`}>
                <div className="grow">
                  <div className="t">{n.h}</div>
                  <div className="muted small">{n.s}</div>
                </div>
                <Link
                  className="btn sm"
                  href={n.l}
                  onClick={() => {
                    setDrawerOpen(false);
                  }}
                >
                  {n.a}
                </Link>
              </div>
            ))
          ) : (
            <p className="muted" style={{ padding: "16px 0" }}>
              {tr("Nothing here.", "இங்கு எதுவும் இல்லை.")}
            </p>
          )}
        </div>
      </aside>

      {/* Floating Toast */}
      <div
        className={`toast ${toastMsg ? "on" : ""}`}
        id="toast"
        role="status"
        aria-live="polite"
      >
        {toastMsg || ""}
      </div>
    </div>
  );
}
