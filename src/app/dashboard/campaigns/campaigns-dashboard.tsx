"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "@/components/intent-link";
import { ArrowUpRight, IndianRupee, Plus, Send, ShoppingBag } from "@/components/icons";
import { Stat } from "@/components/ui";
import { PortalPage, T } from "../portal-ui";
import { deleteCampaign, duplicateCampaign, toggleCampaign } from "../actions/campaigns";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/context";

export type CampaignItem = {
  id: string;
  n: string;
  w: string;
  tpl: string;
  s: "scheduled" | "running" | "paused" | "completed" | "drafts";
  aud: string;
  cnt: number;
  sent: number;
  seen: number;
  rep: number;
  ord: number;
  sp: number;
  sale: number;
  fail?: number;
  est?: number;
  body?: string;
  buttons?: string[];
  isLive?: boolean;
};

export type CampaignsDashboardProps = {
  kpi: {
    sent: number;
    spent: number;
    sales: number;
    back: number;
  };
  campaigns: CampaignItem[];
  canManage: boolean;
  children?: React.ReactNode;
};

const TAB_DEFS = [
  { id: "all", label: "All", ta: "அனைத்தும்" },
  { id: "scheduled", label: "Scheduled", ta: "திட்டமிடப்பட்டது" },
  { id: "running", label: "Running", ta: "இயங்குகிறது" },
  { id: "completed", label: "Completed", ta: "முடிந்தது" },
  { id: "drafts", label: "Drafts", ta: "வரைவுகள்" },
  { id: "paused", label: "Paused", ta: "நிறுத்தப்பட்டது" },
  { id: "auto", label: "Automations", ta: "தானியங்கு" },
] as const;

type TabId = (typeof TAB_DEFS)[number]["id"];

const SL: Record<CampaignItem["s"], [string, string, string]> = {
  scheduled: ["info", "Scheduled", "திட்டமிடப்பட்டது"],
  running: ["ok", "Running", "இயங்குகிறது"],
  completed: ["mute", "Completed", "முடிந்தது"],
  drafts: ["mute", "Draft", "வரைவு"],
  paused: ["warn", "Paused", "நிறுத்தப்பட்டது"],
};

