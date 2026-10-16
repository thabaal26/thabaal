"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons";
import Link from "@/components/intent-link";
import { toastResult } from "@/components/toast";
import type { CustomerRow, Status, Tier } from "@/lib/customers-data";
import { adjustLoyaltyPoints, tagCustomers } from "../actions/customers";
import { inr } from "../portal-format";
import { Chips, Pill, Seg } from "../portal-ui";

const TIER_TONE: Record<Tier, "ok" | "warn" | "mute" | "info"> = { Platinum: "ok", Gold: "warn", Silver: "mute", New: "info", "No orders": "mute" };
const STATUS_TONE: Record<Status, "ok" | "warn" | "bad" | "mute"> = { Active: "ok", Slipping: "warn", Lost: "bad", "—": "mute" };

const LISTS: { id: string; label: string; hint: string; test: (c: CustomerRow) => boolean }[] = [
  { id: "money", label: "Money waiting", hint: "Unpaid cart or order", test: (c) => c.cart > 0 },
  { id: "slip", label: "Slipping away", hint: "Late against their own rhythm", test: (c) => c.status === "Slipping" },
  { id: "lost", label: "Lost", hint: "Gone much longer than usual", test: (c) => c.status === "Lost" },
  { id: "warm", label: "Chatted, never bought", hint: "Wrote to you, no order yet", test: (c) => c.orders === 0 && c.chatted },
  { id: "never", label: "Never ordered", hint: "On your list, no order yet", test: (c) => c.orders === 0 },
  { id: "points", label: "Can use points", hint: "Enough points for a discount", test: (c) => c.redeemable > 0 },
];
const TIERS: Tier[] = ["Platinum", "Gold", "Silver", "New", "No orders"];
const STATUSES: Status[] = ["Active", "Slipping", "Lost"];

