"use client";

// Admin panel › Payments › All payments: every plan payment on record, searchable by business or UPI reference.

import Link from "next/link";
import { useMemo, useState } from "react";

export type PayRow = { id: string; date: string; clientId: string; shop: string; what: string; amount: number; utr: string | null; status: string; method: string };

const R = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const TONE: Record<string, [string, string]> = {
  VERIFIED: ["ok", "Confirmed"],
  PENDING: ["warn", "Being checked"],
  REJECTED: ["bad", "Turned down"],
  CANCELLED: ["mute", "Withdrawn"],
};

export function PaymentsTable({ rows }: { rows: PayRow[] }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => (!f || r.status === f) && (!t || `${r.shop} ${r.utr ?? ""}`.toLowerCase().includes(t)));
  }, [rows, q, f]);
  return (
    <>
      <div className="filters">
        <div className="q">
          <input type="search" placeholder="Search business or UPI reference" aria-label="Search payments" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Status" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">All</option>
          <option value="VERIFIED">Confirmed</option>
          <option value="PENDING">Being checked</option>
          <option value="REJECTED">Turned down</option>
          <option value="CANCELLED">Withdrawn</option>
        </select>
        <a className="btn" href="/admin/payments/export">
          Download statement (CSV)
        </a>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table className="dt">
            <thead>
              <tr>
                <th>Date</th>
                <th>Business</th>
                <th>Plan</th>
                <th className="num">Amount</th>
                <th>UPI reference</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((r) => {
                  const [tone, label] = TONE[r.status] ?? ["mute", r.status];
                  return (
                    <tr key={r.id}>
                      <td className="muted small">{r.date}</td>
                      <td>
                        <Link href={`/admin/clients/${r.clientId}`}>{r.shop}</Link>
                      </td>
                      <td className="small">{r.what}</td>
                      <td className="num">{R(r.amount)}</td>
                      <td className="small">{r.utr ?? (r.method === "ADMIN_RECORD" ? "recorded by Thabaal" : "–")}</td>
                      <td>
                        <span className={`pill ${tone}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="muted small">
                    No payments match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