function R(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function ver(c: CampaignItem, isTamil = false): [string, string] | null {
  if (!c.sp || !c.ord) return null;
  const r = c.sale / c.sp;
  if (isTamil) {
    return r >= 10 ? ["ok", "மிகச் சிறந்த பலன்"] : r >= 3 ? ["warn", "நல்ல பலன்"] : ["bad", "செலவுக்கு ஏற்ற பலனில்லை"];
  }
  return r >= 10 ? ["ok", "Working well"] : r >= 3 ? ["warn", "OK"] : ["bad", "Not paying back"];
}

function sum(c: CampaignItem, isTamil = false) {
  const r = Math.round((c.sale / c.sp) * 100) / 100;
  if (isTamil) {
    return (
      `${c.sent.toLocaleString("en-IN")} வாடிக்கையாளர்களை சென்றடைந்தது. ` +
      `${Math.round((c.sent * c.seen) / 100).toLocaleString("en-IN")} பேர் படித்தனர். ` +
      `${c.ord} ஆர்டர்கள் மூலம் ${R(c.sale)} விற்பனை வந்தது. ` +
      `செலவு ${R(c.sp)}. ஒவ்வொரு ₹1 செலவுக்கும் ${R(r)} விற்பனை.`
    );
  }
  return (
    "Reached " +
    c.sent.toLocaleString("en-IN") +
    " customers. " +
    Math.round((c.sent * c.seen) / 100).toLocaleString("en-IN") +
    " read it. " +
    c.ord +
    " paid orders brought " +
    R(c.sale) +
    ". You spent " +
    R(c.sp) +
    ". Every ₹1 spent brought " +
    R(r) +
    " in sales."
  );
}

export function CampaignsDashboard({ kpi, campaigns: initialCampaigns, canManage, children }: CampaignsDashboardProps) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [items, setItems] = useState<CampaignItem[]>(initialCampaigns);
  const [tab, setTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [progModal, setProgModal] = useState<CampaignItem | null>(null);
  const [pvModal, setPvModal] = useState<CampaignItem | null>(null);
  const [, startTransition] = useTransition();

  // Keep state updated when server revalidates (React-recommended state adjustment during render)
  const [prevInitial, setPrevInitial] = useState(initialCampaigns);
  if (initialCampaigns !== prevInitial) {
    setPrevInitial(initialCampaigns);
    setItems(initialCampaigns);
  }

  // Sync tab with URL hash on mount & hash change
  useEffect(() => {
    const handleHash = () => {
      const h = window.location.hash.replace("#", "").toLowerCase() as TabId;
      if (TAB_DEFS.some((t) => t.id === h)) {
        setTab(h);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const switchTab = (t: TabId) => {
    setTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${t}`);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2800);
  };

  // Compare selection toggle
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCompareClick = () => {
    if (selectedIds.length < 2) {
      showToast("Tick “Compare” on two or more campaigns");
      return;
    }
    setShowCompare(true);
  };

  // Action handlers
  const handlePause = async (c: CampaignItem) => {
    if (c.isLive) {
      startTransition(async () => {
        const res = await toggleCampaign(c.id, false);
        showToast(res.message || "Campaign paused");
        router.refresh();
      });
    } else {
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, s: "paused" } : x)));
      showToast("Campaign paused");
    }
  };

  const handleResume = async (c: CampaignItem) => {
    if (c.isLive) {
      startTransition(async () => {
        const res = await toggleCampaign(c.id, true);
        showToast(res.message || "Campaign resumed");
        router.refresh();
      });
    } else {
      setItems((prev) => prev.map((x) => (x.id === c.id ? { ...x, s: "running" } : x)));
      showToast("Campaign resumed");
    }
  };

  const handleDelete = async (c: CampaignItem) => {
    if (!window.confirm(`Delete "${c.n}"?`)) return;
    if (c.isLive) {
      startTransition(async () => {
        const res = await deleteCampaign(c.id);
        showToast(res.message || "Campaign deleted");
        router.refresh();
      });
    } else {
      setItems((prev) => prev.filter((x) => x.id !== c.id));
      setSelectedIds((prev) => prev.filter((x) => x !== c.id));
      showToast("Campaign deleted");
    }
  };

  const handleDuplicate = async (c: CampaignItem) => {
    if (c.isLive) {
      startTransition(async () => {
        const res = await duplicateCampaign(c.id);
        showToast(res.message || "Copy saved as a draft");
        router.refresh();
      });
    } else {
      const copy: CampaignItem = {
        ...c,
        id: "draft-" + Date.now(),
        n: c.n + " (copy)",
        s: "drafts",
        sent: 0,
        sale: 0,
        sp: 0,
        ord: 0,
        rep: 0,
        seen: 0,
        fail: 0,
      };
      setItems((prev) => [copy, ...prev]);
      showToast("Copy saved as a draft");
    }
  };

  const handleViewProgress = (c: CampaignItem) => {
    setProgModal(c);
  };

  const handlePreview = (c: CampaignItem) => {
    setPvModal(c);
  };

  // Automations list from prototype
  const [automations, setAutomations] = useState([
    { name: "Order updates", desc: "Confirmed, paid, dispatched, delivered and cancelled messages.", cat: "Utility", val: 1 },
    { name: "Payment reminder", desc: "If a customer has not paid after 1 day, send one gentle reminder with the link.", cat: "Utility", val: 1 },
    { name: "Refill reminders", desc: "30 days after an order, once, unless they already reordered.", cat: "Marketing", val: 1 },
    { name: "Win-back", desc: "One message to customers who have not bought for 56 days.", cat: "Marketing", val: 0 },
    { name: "Replies to button taps", desc: "Customers who tap “Send price list” or “Order now” get the answer straight away.", cat: "Free", val: 1 },
    { name: "Pay inside WhatsApp (UPI)", desc: "Customers pay with GPay, PhonePe, Paytm or BHIM. Paid orders are marked and a receipt is sent.", cat: "Utility", val: 1 },
    { name: "Login codes", desc: "Codes sent when someone signs in.", cat: "Authentication", val: 2 },
    { name: "Stop promotions", desc: "Customers who reply STOP are removed from offers. Always on.", cat: "Free", val: 2 },
  ]);

  const toggleAutomation = (idx: number) => {
    setAutomations((prev) =>
      prev.map((a, i) => {
        if (i !== idx || a.val === 2) return a;
        const nextVal = a.val === 1 ? 0 : 1;
        showToast(`${a.name} ${nextVal ? "turned on" : "turned off"}`);
        return { ...a, val: nextVal };
      }),
    );
  };

  const filteredItems = items.filter((x) => {
    const matchesTab = tab === "all" || x.s === tab;
    const matchesSearch = !search || x.n.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const comparedList = items.filter((x) => selectedIds.includes(x.id));

  return (
    <PortalPage
      title="Campaigns"
      titleTa="பிரச்சாரங்கள்"
      sub="Create, schedule and improve your WhatsApp broadcasts."
      subTa="உங்கள் WhatsApp பிரச்சாரங்களை உருவாக்கி, திட்டமிட்டு, பலன்களைக் காணுங்கள்."
      actions={
        canManage ? (
          <Link className="btn primary" href="/dashboard/campaigns/new">
            <Plus aria-hidden className="ic" /> {isTamil ? "புதிய பிரச்சாரம்" : "New campaign"}
          </Link>
        ) : undefined
      }
    >
      {/* 4-KPI Stat Strip */}
      <div className="grid g4 keep2" suppressHydrationWarning style={{ marginBottom: 16 }}>
        <Stat
          label={isTamil ? "இம்மாதம் அனுப்பியவை" : "Sent this month"}
          value={kpi.sent.toLocaleString("en-IN")}
          sub={isTamil ? "பிரச்சாரச் செய்திகள்" : "Broadcast messages"}
          icon={<Send className="size-4" />}
          tone="info"
        />
        <Stat
          label={isTamil ? "செலவான தொகை" : "Money spent"}
          value={R(kpi.spent)}
          sub={isTamil ? "Meta கட்டணங்கள்" : "Meta message charges"}
          icon={<IndianRupee className="size-4" />}
          tone="amber"
        />
        <Stat
          label={isTamil ? "பிரச்சார விற்பனை" : "Sales from campaigns"}
          value={R(kpi.sales)}
          sub={isTamil ? "பணம் வந்த ஆர்டர்கள்" : "Paid orders"}
          icon={<ShoppingBag className="size-4" />}
          tone="brand"
        />
        <Stat
          label={isTamil ? "ஒவ்வொரு ₹1-க்கும் வருவாய்" : "Back for every ₹1"}
          value={kpi.spent > 0 ? R(kpi.back) : "—"}
          sub={isTamil ? "விற்பனைத் தொகை" : "Sales, not profit"}
          icon={<ArrowUpRight className="size-4" />}
          tone="violet"
        />
      </div>

      {/* Tabs */}
      <div className="tabs" data-tabs role="tablist" aria-label={isTamil ? "பிரச்சார பார்வைகள்" : "Campaign views"} suppressHydrationWarning>
        {TAB_DEFS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}>
            <T ta={t.ta}>{t.label}</T>
          </button>
        ))}
      </div>

      {tab !== "auto" ? (
        <section data-panel={tab} suppressHydrationWarning>
          {/* Toolbar */}
          <div className="toolbar" role="search" suppressHydrationWarning>
            <div className="search">
              <label htmlFor="cam-cq" className="sr-only">
                {isTamil ? "பிரச்சாரங்களைத் தேடுக" : "Search campaigns"}
              </label>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                type="search"
                id="cam-cq"
                name="q"
                placeholder={isTamil ? "பிரச்சாரத்தின் பெயரைத் தேடுக…" : "Search campaign name"}
                aria-label={isTamil ? "பிரச்சாரத்தின் பெயரைத் தேடுக" : "Search campaign name"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn sm" id="cmp" style={{ marginLeft: "auto" }} onClick={handleCompareClick}>
              {isTamil ? "தேர்வு செய்தவற்றை ஒப்பிடு" : "Compare selected"}
            </button>
          </div>

          {/* Comparison drawer / card */}
          {showCompare && (
            <div className="card" id="cmpb" style={{ marginTop: 16, marginBottom: 16 }}>
              <div className="hd">
                <h2>{isTamil ? "ஒப்பீடு" : "Comparison"}</h2>
                <button type="button" className="btn sm" id="cmpx" onClick={() => setShowCompare(false)}>
                  {isTamil ? "மூடுக" : "Close"}
                </button>
              </div>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>{isTamil ? "பிரச்சாரம்" : "Campaign"}</th>
                      <th className="num">{isTamil ? "அனுப்பியது" : "Sent"}</th>
                      <th className="num">{isTamil ? "படித்தது" : "Read"}</th>
                      <th className="num">{isTamil ? "பதில்கள்" : "Replies"}</th>
                      <th className="num">{isTamil ? "ஆர்டர்கள்" : "Orders"}</th>
                      <th className="num">{isTamil ? "செலவு" : "Spent"}</th>
                      <th className="num">{isTamil ? "விற்பனை" : "Sales"}</th>
                      <th className="num">{isTamil ? "வருவாய்" : "Return"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparedList.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.n}</b>
                        </td>
                        <td className="num">{c.sent.toLocaleString("en-IN")}</td>
                        <td className="num">{Math.round((c.sent * c.seen) / 100).toLocaleString("en-IN")}</td>
                        <td className="num">{c.rep}</td>
                        <td className="num">{c.ord}</td>
                        <td className="num">{R(c.sp)}</td>
                        <td className="num">{R(c.sale)}</td>
                        <td className="num">{c.sp > 0 ? R(Math.round((c.sale / c.sp) * 100) / 100) : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Campaign cards stack */}
          <div className="stack" id={`l-${tab}`}>
            {filteredItems.map((c) => {
              const v = ver(c, isTamil);
              const pct = c.cnt > 0 ? Math.round((c.sent / c.cnt) * 100) : 0;
              return (
                <article key={c.id} className="card">
                  {/* Card Header */}
                  <div className="hd" style={{ marginBottom: 8 }}>
                    <div>
                      <h2 style={{ fontSize: 18 }}>
                        {c.isLive ? (
                          <Link href={`/dashboard/campaigns/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                            {c.n}
                          </Link>
                        ) : (
                          c.n
                        )}
                      </h2>
                      <p>
                        {c.w} · {c.aud} · &ldquo;{c.tpl}&rdquo;
                      </p>
                    </div>
                    <div className="tools">
                      <span className={`pill ${SL[c.s][0]}`}>{isTamil ? SL[c.s][2] : SL[c.s][1]}</span>
                      {v && <span className={`pill ${v[0]}`}>{v[1]}</span>}
                    </div>
                  </div>

                  {/* Card Body */}
                  {c.s === "scheduled" && (
                    <p className="small">
                      {isTamil ? (
                        <>
                          <b>{c.cnt.toLocaleString("en-IN")}</b> நபர்களுக்கு செல்லும் · வாலட்டிலிருந்து சுமார் <b>{R(c.est ?? 0)}</b> செலவாகும்.
                        </>
                      ) : (
                        <>
                          Will go to <b>{c.cnt.toLocaleString("en-IN")}</b> people · costs about <b>{R(c.est ?? 0)}</b> from your wallet.
                        </>
                      )}
                    </p>
                  )}

                  {c.s === "drafts" && (
                    <p className="small muted">
                      {isTamil ? "முடிக்கப்படவில்லை. வாடிக்கையாளர்களையும் தொடங்கும் நேரத்தையும் தேர்வு செய்யவும்." : "Not finished. Pick the customers and the time to start it."}
                    </p>
                  )}

                  {(c.s === "running" || c.s === "paused" || c.s === "completed") && (
                    <>
                      {c.s === "running" && (
                        <>
                          <div className="bar" style={{ marginBottom: 10 }}>
                            <i style={{ width: `${pct}%`, background: "var(--bar)" }} />
                          </div>
                          <p className="small muted" style={{ marginBottom: 8 }}>
                            {isTamil
                              ? `${c.sent.toLocaleString("en-IN")} / ${c.cnt.toLocaleString("en-IN")} அனுப்பப்பட்டது (${pct}%)${c.fail ? ` · ${c.fail} தோல்வி` : ""}`
                              : `${c.sent.toLocaleString("en-IN")} of ${c.cnt.toLocaleString("en-IN")} sent (${pct}%)${c.fail ? ` · ${c.fail} failed` : ""}`}
                          </p>
                        </>
                      )}

                      <div className="grid g4 keep2">
                        <div className="stat">
                          <div className="l">{isTamil ? "அனுப்பியது" : "Sent"}</div>
                          <div className="v" style={{ fontSize: 20 }}>
                            {c.sent.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="stat">
                          <div className="l">{isTamil ? "படித்தது" : "Read"}</div>
                          <div className="v" style={{ fontSize: 20 }}>
                            {Math.round((c.sent * c.seen) / 100).toLocaleString("en-IN")}
                          </div>
                          <div className="d muted">{isTamil ? `100-ல் ${c.seen}` : `${c.seen} of 100`}</div>
                        </div>
                        <div className="stat">
                          <div className="l">{isTamil ? "பதில்கள்" : "Replies"}</div>
                          <div className="v" style={{ fontSize: 20 }}>
                            {c.rep}
                          </div>
                        </div>
                        <div className="stat">
                          <div className="l">{isTamil ? "ஆர்டர்கள்" : "Paid orders"}</div>
                          <div className="v" style={{ fontSize: 20 }}>
                            {c.ord}
                          </div>
                        </div>
                      </div>

                      {c.s === "completed" ? (
                        <p className="note small" style={{ marginTop: 12 }}>
                          {sum(c, isTamil)}
                        </p>
                      ) : (
                        <p className="small" style={{ marginTop: 10 }}>
                          {isTamil ? "செலவு " : "Spent "}<b>{R(c.sp)}</b> · {isTamil ? "விற்பனை " : "Sales "}<b>{R(c.sale)}</b>
                        </p>
                      )}
                    </>
                  )}

                  {/* Card Actions Footer */}
                  <div className="tools" style={{ marginTop: 12 }}>
                    {c.s === "scheduled" && (
                      <>
                        {c.isLive ? (
                          <Link className="btn primary" href={`/dashboard/campaigns/${c.id}`}>
                            {isTamil ? "நேரத்தைக் காண்க" : "View schedule"}
                          </Link>
                        ) : (
                          <button type="button" className="btn primary" onClick={() => handleViewProgress(c)}>
                            {isTamil ? "நேரத்தைக் காண்க" : "View schedule"}
                          </button>
                        )}
                        {c.isLive ? (
                          <Link className="btn sm" href={`/dashboard/campaigns/${c.id}`}>
                            {isTamil ? "நேரத்தை மாற்றுக" : "Edit time"}
                          </Link>
                        ) : (
                          <button type="button" className="btn sm" onClick={() => showToast(isTamil ? "நேரலை செயலியில் மாற்றலாம்" : "Edit opens in the live app")}>
                            {isTamil ? "நேரத்தை மாற்றுக" : "Edit time"}
                          </button>
                        )}
                        <button type="button" className="btn sm" onClick={() => handlePause(c)}>
                          {isTamil ? "நிறுத்துக" : "Pause"}
                        </button>
                        <button type="button" className="btn sm" onClick={() => handlePreview(c)}>
                          {isTamil ? "முன்னோட்டம்" : "Preview"}
                        </button>
                      </>
                    )}

                    {c.s === "running" && (
                      <>
                        <button type="button" className="btn primary" onClick={() => handleViewProgress(c)}>
                          {isTamil ? "நிலையைக் காண்க" : "View progress"}
                        </button>
                        <button type="button" className="btn sm" onClick={() => handlePause(c)}>
                          {isTamil ? "நிறுத்துக" : "Pause"}
                        </button>
                        <Link className="btn sm" href="/dashboard/messages?status=FAILED">
                          {isTamil ? "தோல்வியடைந்த செய்திகள்" : "View failed messages"}
                        </Link>
                      </>
                    )}

                    {c.s === "paused" && (
                      <>
                        <button type="button" className="btn primary" onClick={() => handleResume(c)}>
                          {isTamil ? "தொடங்குக" : "Resume"}
                        </button>
                        {c.isLive ? (
                          <Link className="btn sm" href={`/dashboard/campaigns/${c.id}`}>
                            {isTamil ? "மாற்றுக" : "Edit"}
                          </Link>
                        ) : (
                          <button type="button" className="btn sm" onClick={() => showToast(isTamil ? "நேரலை செயலியில் மாற்றலாம்" : "Edit opens in the live app")}>
                            {isTamil ? "மாற்றுக" : "Edit"}
                          </button>
                        )}
                        <button type="button" className="btn sm" onClick={() => handleDuplicate(c)}>
                          {isTamil ? "நகலெடு" : "Duplicate"}
                        </button>
                        <button type="button" className="btn sm danger" onClick={() => handleDelete(c)}>
                          {isTamil ? "நீக்குக" : "Delete"}
                        </button>
                      </>
                    )}

                    {c.s === "completed" && (
                      <>
                        <button type="button" className="btn primary" onClick={() => handleViewProgress(c)}>
                          {isTamil ? "முடிவைக் காண்க" : "View result"}
                        </button>
                        <button type="button" className="btn sm" onClick={() => handleDuplicate(c)}>
                          {isTamil ? "நகலெடு" : "Duplicate"}
                        </button>
                        <Link className="btn sm" href="/dashboard/campaigns/new">
                          {isTamil ? "தொடர் செய்தி அனுப்பு" : "Send follow-up"}
                        </Link>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            if (!selectedIds.includes(c.id)) {
                              setSelectedIds((prev) => [...prev, c.id]);
                            }
                            showToast(isTamil ? "இரண்டு பிரச்சாரங்களை ஒப்பிடுவதற்குத் தேர்வு செய்யவும்" : "Tick “Compare” on two campaigns, then press Compare selected");
                          }}
                        >
                          {isTamil ? "ஒப்பிடு" : "Compare"}
                        </button>
                      </>
                    )}

                    {c.s === "drafts" && (
                      <>
                        {c.isLive ? (
                          <Link className="btn primary" href={`/dashboard/campaigns/${c.id}`}>
                            {isTamil ? "அமைப்பைத் தொடரவும்" : "Continue setup"}
                          </Link>
                        ) : (
                          <Link className="btn primary" href="/dashboard/campaigns/new">
                            {isTamil ? "அமைப்பைத் தொடரவும்" : "Continue setup"}
                          </Link>
                        )}
                        <button type="button" className="btn sm" onClick={() => handlePreview(c)}>
                          {isTamil ? "முன்னோட்டம்" : "Preview"}
                        </button>
                        <button type="button" className="btn sm" onClick={() => handleDuplicate(c)}>
                          {isTamil ? "நகலெடு" : "Duplicate"}
                        </button>
                        <button type="button" className="btn sm danger" onClick={() => handleDelete(c)}>
                          {isTamil ? "நீக்குக" : "Delete"}
                        </button>
                      </>
                    )}

                    {c.s !== "drafts" && (
                      <label
                        htmlFor={`cmp-${c.id}`}
                        className="small muted"
                        style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          id={`cmp-${c.id}`}
                          name={`compare-${c.id}`}
                          className="cc"
                          aria-label={isTamil ? `${c.n} ஒப்பிடு` : `Compare ${c.n}`}
                          checked={selectedIds.includes(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                        {isTamil ? "ஒப்பிடு" : "Compare"}
                      </label>
                    )}
                  </div>
                </article>
              );
            })}

            {filteredItems.length === 0 && (
              <section className="card" style={{ padding: "36px 20px", textAlign: "center" }}>
                <h2 style={{ fontSize: 18, marginBottom: 8 }}>
                  {items.length
                    ? isTamil
                      ? "இந்த பிரிவில் பிரச்சாரங்கள் இல்லை"
                      : "No campaigns in this view"
                    : isTamil
                    ? "இன்னும் பிரச்சாரங்கள் உருவாக்கப்படவில்லை"
                    : "No campaigns yet"}
                </h2>
                <p className="muted" style={{ maxWidth: 440, margin: "0 auto 16px" }}>
                  {items.length
                    ? isTamil
                      ? "வேறு பிரிவைத் தேர்வு செய்யவும் அல்லது தேடலை அழிக்கவும்."
                      : "Try switching to another tab or clearing your search."
                    : canManage
                    ? isTamil
                      ? "சலுகைகள், புதிய வரவுகள் அல்லது தள்ளுபடிகளை அறிவிக்க உங்கள் முதல் WhatsApp பிரச்சாரத்தை உருவாக்கவும்."
                      : "Create your first WhatsApp broadcast to announce offers, new arrivals, or discounts."
                    : isTamil
                    ? "உங்கள் கடைக்கு அமைக்கப்பட்ட பிரச்சாரங்கள் இங்கு தோன்றும்."
                    : "Broadcast campaigns set up for your store will appear here."}
                </p>
                {canManage && !items.length && (
                  <Link className="btn primary" href="/dashboard/campaigns/new" style={{ display: "inline-flex", margin: "0 auto" }}>
                    <Plus aria-hidden className="ic" /> {isTamil ? "புதிய பிரச்சாரம்" : "New campaign"}
                  </Link>
                )}
              </section>
            )}
          </div>
        </section>
      ) : (
        /* Automations Tab */
        <section data-panel="auto" suppressHydrationWarning>
          <p className="muted" style={{ marginBottom: 14 }}>
            {isTamil
              ? "இவற்றை ஒருமுறை அமைத்தால் போதும். பிரச்சாரங்கள் இல்லாமலேயே தானாக இயங்கும்."
              : "Set these once. They run on their own, with no campaign to start."}
          </p>
          <div className="card" suppressHydrationWarning>
            <div className="list" id="au" suppressHydrationWarning>
              {automations.map((a, i) => (
                <div key={a.name} className="row" suppressHydrationWarning>
                  <div className="grow">
                    <div className="t">
                      {a.name} <span className="pill mute" style={{ marginLeft: 6 }}>{a.cat}</span>
                    </div>
                    <div className="muted small">{a.desc}</div>
                  </div>
                  {a.val === 2 ? (
                    <span className="pill ok">{isTamil ? "எப்போதும் இயங்கும்" : "Always on"}</span>
                  ) : (
                    <button
                      type="button"
                      className="sw"
                      role="switch"
                      aria-checked={a.val === 1}
                      aria-label={a.name}
                      onClick={() => toggleAutomation(i)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live Reorder & Winback config */}
          {children && <div style={{ marginTop: 16 }}>{children}</div>}
        </section>
      )}

      {/* Progress / Result Modal */}
      {progModal && (
        <dialog
          id="prog"
          open
          role="dialog"
          aria-modal="true"
          aria-labelledby="prog-title"
          style={{ display: "block", position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 100 }}
        >
          <div className="dlg">
            <h2 id="prog-title">{progModal.n}</h2>
            <div className="list">
              <div className="row">
                <div className="grow muted">{isTamil ? "அனுப்பியது" : "Sent"}</div>
                <b>
                  {progModal.sent.toLocaleString("en-IN")} {isTamil ? "மொத்தம்" : "of"} {progModal.cnt.toLocaleString("en-IN")}
                </b>
              </div>
              <div className="row">
                <div className="grow muted">{isTamil ? "படித்தது" : "Read"}</div>
                <b>{Math.round((progModal.sent * progModal.seen) / 100).toLocaleString("en-IN")}</b>
              </div>
              <div className="row">
                <div className="grow muted">{isTamil ? "பதில்கள்" : "Replies"}</div>
                <b>{progModal.rep}</b>
              </div>
              <div className="row">
                <div className="grow muted">{isTamil ? "பணம் வந்த ஆர்டர்கள்" : "Paid orders"}</div>
                <b>{progModal.ord}</b>
              </div>
              <div className="row">
                <div className="grow muted">{isTamil ? "தோல்வியடைந்தது" : "Failed"}</div>
                <b>{progModal.fail || 0}</b>
              </div>
              <div className="row" style={{ borderTop: "2px solid var(--line)" }}>
                <div className="grow t">{isTamil ? "விற்பனை" : "Sales"}</div>
                <b>{R(progModal.sale)}</b>
              </div>
            </div>
            {progModal.sp > 0 && <p className="note small" style={{ marginTop: 12 }}>{sum(progModal, isTamil)}</p>}
            <div className="acts">
              <button type="button" className="btn" onClick={() => setProgModal(null)}>
                {isTamil ? "மூடுக" : "Close"}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Preview Modal */}
      {pvModal && (
        <dialog
          id="pv"
          open
          role="dialog"
          aria-modal="true"
          aria-labelledby="pv-title"
          style={{ display: "block", position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 100 }}
        >
          <div className="dlg">
            <h2 id="pv-title">{isTamil ? "முன்னோட்டம்: " : "Preview: "}{pvModal.n}</h2>
            <div className="phone">
              <div className="bubble">{pvModal.body || `${pvModal.n}! Special offer for your next order today.`}</div>
              {pvModal.buttons && pvModal.buttons.length > 0 && (
                <div className="qr">
                  {pvModal.buttons.map((b) => (
                    <span key={b}>{b}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setPvModal(null)}>
                {isTamil ? "மூடுக" : "Close"}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  showToast(isTamil ? "உங்கள் எண்ணிற்கு சோதனைச் செய்தி அனுப்பப்பட்டது" : "Test message sent to your own number");
                  setPvModal(null);
                }}
              >
                {isTamil ? "எனக்கு சோதனைச் செய்தி அனுப்பு" : "Send me a test"}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* Backdrop for open dialogs */}
      {(progModal || pvModal) && (
        <div
          onClick={() => {
            setProgModal(null);
            setPvModal(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,40,59,.55)",
            zIndex: 90,
          }}
        />
      )}

      {/* Floating Toast Notification */}
      <div className={`toast ${toastMsg ? "on" : ""}`}>{toastMsg}</div>
    </PortalPage>
  );
}