const lastTxt = (d: number | null) => (d === null ? "Never" : d === 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`);

type Sel = { list: string[]; tier: string[]; stat: string[]; area: string[]; prod: string[] };
const EMPTY: Sel = { list: [], tier: [], stat: [], area: [], prod: [] };

/** Customers › All customers: search, filters, select and act on many, one row per customer. */
export function CustomerTable({ rows, canManage }: { rows: CustomerRow[]; canManage: boolean }) {
  const router = useRouter();
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
    <label key={v} className="small" style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
      <input type="checkbox" checked={sel[g].includes(v)} onChange={() => toggle(g, v)} />
      <span style={{ flex: 1 }}>{label}</span>
      {n !== undefined && <span className="muted">{n}</span>}
    </label>
  );
  const csv = (data: CustomerRow[]) => {
    const head = ["Name", "Phone", "Area", "Tier", "Buying", "Orders", "Spend", "Last order", "Points", "Tags"];
    const esc = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const body = data.map((c) => [c.name, c.phone, c.area ?? "", c.tier, c.status, c.orders, Math.round(c.spend), lastTxt(c.lastDays), c.points, c.tags.join(" ")]);
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
      const r = await tagCustomers(chosen.map((c) => c.id), value);
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
          <input type="search" placeholder="Search name, area or number" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <details className="fdd">
          <summary className="btn">
            Filters {nSel > 0 && <span className="pill info">{nSel}</span>}
          </summary>
          <div className="card fpan">
            <h4>Lists to work on</h4>
            {LISTS.map((l) => box("list", l.id, `${l.label} · ${l.hint}`, rows.filter(l.test).length))}
            <hr />
            <h4>Tier</h4>
            {TIERS.map((t) => box("tier", t, t, rows.filter((c) => c.tier === t).length))}
            <hr />
            <h4>How they are buying</h4>
            {STATUSES.map((t) => box("stat", t, t, rows.filter((c) => c.status === t).length))}
            {areas.length > 0 && (
              <>
                <hr />
                <h4>Area</h4>
                {areas.map(([a, n]) => box("area", a, a, n))}
              </>
            )}
            {prods.length > 0 && (
              <>
                <hr />
                <h4>Bought before</h4>
                {prods.map(([p, n]) => box("prod", p, p, n))}
              </>
            )}
            <div className="tools" style={{ marginTop: 14 }}>
              <button type="button" className="btn sm" onClick={() => setSel(EMPTY)}>
                Clear all
              </button>
            </div>
          </div>
        </details>
      </div>

      {nSel > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {(Object.keys(sel) as (keyof Sel)[]).flatMap((g) =>
            sel[g].map((v) => (
              <button key={`${g}-${v}`} type="button" className="chip" aria-pressed onClick={() => toggle(g, v)}>
                {g === "list" ? LISTS.find((l) => l.id === v)?.label : v} ×
              </button>
            )),
          )}
          <button type="button" className="btn sm ghost" onClick={() => setSel(EMPTY)}>
            Clear all
          </button>
        </div>
      )}

      {chosen.length > 0 && (
        <div className="note" style={{ marginBottom: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>
            {chosen.length} customer{chosen.length === 1 ? "" : "s"} selected
          </b>
          <div className="tools" style={{ marginLeft: "auto" }}>
            {canManage && (
              <>
                <input ref={tagRef} type="text" placeholder="Tag, e.g. diwali-offer" aria-label="Tag for the selected customers" style={{ width: 190 }} />
                <button type="button" className="btn sm primary" disabled={pending} onClick={() => tag((t) => router.push(`/dashboard/campaigns/new?tag=${encodeURIComponent(t)}`))}>
                  Make a campaign for these
                </button>
                <button type="button" className="btn sm" disabled={pending} onClick={() => tag()}>
                  Add a tag
                </button>
              </>
            )}
            <button type="button" className="btn sm" onClick={() => csv(chosen)}>
              Export these
            </button>
            <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>
              Clear
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
                  <input
                    type="checkbox"
                    aria-label="Select all shown"
                    checked={shown.length > 0 && shown.every((c) => picked.has(c.id))}
                    onChange={(e) => setPicked(e.target.checked ? new Set([...picked, ...shown.map((c) => c.id)]) : new Set([...picked].filter((id) => !shown.some((c) => c.id === id))))}
                  />
                </th>
                <th>Customer</th>
                <th>Area</th>
                <th>Tier</th>
                <th>How they are buying</th>
                <th className="num">Orders</th>
                <th className="num">Spend</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${c.name}`}
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
                  </td>
                  <td>
                    <Link href={`/dashboard/customers/${c.id}`} style={{ fontWeight: 700, textDecoration: "none" }}>
                      {c.name}
                    </Link>
                    <div className="muted small">
                      {c.phone}
                      {c.cart > 0 && <> · Cart {inr(c.cart)} unpaid</>}
                      {c.optedOut && <> · opted out</>}
                      {c.unreachable && <> · can&apos;t receive</>}
                    </div>
                  </td>
                  <td>{c.area ?? <span className="muted">—</span>}</td>
                  <td>
                    <Pill tone={TIER_TONE[c.tier]}>{c.tier}</Pill>
                  </td>
                  <td>{c.status === "—" ? <span className="muted">—</span> : <Pill tone={STATUS_TONE[c.status]}>{c.status}</Pill>}</td>
                  <td className="num">{c.orders}</td>
                  <td className="num">{inr(c.spend)}</td>
                  <td className="muted">{lastTxt(c.lastDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.length === 0 && (
          <p className="muted" style={{ padding: 16 }}>
            No customers match.
          </p>
        )}
        {list.length > limit && (
          <div style={{ padding: 12 }}>
            <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setLimit((n) => n + 200)}>
              Show more ({list.length - limit} more)
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Customers › Loyalty: give or take back points, everyone's balance, how points work. */
export function LoyaltyPanel({ rows, canManage }: { rows: CustomerRow[]; canManage: boolean }) {
  const router = useRouter();
  const members = rows.filter((c) => c.points > 0 || c.orders > 0).sort((a, b) => b.points - a.points);
  const [view, setView] = useState("give");
  const [cid, setCid] = useState(members[0]?.id ?? "");
  const [amt, setAmt] = useState("");
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [pending, start] = useTransition();
  const c = members.find((m) => m.id === cid) ?? members[0];
  const n = Math.round(Number(amt) || 0);

  const run = (delta: number) =>
    start(async () => {
      if (!c) return;
      const r = await adjustLoyaltyPoints(c.id, delta);
      toastResult(r);
      if (r.ok) {
        setAmt("");
        router.refresh();
      }
    });

  const total = members.reduce((s, m) => s + m.points, 0);
  const worth = members.reduce((s, m) => s + m.pointsWorth, 0);
  const ready = members.filter((m) => m.redeemable > 0);

  const ql = q.trim().toLowerCase();
  const table = members.filter((m) => (f === "all" || (f === "ready" ? m.redeemable > 0 : m.tier === f)) && (!ql || m.name.toLowerCase().includes(ql)));

  return (
    <>
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="l">Points with customers</div>
          <div className="v">{total.toLocaleString("en-IN")}</div>
          <div className="d muted">You owe about {inr(worth)}</div>
        </div>
        <div className="card stat">
          <div className="l">Ready to redeem</div>
          <div className="v">{ready.length}</div>
          <div className="d muted">Have 50 points or more</div>
        </div>
        <div className="card stat">
          <div className="l">Customers earning</div>
          <div className="v">{members.filter((m) => m.points > 0).length}</div>
          <div className="d muted">Of {rows.length} on your list</div>
        </div>
        <div className="card stat">
          <div className="l">Top balance</div>
          <div className="v">{(members[0]?.points ?? 0).toLocaleString("en-IN")}</div>
          <div className="d muted">{members[0]?.name ?? "Nobody yet"}</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Seg
          label="Loyalty view"
          value={view}
          onChange={setView}
          options={[
            { id: "give", label: "Give points" },
            { id: "cust", label: "Customer points" },
            { id: "set", label: "How points work" },
          ]}
        />
      </div>

      {view === "give" && (
        <div className="grid split">
          <div className="card">
            <div className="hd">
              <div>
                <h2>Give or take back points</h2>
                <p>For a walk-in sale, a referral, a complaint, or anything the app did not count.</p>
              </div>
            </div>
            {c ? (
              <>
                <div className="field">
                  <label htmlFor="lc">Customer</label>
                  <select id="lc" value={c.id} onChange={(e) => setCid(e.target.value)}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.tier} · {m.points} points
                      </option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ margin: "10px 0" }}>
                  <div className="grow">Points now</div>
                  <b style={{ font: "600 20px var(--display)" }}>
                    {c.points} points · worth {inr(c.pointsWorth)}
                  </b>
                </div>
                <Chips label="Quick amounts" value={String(n)} onChange={setAmt} options={[25, 50, 100, 200].map((v) => ({ id: String(v), label: `+${v}` }))} style={{ marginBottom: 12 }} />
                <div className="field">
                  <label htmlFor="lamt">Points</label>
                  <input id="lamt" type="number" min={1} placeholder="50" value={amt} onChange={(e) => setAmt(e.target.value)} />
                </div>
                <div className="tools" style={{ marginTop: 12 }}>
                  <button type="button" className="btn primary" disabled={!canManage || pending || n <= 0} onClick={() => run(n)}>
                    Give points
                  </button>
                  <button type="button" className="btn" disabled={!canManage || pending || n <= 0 || n > c.points} onClick={() => run(-n)}>
                    Take back
                  </button>
                  <Link className="btn sm ghost" href={`/dashboard/replies?r=${c.id}`}>
                    Tell them in chat
                  </Link>
                </div>
                {!canManage && <p className="muted small" style={{ marginTop: 8 }}>Ask your admin to change points.</p>}
              </>
            ) : (
              <p className="muted">Customers appear here once they have orders.</p>
            )}
          </div>
          <div className="stack">
            {c && (
              <div className="card">
                <h2 style={{ marginBottom: 8 }}>What to tell the customer</h2>
                <div className="phone">
                  <div className="bubble">
                    Hi {c.name.split(" ")[0]}! {n > 0 ? `You earned ${n} bonus points. ` : ""}Your balance is {c.points + (n > 0 ? n : 0)} points
                    {c.redeemable > 0 ? `, and you can take ${inr(c.redeemable)} off your next order` : ""}. Thank you!
                  </div>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  Points changes are saved here; they aren&apos;t messaged automatically. Send this from the chat if you like.
                </p>
              </div>
            )}
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>Ready to redeem</h2>
              <p className="muted small" style={{ marginBottom: 10 }}>
                These customers have enough points to use on their next order.
              </p>
              <div className="list">
                {ready.slice(0, 8).map((m) => (
                  <div key={m.id} className="row">
                    <div className="grow">
                      <div className="t">{m.name}</div>
                      <div className="muted small">
                        {m.points} points · can take {inr(m.redeemable)} off
                      </div>
                    </div>
                    <Link className="btn sm" href={`/dashboard/replies?r=${m.id}`}>
                      Remind
                    </Link>
                  </div>
                ))}
                {ready.length === 0 && <p className="muted small">Nobody yet.</p>}
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
              <input type="search" placeholder="Search customer" aria-label="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Chips
              label="Show"
              value={f}
              onChange={setF}
              options={[
                { id: "all", label: "All" },
                { id: "ready", label: "Ready to redeem" },
                { id: "Platinum", label: "Platinum" },
                { id: "Gold", label: "Gold" },
                { id: "Silver", label: "Silver" },
              ]}
            />
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Tier</th>
                    <th className="num">Orders</th>
                    <th className="num">Spend</th>
                    <th className="num">Points</th>
                    <th className="num">Worth</th>
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
                        <Pill tone={TIER_TONE[m.tier]}>{m.tier}</Pill>
                      </td>
                      <td className="num">{m.orders}</td>
                      <td className="num">{inr(m.spend)}</td>
                      <td className="num">{m.points}</td>
                      <td className="num">{inr(m.pointsWorth)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => {
                            setCid(m.id);
                            setView("give");
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {table.length === 0 && (
              <p className="muted" style={{ padding: 16 }}>
                No customers match.
              </p>
            )}
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Points come from orders automatically. Use <b>Edit</b> only to correct a balance or add a bonus.
          </p>
        </>
      )}

      {view === "set" && (
        <div className="card">
          <div className="hd">
            <div>
              <h2>How points work</h2>
              <p>The rule thabaal uses for every customer, in plain words.</p>
            </div>
          </div>
          <div className="list">
            <div className="row">
              <div className="grow">Earn</div>
              <b>1 point for every ₹100 of confirmed or paid orders</b>
            </div>
            <div className="row">
              <div className="grow">Coming back</div>
              <b>+50 points for every repeat order after the first</b>
            </div>
            <div className="row">
              <div className="grow">Worth</div>
              <b>100 points = ₹50 off</b>
            </div>
            <div className="row">
              <div className="grow">Using points</div>
              <b>From 50 points, in ₹25 steps, up to ₹250 off one order</b>
            </div>
            <div className="row">
              <div className="grow">Cancelled orders</div>
              <b>Give their points back</b>
            </div>
          </div>
          <p className="note small" style={{ marginTop: 12 }}>
            Turn on automatic use at checkout in Payments › Payment settings. On each order, the points control lets you apply or remove a discount.
          </p>
        </div>
      )}
    </>
  );
}
