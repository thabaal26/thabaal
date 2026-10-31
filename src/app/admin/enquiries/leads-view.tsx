"use client";

// Admin panel › Enquiries: Follow up today, the pipeline board and the list, with their filters (admin design).
// The rows come from the server (page.tsx); filtering happens here.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { daysTo, isOpenStage, LEAD_SOURCES, LEAD_STAGES, stageName } from "@/lib/lead-stages";
import { Tabs } from "../nav";

export type LeadRow = {
  id: string;
  shop: string;
  person: string | null;
  town: string | null;
  phone: string;
  sells: string | null;
  source: string;
  plan: string | null;
  planName: string | null;
  stage: string;
  nextOn: string | null;
  came: string;
  ownerId: string | null;
  ownerName: string | null;
  note: string | null;
  clientName: string | null;
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const who = (l: LeadRow) => [l.person, l.town].filter(Boolean).join(" · ");
const dueText = (d: number) => (d < 0 ? `${-d}d late` : d === 0 ? "today" : `in ${d}d`);

export function LeadsView({ leads, team, today, insights, addButton }: { leads: LeadRow[]; team: { id: string; name: string }[]; today: string; insights: ReactNode; addButton: ReactNode }) {
  const [own, setOwn] = useState("all");
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("");
  const [plan, setPlan] = useState("");

  const due = leads
    .filter((l) => isOpenStage(l.stage) && l.nextOn && (daysTo(l.nextOn, today) ?? 1) <= 0)
    .filter((l) => own === "all" || l.ownerId === own)
    .sort((a, b) => (a.nextOn ?? "").localeCompare(b.nextOn ?? ""));
  const match = (l: LeadRow) => {
    if (src && l.source !== src) return false;
    if (plan && l.plan !== plan) return false;
    if (q && ![l.shop, l.person, l.town, l.sells, l.phone].join(" ").toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  };
  const shown = leads.filter(match);

  const filters = (
    <div className="filters">
      <input className="q" type="search" placeholder="Search shop, owner, town or phone" aria-label="Search enquiries" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Where from" value={src} onChange={(e) => setSrc(e.target.value)}>
        <option value="">All sources</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select aria-label="Plan they asked about" value={plan} onChange={(e) => setPlan(e.target.value)}>
        <option value="">Any plan they asked about</option>
        <option value="starter">Starter</option>
        <option value="growth">Growth</option>
        <option value="business">Business</option>
      </select>
      {addButton}
    </div>
  );

  return (
    <>
      <div className="card mb16" style={{ borderLeft: `6px solid ${due.length ? "var(--bad)" : "var(--ok)"}` }}>
        <div className="hd" style={{ marginBottom: 6 }}>
          <div>
            <h2 style={{ fontSize: 19 }}>{due.length ? `Follow up today · ${due.length}` : "Nothing waiting today"}</h2>
            <p>Nobody buys after one message. These are waiting on you.</p>
          </div>
          {team.length > 1 && (
            <div className="seg" role="group" aria-label="Who follows up">
              {[{ id: "all", name: "Everyone" }, ...team].map((t) => (
                <button key={t.id} type="button" aria-pressed={own === t.id} onClick={() => setOwn(t.id)}>
                  {t.id === "all" ? t.name : t.name.split(" ")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
        {due.length ? (
          <div className="list">
            {due.map((l) => {
              const d = daysTo(l.nextOn, today) ?? 0;
              return (
                <div className="row" key={l.id}>
                  <span className="dot" style={{ background: d < 0 ? "var(--bad)" : "var(--bar2)" }} />
                  <div className="grow">
                    <div className="t">
                      {l.shop} {who(l) && <span className="muted small">· {who(l)}</span>}
                    </div>
                    <div className="muted small">
                      {stageName(l.stage)} · {d < 0 ? `${-d} day${d === -1 ? "" : "s"} late` : "due today"}
                      {l.note ? ` · ${l.note.slice(0, 90)}` : ""}
                    </div>
                  </div>
                  <a className="btn sm" href={`https://wa.me/91${l.phone}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                  <Link className="btn sm primary" href={`/admin/enquiries/${l.id}`}>
                    Open
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">{leads.length ? "Everyone has been followed up. Good place to be." : "No enquiries yet. Add the first one with “Add an enquiry”."}</p>
        )}
      </div>

      <Tabs
        tabs={[
          {
            id: "board",
            label: "Pipeline",
            panel: (
              <>
                {filters}
                <div className="board">
                  {LEAD_STAGES.map((s) => {
                    const col = shown.filter((l) => l.stage === s.k);
                    return (
                      <div className="col" key={s.k}>
                        <h3>
                          <span className="dot" style={{ background: s.color }} />
                          {s.n}
                          <b>{col.length}</b>
                        </h3>
                        {col.length ? (
                          col.map((l) => {
                            const d = isOpenStage(l.stage) ? daysTo(l.nextOn, today) : null;
                            return (
                              <Link className="lead" key={l.id} href={`/admin/enquiries/${l.id}`}>
                                <div className="n">{l.shop}</div>
                                {who(l) && <div className="m">{who(l)}</div>}
                                {l.sells && <div className="m">{l.sells}</div>}
                                <div className="f">
                                  {l.planName && <span className="pill">{l.planName}</span>}
                                  {d !== null && <span className={`due ${d < 0 ? "late" : d === 0 ? "today" : ""}`}>{dueText(d)}</span>}
                                  {l.clientName && <span className="pill ok">Business</span>}
                                  {l.ownerName && (
                                    <span className="av" title={l.ownerName} style={{ width: 22, height: 22, fontSize: 10, marginLeft: "auto" }}>
                                      {initials(l.ownerName)}
                                    </span>
                                  )}
                                </div>
                              </Link>
                            );
                          })
                        ) : (
                          <p className="muted small" style={{ padding: "4px 6px" }}>
                            Nothing here
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  Open a card to see everything they told us, log a call and set the next follow-up.
                </p>
              </>
            ),
          },
          {
            id: "list",
            label: "All enquiries",
            panel: (
              <>
                {filters}
                <div className="card" style={{ padding: 0 }}>
                  <div className="tw">
                    <table className="dt">
                      <thead>
                        <tr>
                          <th>Shop</th>
                          <th>Where from</th>
                          <th>Asked about</th>
                          <th>Stage</th>
                          <th>Came in</th>
                          <th>Next follow-up</th>
                          <th>With</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((l) => {
                          const s = LEAD_STAGES.find((x) => x.k === l.stage);
                          const d = isOpenStage(l.stage) ? daysTo(l.nextOn, today) : null;
                          return (
                            <tr key={l.id}>
                              <td>
                                <div className="who">
                                  <span className="av">{initials(l.shop)}</span>
                                  <div>
                                    <div className="n">
                                      <Link href={`/admin/enquiries/${l.id}`}>{l.shop}</Link>
                                    </div>
                                    <div className="s">{who(l) || l.phone}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="muted small">{l.source}</td>
                              <td>{l.planName ? <span className="pill">{l.planName}</span> : <span className="muted small">—</span>}</td>
                              <td>
                                <span className="pill" style={{ background: "transparent", border: `1.5px solid ${s?.color ?? "var(--line)"}` }}>
                                  {stageName(l.stage)}
                                </span>
                              </td>
                              <td className="muted small">{l.came}</td>
                              <td>
                                {d === null ? (
                                  <span className="muted small">—</span>
                                ) : (
                                  <b style={{ color: d < 0 ? "var(--bad)" : d === 0 ? "var(--warn)" : "inherit" }}>{dueText(d)}</b>
                                )}
                              </td>
                              <td className="muted small">{l.ownerName ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  Showing {shown.length} of {leads.length} enquiries.
                </p>
              </>
            ),
          },
          { id: "ins", label: "Where leads come from", panel: insights },
        ]}
      />
    </>
  );
}
