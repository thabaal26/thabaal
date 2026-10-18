"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Search, Sparkles, Trophy, Users } from "@/components/icons";
import { Stat } from "@/components/ui";
import Link from "@/components/intent-link";
import { safeAction, toastResult } from "@/components/toast";
import type { CustomerRow, Status, Tier } from "@/lib/customers-data";
import { useLanguage } from "@/lib/i18n/context";
import { formatPhone } from "@/lib/phone";
import type { PointEvent } from "@/lib/loyalty-history";
import { adjustLoyaltyPoints, tagCustomers } from "../actions/customers";
import { replyToCustomer } from "../actions/send";
import { inr } from "../portal-format";
import { Chips, Pill, Seg } from "../portal-ui";

const TIER_TONE: Record<Tier, "ok" | "warn" | "mute" | "info"> = { Platinum: "ok", Gold: "warn", Silver: "mute", New: "info", "No orders": "mute" };
const STATUS_TONE: Record<Status, "ok" | "warn" | "bad" | "mute"> = { Active: "ok", Slipping: "warn", Lost: "bad", "—": "mute" };

const TIER_TA: Record<Tier, string> = {
  Platinum: "பிளாட்டினம்",
  Gold: "தங்கம்",
  Silver: "வெள்ளி",
  New: "புதியவர்",
  "No orders": "ஆர்டர்கள் இல்லை",
};

const STATUS_TA: Record<Status, string> = {
  Active: "செயலில்",
  Slipping: "தாமதம்",
  Lost: "வரவில்லை",
  "—": "—",
};

const LISTS: { id: string; label: string; labelTa: string; hint: string; hintTa: string; test: (c: CustomerRow) => boolean }[] = [
  { id: "money", label: "Money waiting", labelTa: "பணம் வர வேண்டியவை", hint: "Unpaid cart or order", hintTa: "கட்டணம் செலுத்தாத கார்ட் அல்லது ஆர்டர்", test: (c) => c.cart > 0 },
  { id: "slip", label: "Slipping away", labelTa: "இடைவெளி எடுத்தவர்கள்", hint: "Late against their own rhythm", hintTa: "வழக்கமான காலத்தை விட தாமதம்", test: (c) => c.status === "Slipping" },
  { id: "lost", label: "Lost", labelTa: "நீண்ட காலம் வராதவர்கள்", hint: "Gone much longer than usual", hintTa: "நீண்ட நாட்களாக வாங்காதவர்கள்", test: (c) => c.status === "Lost" },
  { id: "warm", label: "Chatted, never bought", labelTa: "பேசியவர்கள், வாங்காதவை", hint: "Wrote to you, no order yet", hintTa: "செய்தி அனுப்பியுள்ளனர், ஆர்டர் இல்லை", test: (c) => c.orders === 0 && c.chatted },
  { id: "never", label: "Never ordered", labelTa: "ஆர்டர் செய்யாதவர்கள்", hint: "On your list, no order yet", hintTa: "பட்டியலில் உள்ளோர், ஆர்டர் இல்லை", test: (c) => c.orders === 0 },
  { id: "points", label: "Can use points", labelTa: "புள்ளிகள் பயன்படுத்தலாம்", hint: "Enough points for a discount", hintTa: "தள்ளுபடி பெற போதுமான புள்ளிகள்", test: (c) => c.redeemable > 0 },
];
const TIERS: Tier[] = ["Platinum", "Gold", "Silver", "New", "No orders"];
const STATUSES: Status[] = ["Active", "Slipping", "Lost"];

const lastTxt = (d: number | null, isTa?: boolean) => {
  if (d === null) return isTa ? "இல்லை" : "Never";
  if (d === 0) return isTa ? "இன்று" : "Today";
  if (d === 1) return isTa ? "நேற்று" : "Yesterday";
  return isTa ? `${d} நாட்களுக்கு முன்` : `${d} days ago`;
};

type Sel = { list: string[]; tier: string[]; stat: string[]; area: string[]; prod: string[] };
const EMPTY: Sel = { list: [], tier: [], stat: [], area: [], prod: [] };

