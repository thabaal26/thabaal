"use client";

// Admin panel › All clients: search, filter and sort the list the server built; a row opens the business.

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type TableRow = {
  id: string;
  name: string;
  sub: string;
  plan: string | null;
  planLabel: string;
  cycleLabel: string;
  state: string;
  stateTone: string;
  stateLabel: string;
  monthly: number;
  renewal: number;
  camp: number;
  campLimit: number | null;
  tmpl: number;
  tmplLimit: number | null;
  sales: number;
  health: string;
  healthLabel: string;
  risk: number;
  last: string;
  created: number;
};

const R = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const K = (n: number) => (n >= 100_000 ? `₹${(n / 100_000).toFixed(1)}L` : n >= 1000 ? `₹${Math.round(n / 1000)}k` : R(n));
const ini = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function ClientsTable({ rows }: { rows: TableRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [st, setSt] = useState("");
  const [sort, setSort] = useState("risk");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const L = rows.filter((r) => {
      if (plan && (plan === "none" ? r.plan !== null && (r.state === "ok" || r.state === "due") : r.plan !== plan)) return false;
      if (st && r.state !== st && !(st === "pending" && r.stateLabel === "Checking payment")) return false;
      if (t && !`${r.name} ${r.sub}`.toLowerCase().includes(t)) return false;
      return true;
    });
    return [...L].sort((a, b) =>
      sort === "risk" ? b.risk - a.risk : sort === "mrr" ? b.monthly - a.monthly : sort === "sales" ? b.sales - a.sales : sort === "new" ? b.created - a.created : a.name.localeCompare(b.name),
    );
  }, [rows, q, plan, st, sort]);

  return (
    <>
      <div className="filters">
        <div className="q">
          <input type="search" placeholder="Search business, owner or town" aria-label="Search clients" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="business">Business</option>
          <option value="none">No plan in force</option>
        </select>
        <select aria-label="Status" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ok">Active</option>
          <option value="due">Renews soon</option>
          <option value="pending">Checking payment</option>
          <option value="overdue">Overdue</option>
          <option value="locked">Locked</option>
          <option value="new">Not paid yet</option>
          <option value="unmanaged">No plan needed</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="risk">Sort: needs attention</option>
          <option value="mrr">Sort: revenue</option>
          <option value="sales">Sort: their sales</option>
          <option value="new">Sort: newest</option>
          <option value="name">Sort: name</option>
        </select>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw" style={{ maxHeight: "66vh", overflow: "auto" }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
                <th className="num">Monthly</th>
                <th>Use this month</th>
                <th className="num">Their sales</th>
                <th>Health</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const u = r.campLimit ? Math.round((r.camp / r.campLimit) * 100) : 0;
                return (
                  <tr
                    key={r.id}
                    className="go"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/clients/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/admin/clients/${r.id}`);
                    }}
                  >
                    <td>
                      <div className="who">
                        <span className="av">{ini(r.name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div className="n">{r.name}</div>
                          <div className="s">{r.sub}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="pill">{r.planLabel}</span>
                      <div className="muted small" style={{ marginTop: 3 }}>
                        {r.cycleLabel}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${r.stateTone}`}>{r.stateLabel}</span>
                    </td>
                    <td className="num">{r.monthly ? R(r.monthly) : "–"}</td>
                    <td>
                      <div className="muted small" style={{ marginBottom: 4 }}>
                        {r.camp}
                        {r.campLimit ? `/${r.campLimit}` : ""} campaigns · {r.tmpl}
                        {r.tmplLimit ? `/${r.tmplLimit}` : ""} templates
                      </div>
                      {r.campLimit ? (
                        <div className="mini">
                          <i style={{ width: `${Math.min(100, u)}%`, background: u >= 90 ? "var(--bad)" : u >= 70 ? "var(--bar2)" : "var(--bar4)" }} />
                        </div>
                      ) : null}
                    </td>
                    <td className="num">{r.sales ? K(r.sales) : "–"}</td>
                    <td>
                      <span className={`pill ${r.health}`}>{r.healthLabel}</span>
                    </td>
                    <td className="muted small">{r.last}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 10 }}>
        Showing {shown.length} of {rows.length} businesses. &ldquo;Last activity&rdquo; is their last message, reply or order: app sign-ins are not tracked yet.
      </p>
    </>
  );
}