/** Customers › All customers: search, filters, select and act on many, one row per customer. */
export function CustomerTable({ rows, canManage }: { rows: CustomerRow[]; canManage: boolean }) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Sel>(EMPTY);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(100);
  const [pending, start] = useTransition();
  const tagRef = useRef<HTMLInputElement>(null);

  const areas = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rows) if (c.area) m.set(c.area, (m.get(c.area) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [rows]);
  const prods = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of rows) for (const p of c.products) m.set(p, (m.get(p) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [rows]);

  const ql = q.trim().toLowerCase();
  const list = rows.filter((c) => {
    if (ql && !`${c.name} ${c.area ?? ""} ${c.phone}`.toLowerCase().includes(ql)) return false;
    if (sel.list.length && !sel.list.every((id) => LISTS.find((l) => l.id === id)!.test(c))) return false;
    if (sel.tier.length && !sel.tier.includes(c.tier)) return false;
    if (sel.stat.length && !sel.stat.includes(c.status)) return false;
    if (sel.area.length && !sel.area.includes(c.area ?? "")) return false;
    if (sel.prod.length && !sel.prod.some((p) => c.products.includes(p))) return false;
    return true;
  });
  const shown = list.slice(0, limit);
  const nSel = sel.list.length + sel.tier.length + sel.stat.length + sel.area.length + sel.prod.length;
  const chosen = list.filter((c) => picked.has(c.id));

  const toggle = (g: keyof Sel, v: string) => setSel((s) => ({ ...s, [g]: s[g].includes(v) ? s[g].filter((x) => x !== v) : [...s[g], v] }));
  const box = (g: keyof Sel, v: string, label: string, n?: number) => (
    <label key={v} className="small" style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", minHeight: 40 }}>
      <input type="checkbox" checked={sel[g].includes(v)} onChange={() => toggle(g, v)} />
      <span style={{ flex: 1 }}>{label}</span>
      {n !== undefined && <span className="muted">{n}</span>}
    </label>
  );
  const csv = (data: CustomerRow[]) => {
    const head = isTamil
      ? ["பெயர்", "தொலைபேசி", "பகுதி", "அடுக்கு", "வாங்கும் முறை", "ஆர்டர்கள்", "கொள்முதல்", "கடைசி ஆர்டர்", "புள்ளிகள்", "குறிச்சொற்கள்"]
      : ["Name", "Phone", "Area", "Tier", "Buying", "Orders", "Spend", "Last order", "Points", "Tags"];
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const body = data.map((c) => [c.name, c.phone, c.area ?? "", c.tier, c.status, c.orders, Math.round(c.spend), lastTxt(c.lastDays, isTamil), c.points, c.tags.join(" ")]);
    const blob = new Blob(["﻿" + [head, ...body].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "customers.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const tag = (then?: (tag: string) => void) => {
    const value = tagRef.current?.value ?? "";
    start(async () => {
      const r = await safeAction(() => tagCustomers(chosen.map((c) => c.id), value));
      toastResult(r);
      if (r.ok && r.tag) {
        router.refresh();
        then?.(r.tag);
      }
    });
  };

  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input
            type="search"
            placeholder={isTamil ? "பெயர், பகுதி அல்லது எண் தேடுக…" : "Search name, area or number"}
            aria-label={isTamil ? "வாடிக்கையாளர் தேடல்" : "Search customers"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <details className="fdd">
          <summary className="btn">
            {isTamil ? "வடிகட்டிகள்" : "Filters"} {nSel > 0 && <span className="pill info">{nSel}</span>}
          </summary>
          <div className="card fpan">
            <h4>{isTamil ? "கவனிக்க வேண்டிய பட்டியல்கள்" : "Lists to work on"}</h4>
            {LISTS.map((l) => box("list", l.id, isTamil ? `${l.labelTa} · ${l.hintTa}` : `${l.label} · ${l.hint}`, rows.filter(l.test).length))}
            <hr />
            <h4>{isTamil ? "லாயல்டி அடுக்கு" : "Tier"}</h4>
            {TIERS.map((t) => box("tier", t, isTamil ? TIER_TA[t] ?? t : t, rows.filter((c) => c.tier === t).length))}
            <hr />
            <h4>{isTamil ? "வாங்கும் முறை" : "How they are buying"}</h4>
            {STATUSES.map((t) => box("stat", t, isTamil ? STATUS_TA[t] ?? t : t, rows.filter((c) => c.status === t).length))}
            {areas.length > 0 && (
              <>
                <hr />
                <h4>{isTamil ? "பகுதி" : "Area"}</h4>
                {areas.map(([a, n]) => box("area", a, a, n))}
              </>
            )}
            {prods.length > 0 && (
              <>
                <hr />
                <h4>{isTamil ? "முன்பு வாங்கியவை" : "Bought before"}</h4>
                {prods.map(([p, n]) => box("prod", p, p, n))}
              </>
            )}
            <div className="tools" style={{ marginTop: 14 }}>
              <button type="button" className="btn sm" onClick={() => setSel(EMPTY)}>
                {isTamil ? "அனைத்தையும் நீக்குக" : "Clear all"}
              </button>
            </div>
          </div>
        </details>
      </div>

      {nSel > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {(Object.keys(sel) as (keyof Sel)[]).flatMap((g) =>
            sel[g].map((v) => {
              let label = v;
              if (g === "list") {
                const found = LISTS.find((l) => l.id === v);
                label = isTamil ? (found?.labelTa ?? v) : (found?.label ?? v);
              } else if (g === "tier" && isTamil) {
                label = TIER_TA[v as Tier] ?? v;
              } else if (g === "stat" && isTamil) {
                label = STATUS_TA[v as Status] ?? v;
              }
              return (
                <button key={`${g}-${v}`} type="button" className="chip" aria-pressed onClick={() => toggle(g, v)}>
                  {label} ×
                </button>
              );
            }),
          )}
          <button type="button" className="btn sm ghost" onClick={() => setSel(EMPTY)}>
            {isTamil ? "அனைத்தையும் நீக்குக" : "Clear all"}
          </button>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="note" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>
            {isTamil
              ? `${chosen.length} வாடிக்கையாளர்கள் தேர்வு செய்யப்பட்டுள்ளனர்`
              : `${chosen.length} customer${chosen.length === 1 ? "" : "s"} selected`}
          </b>
          <div className="tools" style={{ marginLeft: "auto" }}>
            {canManage && (
              <>
                <input
                  ref={tagRef}
                  type="text"
                  placeholder={isTamil ? "குறிச்சொல் (எ.கா: தீபாவளி-சலுகை)" : "Tag, e.g. diwali-offer"}
                  aria-label="Tag for the selected customers"
                  style={{ width: 190 }}
                />
                <button type="button" className="btn sm primary" disabled={pending} onClick={() => tag((t) => router.push(`/dashboard/campaigns/new?tag=${encodeURIComponent(t)}`))}>
                  {isTamil ? "இவர்களுக்கு பிரச்சாரம் தொடங்கு" : "Make a campaign for these"}
                </button>
                <button type="button" className="btn sm" disabled={pending} onClick={() => tag()}>
                  {isTamil ? "குறிச்சொல் சேர்க்க" : "Add a tag"}
                </button>
              </>
            )}
            <button type="button" className="btn sm" onClick={() => csv(chosen)}>
              {isTamil ? "ஏற்றுமதி செய்" : "Export these"}
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>
              {isTamil ? "அழிக்க" : "Clear"}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>
                  <label className="pick">
                    <input
                      type="checkbox"
                      aria-label={isTamil ? "அனைத்தையும் தேர்வு செய்" : "Select all shown"}
                      checked={shown.length > 0 && shown.every((c) => picked.has(c.id))}
                      onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...shown.map((c) => c.id)]) : new Set([...picked].filter((id) => !shown.some((c) => c.id === id))))}
                    />
                  </label>
                </th>
                <th>{isTamil ? "வாடிக்கையாளர்" : "Customer"}</th>
                <th>{isTamil ? "பகுதி" : "Area"}</th>
                <th>{isTamil ? "அடுக்கு" : "Tier"}</th>
                <th>{isTamil ? "வாங்கும் நிலை" : "How they are buying"}</th>
                <th className="num">{isTamil ? "ஆர்டர்கள்" : "Orders"}</th>
                <th className="num">{isTamil ? "கொள்முதல்" : "Spend"}</th>
                <th>{isTamil ? "கடைசி ஆர்டர்" : "Last order"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <label className="pick">
                    <input
                      type="checkbox"
                      aria-label={isTamil ? `${c.name} தேர்வு` : `Select ${c.name}`}
                      checked={picked.has(c.id)}
                      onChange={() =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                    </label>
                  </td>
                  <td>
                    <Link href={`/dashboard/customers/${c.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>
                      {c.name}
                    </Link>
                    <div className="muted small">
                      {formatPhone(c.phone)}
                      {c.cart > 0 && <> · {isTamil ? `கார்ட் ${inr(c.cart)} நிலுவை` : `Cart ${inr(c.cart)} unpaid`}</>}
                      {c.optedOut && <> · {isTamil ? "விலகியவர்" : "opted out"}</>}
                      {c.unreachable && <> · {isTamil ? "செய்தி செல்லவில்லை" : "can't receive"}</>}
                    </div>
                  </td>
                  <td>{c.area ?? <span className="muted">—</span>}</td>
                  <td>
                    <Pill tone={TIER_TONE[c.tier]}>{isTamil ? TIER_TA[c.tier] ?? c.tier : c.tier}</Pill>
                  </td>
                  <td>{c.status === "—" ? <span className="muted">—</span> : <Pill tone={STATUS_TONE[c.status]}>{isTamil ? STATUS_TA[c.status] ?? c.status : c.status}</Pill>}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{inr(c.spend)}</td>
                  <td className="muted">{lastTxt(c.lastDays, isTamil)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <p className="muted" style={{ padding: 16 }}>
            {isTamil ? "பொருத்தமான வாடிக்கையாளர்கள் இல்லை." : "No customers match."}
          </p>
        )}
        {list.length > limit && (
          <div style={{ padding: 12 }}>
            <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setLimit((n) => n + 200)}>
              {isTamil ? `மேலும் காட்டுக (இன்னும் ${list.length - limit})` : `Show more (${list.length - limit} more)`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
/** Customers › Loyalty: give or take back points, everyone's balance, how points work. */
const REASONS: [string, string][] = [
  ["Walk-in purchase", "கடையில் நேரடி வாங்குதல்"],
  ["Referred a friend", "நண்பரைப் பரிந்துரைத்தார்"],
  ["Birthday gift", "பிறந்தநாள் பரிசு"],
  ["Festival bonus", "பண்டிகை போனஸ்"],
  ["Sorry for a problem", "சிரமத்திற்கு வருத்தம்"],
  ["Correcting a mistake", "தவறைத் திருத்துதல்"],
  ["Other", "மற்றவை"],
];
const LOG_FILTERS: { id: string; label: string; ta: string }[] = [
  { id: "all", label: "Everything", ta: "அனைத்தும்" },
  { id: "auto", label: "Given by the rule", ta: "விதிப்படி வழங்கியவை" },
  { id: "hand", label: "Given by hand", ta: "கையால் வழங்கியவை" },
  { id: "used", label: "Used", ta: "பயன்படுத்தியவை" },
  { id: "back", label: "Taken back", ta: "திரும்பப் பெற்றவை" },
];

/** Customers › Loyalty: give or take back points, everyone's balance, how points work, and the history. */
export function LoyaltyPanel({ rows, canManage, history = [] }: { rows: CustomerRow[]; canManage: boolean; history?: PointEvent[] }) {
  const router = useRouter();
  const { isTamil } = useLanguage();
  const members = rows.filter((c) => c.points > 0 || c.orders > 0).sort((a, b) => b.points - a.points);
  const [view, setView] = useState("give");
  const [cid, setCid] = useState(members[0]?.id ?? "");
  const [amt, setAmt] = useState("");
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [pending, start] = useTransition();
  const [why, setWhy] = useState(REASONS[0][0]);
  const [tell, setTell] = useState(true);
  const [logF, setLogF] = useState("all");
  const [logCust, setLogCust] = useState<string | null>(null);
  const c = members.find((m) => m.id === cid) ?? members[0];
  const n = Math.round(Number(amt) || 0);
  const canRedeem = Boolean(c) && n >= 50 && n % 50 === 0 && n <= 500 && n <= (c?.points ?? 0);

  // The WhatsApp line the customer gets: typed, so it goes while their 24-hour window is open.
  const msgFor = (kind: "give" | "take" | "redeem", pts: number, after: number) => {
    const name = c?.name.trim().split(/\s+/)[0] || "there";
    const worthAfter = inr(Math.round(after * 0.5));
    if (isTamil)
      return kind === "give"
        ? `வணக்கம் ${name}! உங்களுக்கு ${pts} புள்ளிகள் கிடைத்துள்ளன. இப்போது உங்கள் இருப்பு ${after} புள்ளிகள், மதிப்பு ${worthAfter}. அடுத்த ஆர்டரில் பயன்படுத்துங்கள்.`
        : kind === "redeem"
          ? `வணக்கம் ${name}! உங்கள் ${pts} புள்ளிகள் மூலம் பில்லில் ${inr(Math.round(pts * 0.5))} தள்ளுபடி. மீதமுள்ள இருப்பு ${after} புள்ளிகள்.`
          : `வணக்கம் ${name}, உங்கள் புள்ளிகளில் ${pts} திருத்தப்பட்டது. இப்போது உங்கள் இருப்பு ${after} புள்ளிகள்.`;
    return kind === "give"
      ? `Hi ${name}! You earned ${pts} points. Your balance is ${after} points, worth ${worthAfter}. Use them on your next order.`
      : kind === "redeem"
        ? `Hi ${name}! You used ${pts} points for ${inr(Math.round(pts * 0.5))} off your bill. Your balance is now ${after} points.`
        : `Hi ${name}, we corrected your loyalty points by ${pts}. Your balance is now ${after} points.`;
  };

  const run = (kind: "give" | "take" | "redeem") =>
    start(async () => {
      if (!c) return;
      const delta = kind === "give" ? n : -n;
      const r = await safeAction(() => adjustLoyaltyPoints(c.id, delta, { kind, reason: kind === "redeem" ? "Walk-in bill" : why }));
      toastResult(r);
      if (!r.ok) return;
      if (tell) {
        const sent = await safeAction(() => replyToCustomer(c.id, msgFor(kind, n, Math.max(0, c.points + delta))));
        toastResult(
          sent.ok
            ? { ok: true, message: isTamil ? "வாடிக்கையாளருக்கு WhatsApp-ல் தெரிவிக்கப்பட்டது." : "Customer told on WhatsApp." }
            : { ok: false, message: `${isTamil ? "புள்ளிகள் சேமிக்கப்பட்டன; WhatsApp-ல் தெரிவிக்க முடியவில்லை: " : "Points saved, but the customer wasn't told on WhatsApp: "}${sent.message}` },
        );
      }
      setAmt("");
      router.refresh();
    });

  const logRows = history.filter((g) => (logF === "all" || g.kind === logF) && (!logCust || g.customerId === logCust));
  const exportLog = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [["When", "Customer", "What happened", "Why", "Points", "By"], ...logRows.map((g) => [new Date(g.at).toLocaleString("en-IN"), g.name, g.what, g.why, g.points, g.by])]
      .map((r) => r.map(esc).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "point-history.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const total = members.reduce((s, m) => s + m.points, 0);
  const worth = members.reduce((s, m) => s + m.pointsWorth, 0);
  const ready = members.filter((m) => m.redeemable > 0);

  const ql = q.trim().toLowerCase();
  const table = members.filter((m) => (f === "all" || (f === "ready" ? m.redeemable > 0 : m.tier === f)) && (!ql || m.name.toLowerCase().includes(ql)));

  return (
    <>
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <Stat
          label={isTamil ? "வாடிக்கையாளர்களிடம் உள்ள புள்ளிகள்" : "Points with customers"}
          value={total.toLocaleString("en-IN")}
          sub={isTamil ? `மதிப்பு சுமார் ${inr(worth)}` : `You owe about ${inr(worth)}`}
          icon={<Sparkles className="size-4 shrink-0" />}
          tone="gold"
        />
        <Stat
          label={isTamil ? "பயன்படுத்தத் தயார்" : "Ready to redeem"}
          value={ready.length}
          sub={isTamil ? "50 அல்லது அதற்கு மேற்பட்ட புள்ளிகள்" : "Have 50 points or more"}
          icon={<CheckCircle2 className="size-4 shrink-0" />}
          tone="brand"
          meter={members.length > 0 ? Math.round((ready.length / members.length) * 100) : 0}
        />
        <Stat
          label={isTamil ? "புள்ளிகள் பெற்றோர்" : "Customers earning"}
          value={members.filter((m) => m.points > 0).length}
          sub={isTamil ? `பட்டியலில் உள்ள ${rows.length} பேரில்` : `Of ${rows.length} on your list`}
          icon={<Users className="size-4 shrink-0" />}
          tone="info"
        />
        <Stat
          label={isTamil ? "அதிகபட்ச புள்ளிகள்" : "Top balance"}
          value={(members[0]?.points ?? 0).toLocaleString("en-IN")}
          sub={members[0]?.name ?? (isTamil ? "யாருமில்லை" : "Nobody yet")}
          icon={<Trophy className="size-4 shrink-0" />}
          tone="violet"
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Seg
          label={isTamil ? "லாயல்டி பார்வை" : "Loyalty view"}
          value={view}
          onChange={setView}
          options={[
            { id: "give", label: isTamil ? "புள்ளிகள் வழங்க" : "Give points" },
            { id: "cust", label: isTamil ? "வாடிக்கையாளர் புள்ளிகள்" : "Customer points" },
            { id: "set", label: isTamil ? "புள்ளிகள் முறை" : "How points work" },
            { id: "log", label: isTamil ? "புள்ளி வரலாறு" : "Point history" },
          ]}
        />
      </div>

      {view === "give" && (
        <div className="grid split">
          <div className="card">
            <div className="hd">
              <div>
                <h2>{isTamil ? "புள்ளிகள் வழங்க அல்லது குறைக்க" : "Give or take back points"}</h2>
                <p>
                  {isTamil
                    ? "நேரடி விற்பனை, பரிந்துரை அல்லது கணக்கில் வராதவற்றுக்கு."
                    : "For a walk-in sale, a referral, a complaint, or anything the app did not count."}
                </p>
              </div>
            </div>
            {c ? (
              <>
                <div className="field">
                  <label htmlFor="lc">{isTamil ? "வாடிக்கையாளர்" : "Customer"}</label>
                  <select id="lc" value={c.id} onChange={(e) => setCid(e.target.value)}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {isTamil ? (TIER_TA[m.tier] ?? m.tier) : m.tier} · {m.points} {isTamil ? "புள்ளிகள்" : "points"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ margin: "10px 0" }}>
                  <div className="grow">{isTamil ? "தற்போதைய புள்ளிகள்" : "Points now"}</div>
                  <b style={{ font: "600 20px var(--display)" }}>
                    {c.points} {isTamil ? "புள்ளிகள்" : "points"} · {isTamil ? "மதிப்பு" : "worth"} {inr(c.pointsWorth)}
                  </b>
                </div>
                <Chips
                  label={isTamil ? "விரைவுத் தொகைகள்" : "Quick amounts"}
                  value={String(n)}
                  onChange={(v) => {
                    if (v === "ref") {
                      setAmt("100");
                      setWhy("Referred a friend");
                    } else setAmt(v);
                  }}
                  options={[...[25, 50, 100, 200].map((v) => ({ id: String(v), label: `+${v}` })), { id: "ref", label: isTamil ? "பரிந்துரை 100" : "Referral 100" }]}
                  style={{ marginBottom: 12 }}
                />
                <div className="formgrid">
                  <div className="field">
                    <label htmlFor="lamt">{isTamil ? "புள்ளிகள்" : "Points"}</label>
                    <input id="lamt" type="number" min={1} placeholder="50" value={amt} onChange={(e) => setAmt(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="lwhy">{isTamil ? "ஏன்?" : "Why?"}</label>
                    <select id="lwhy" value={why} onChange={(e) => setWhy(e.target.value)}>
                      {REASONS.map(([en, ta]) => (
                        <option key={en} value={en}>
                          {isTamil ? ta : en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0", minHeight: 40, cursor: "pointer" }}>
                  <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
                  {isTamil ? "வாடிக்கையாளருக்கு WhatsApp-ல் தெரிவிக்கவும்" : "Tell the customer on WhatsApp"}
                </label>
                <div className="tools" style={{ marginTop: 4 }}>
                  <button type="button" className="btn primary" disabled={!canManage || pending || n <= 0} onClick={() => run("give")}>
                    {isTamil ? "புள்ளிகள் வழங்க" : "Give points"}
                  </button>
                  <button type="button" className="btn" disabled={!canManage || pending || n <= 0 || n > c.points} onClick={() => run("take")}>
                    {isTamil ? "புள்ளிகள் குறைக்க" : "Take back"}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={!canManage || pending || !canRedeem}
                    title={isTamil ? "50 புள்ளிகள் படிகளில், அதிகபட்சம் 500 (₹250)" : "In steps of 50 points (₹25), up to 500 points (₹250)"}
                    onClick={() => run("redeem")}
                  >
                    {isTamil ? "பில்லுக்குப் பயன்படுத்து" : "Redeem for a bill"}
                  </button>
                </div>
                {n > 0 && !canRedeem && n <= c.points && (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {isTamil ? "பில்லுக்குப் பயன்படுத்த: 50 புள்ளிகள் படிகளில், அதிகபட்சம் 500 புள்ளிகள் (₹250)." : "To use points on a bill: steps of 50 points (₹25), up to 500 points (₹250)."}
                  </p>
                )}
                {!canManage && (
                  <p className="muted small" style={{ marginTop: 8 }}>
                    {isTamil ? "புள்ளிகளை மாற்ற நிர்வாகியிடம் கேட்கவும்." : "Ask your admin to change points."}
                  </p>
                )}
              </>
            ) : (
              <p className="muted">
                {isTamil ? "ஆர்டர்கள் செய்தவுடன் வாடிக்கையாளர்கள் இங்கு தோன்றுவர்." : "Customers appear here once they have orders."}
              </p>
            )}
          </div>
          <div className="stack">
            {c && (
              <div className="card">
                <h2 style={{ marginBottom: 8 }}>{isTamil ? "வாடிக்கையாளருக்குக் கிடைப்பது" : "What the customer gets"}</h2>
                <div className="phone">
                  <div className="bubble">{msgFor("give", n || 50, c.points + (n || 50))}</div>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  {isTamil
                    ? "“WhatsApp-ல் தெரிவிக்கவும்” தேர்வு செய்தால், வாடிக்கையாளரின் 24 மணி நேர சாளரம் திறந்திருக்கும் போது இது அனுப்பப்படும்."
                    : "Sent when “Tell the customer” is ticked, while the customer's 24-hour WhatsApp window is open."}
                </p>
              </div>
            )}
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>{isTamil ? "பயன்படுத்தத் தயார்" : "Ready to redeem"}</h2>
              <p className="muted small" style={{ marginBottom: 10 }}>
                {isTamil
                  ? "அடுத்த ஆர்டரில் தள்ளுபடி பெற போதுமான புள்ளிகள் உள்ள வாடிக்கையாளர்கள்."
                  : "These customers have enough points to use on their next order."}
              </p>
              <div className="list">
                {ready.slice(0, 8).map((m) => (
                  <div key={m.id} className="row">
                    <div className="grow">
                      <div className="t">{m.name}</div>
                      <div className="muted small">
                        {m.points} {isTamil ? "புள்ளிகள்" : "points"} · {isTamil ? `${inr(m.redeemable)} தள்ளுபடி பெறலாம்` : `can take ${inr(m.redeemable)} off`}
                      </div>
                    </div>
                    <Link className="btn sm" href={`/dashboard/replies?r=${m.id}`}>
                      {isTamil ? "நினைவூட்டு" : "Remind"}
                    </Link>
                  </div>
                ))}
                {ready.length === 0 && <p className="muted small">{isTamil ? "யாருமில்லை." : "Nobody yet."}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "cust" && (
        <>
          <div className="toolbar">
            <div className="search">
              <Search aria-hidden />
              <input
                type="search"
                placeholder={isTamil ? "வாடிக்கையாளரைத் தேடுக…" : "Search customer"}
                aria-label={isTamil ? "வாடிக்கையாளர் தேடல்" : "Search customers"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Chips
              label={isTamil ? "காட்டுக" : "Show"}
              value={f}
              onChange={setF}
              options={[
                { id: "all", label: isTamil ? "அனைத்தும்" : "All" },
                { id: "ready", label: isTamil ? "பயன்படுத்தத் தயார்" : "Ready to redeem" },
                { id: "Platinum", label: isTamil ? "பிளாட்டினம்" : "Platinum" },
                { id: "Gold", label: isTamil ? "தங்கம்" : "Gold" },
                { id: "Silver", label: isTamil ? "வெள்ளி" : "Silver" },
              ]}
            />
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>{isTamil ? "வாடிக்கையாளர்" : "Customer"}</th>
                    <th>{isTamil ? "அடுக்கு" : "Tier"}</th>
                    <th className="num">{isTamil ? "ஆர்டர்கள்" : "Orders"}</th>
                    <th className="num">{isTamil ? "கொள்முதல்" : "Spend"}</th>
                    <th className="num">{isTamil ? "புள்ளிகள்" : "Points"}</th>
                    <th className="num">{isTamil ? "மதிப்பு" : "Worth"}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {table.slice(0, 300).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <b>{m.name}</b>
                      </td>
                      <td>
                        <Pill tone={TIER_TONE[m.tier]}>{isTamil ? TIER_TA[m.tier] ?? m.tier : m.tier}</Pill>
                      </td>
                      <td className="num">{m.orders}</td>
                      <td className="num">{inr(m.spend)}</td>
                      <td className="num">{m.points}</td>
                      <td className="num">{inr(m.pointsWorth)}</td>
                      <td>
                        <div className="tools" style={{ flexWrap: "nowrap" }}>
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => {
                              setCid(m.id);
                              setView("give");
                            }}
                          >
                            {isTamil ? "மாற்றுக" : "Edit"}
                          </button>
                          <button
                            type="button"
                            className="btn sm ghost"
                            onClick={() => {
                              setLogCust(m.id);
                              setLogF("all");
                              setView("log");
                            }}
                          >
                            {isTamil ? "வரலாறு" : "History"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>
                {isTamil ? "பொருத்தமான வாடிக்கையாளர்கள் இல்லை." : "No customers match."}
              </p>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            {isTamil
              ? "ஆர்டர்களிலிருந்து தானாகவே புள்ளிகள் சேரும். இருப்பை திருத்த அல்லது போனஸ் வழங்க மட்டும் மாற்றுக என்பதைப் பயன்படுத்தவும்."
              : "Points come from orders automatically. Use Edit only to correct a balance or add a bonus."}
          </p>
        </>
      )}

      {view === "set" && (
        <div className="card">
          <div className="hd">
            <div>
              <h2>{isTamil ? "புள்ளிகள் செயல்படும் விதம்" : "How points work"}</h2>
              <p>{isTamil ? "ஒவ்வொரு ஆர்டரிலும் புள்ளிகள், பில்லில் தள்ளுபடி. அனைவருக்கும் ஒரே விதி." : "Earn on every order, save on the next bill. The same rules for everyone."}</p>
            </div>
          </div>
          <div className="list">
            <div className="row">
              <div className="grow">{isTamil ? "புள்ளிகள் பெற" : "Earn"}</div>
              <b>{isTamil ? "உறுதியான அல்லது பணம் செலுத்திய ஒவ்வொரு ₹100-க்கும் 1 புள்ளி" : "1 point for every ₹100 of confirmed or paid orders"}</b>
            </div>
            <div className="row">
              <div className="grow">{isTamil ? "மீண்டும் வாங்கினால்" : "Coming back"}</div>
              <b>{isTamil ? "முதல் ஆர்டருக்குப் பிறகு வரும் ஒவ்வொரு மறு ஆர்டருக்கும் +50 புள்ளிகள்" : "+50 points for every repeat order after the first"}</b>
            </div>
            <div className="row">
              <div className="grow">{isTamil ? "மதிப்பு" : "Worth"}</div>
              <b>{isTamil ? "100 புள்ளிகள் = ₹50 தள்ளுபடி" : "100 points = ₹50 off"}</b>
            </div>
            <div className="row">
              <div className="grow">{isTamil ? "பயன்படுத்துதல்" : "Using points"}</div>
              <b>{isTamil ? "50 புள்ளிகள் முதல், ₹25 படிகளில், ஒரு ஆர்டருக்கு அதிகபட்சம் ₹250 வரை" : "From 50 points, in ₹25 steps, up to ₹250 off one order"}</b>
            </div>
            <div className="row">
              <div className="grow">{isTamil ? "ரத்து செய்யப்பட்ட ஆர்டர்கள்" : "Cancelled orders"}</div>
              <b>{isTamil ? "பயன்படுத்திய புள்ளிகள் மீண்டும் வழங்கப்படும்" : "Give their points back"}</b>
            </div>
          </div>
          <p className="note small" style={{ marginTop: 12 }}>
            {isTamil
              ? "கட்டண அமைப்புகளில் தானியங்கிப் பயன்பாட்டை இயக்கலாம். ஒவ்வொரு ஆர்டரிலும் தள்ளுபடியை சேர்க்கவோ நீக்கவோ முடியும்."
              : "Turn on automatic use at checkout in Payments › Payment settings. On each order, the points control lets you apply or remove a discount."}
          </p>
        </div>
      )}

      {view === "log" && (
        <>
          <div className="toolbar">
            <Chips label={isTamil ? "காட்டுக" : "Show"} value={logF} onChange={setLogF} options={LOG_FILTERS.map((x) => ({ id: x.id, label: isTamil ? x.ta : x.label }))} />
            {logCust && (
              <button type="button" className="chip" aria-pressed onClick={() => setLogCust(null)}>
                {rows.find((r) => r.id === logCust)?.name ?? ""} ✕
              </button>
            )}
            <button type="button" className="btn sm" style={{ marginLeft: "auto" }} disabled={!logRows.length} onClick={exportLog}>
              {isTamil ? "CSV பதிவிறக்கு" : "Export CSV"}
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>{isTamil ? "எப்போது" : "When"}</th>
                    <th>{isTamil ? "வாடிக்கையாளர்" : "Customer"}</th>
                    <th>{isTamil ? "என்ன நடந்தது" : "What happened"}</th>
                    <th>{isTamil ? "ஏன்" : "Why"}</th>
                    <th className="num">{isTamil ? "புள்ளிகள்" : "Points"}</th>
                    <th>{isTamil ? "யார்" : "By"}</th>
                  </tr>
                </thead>
                <tbody>
                  {logRows.slice(0, 300).map((g) => (
                    <tr key={g.id}>
                      <td className="muted">{new Date(g.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td>
                        <b>{g.name}</b>
                      </td>
                      <td>{g.what}</td>
                      <td className="muted">{g.why}</td>
                      <td className="num">
                        <b style={{ color: g.points < 0 ? "var(--bad, #c0392b)" : "var(--ok)" }}>
                          {g.points > 0 ? "+" : ""}
                          {g.points}
                        </b>
                      </td>
                      <td className="muted">{g.by === "Automatic" && isTamil ? "தானியங்கி" : g.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logRows.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>
                {isTamil ? "இன்னும் எதுவும் இல்லை." : "Nothing here yet."}
              </p>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            {isTamil
              ? "ஆர்டர்களில் பெற்ற மற்றும் பயன்படுத்திய புள்ளிகள், கையால் செய்த மாற்றங்கள் அனைத்தும் இங்கே காரணத்துடன் உள்ளன."
              : "Points earned and used on orders, and every change made by hand with its reason and who made it."}
          </p>
        </>
      )}
    </>
  );
}
