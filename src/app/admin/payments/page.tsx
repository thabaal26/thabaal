import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { cycleName, forecast, loadClientRows, loadHistory, loadPayments, planName } from "@/lib/admin-data";
import { adminQueue } from "@/lib/admin-queue";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { GRACE_DAYS } from "@/lib/subscription-core";
import { PendingRow } from "../../dashboard/account/admin-plan-panel";
import { DecideRecharge } from "../../dashboard/wallet/wallet-forms";
import { Tabs } from "../nav";
import { BarChart, HBars, K, Kpis, PageHead, Pill, R } from "../ui";
import { PaymentsTable, type PayRow } from "./payments-table";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const day = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy");

export default async function PaymentsPage() {
  await requireAdminPage();
  const now = new Date();
  const [{ rows, purchases }, queue, all, recharges] = await Promise.all([
    loadClientRows(now),
    adminQueue(now, null),
    loadPayments(),
    db.walletEntry.findMany({ where: { kind: "RECHARGE", status: "PENDING" }, include: { client: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const hist = await loadHistory(purchases, now);
  const thisMonth = hist[hist.length - 1];
  const late = rows.filter((r) => r.state === "overdue" || r.state === "locked").sort((a, b) => b.days - a.days);
  const neverPaid = rows.filter((r) => r.state === "new");
  const owed = late.reduce((s, r) => s + r.renewal, 0);
  const fc = forecast(rows, now);
  const queueAmt = queue.reduce((s, q) => s + q.amount, 0);
  const aging: [string, number, string][] = [
    ["Up to 7 days", late.filter((r) => r.days <= 7).reduce((s, r) => s + r.renewal, 0), "var(--bar2)"],
    ["8 to 30 days", late.filter((r) => r.days > 7 && r.days <= 30).reduce((s, r) => s + r.renewal, 0), "var(--bar3)"],
    ["Over 30 days", late.filter((r) => r.days > 30).reduce((s, r) => s + r.renewal, 0), "var(--bad)"],
  ];
  const table: PayRow[] = all.map((p) => ({
    id: p.id,
    date: day(p.createdAt),
    clientId: p.client.id,
    shop: p.client.name,
    what: `${planName(p.plan)} · ${cycleName(p.cycle)}`,
    amount: p.amountPaise / 100,
    utr: p.utr,
    status: p.status,
    method: p.method,
  }));
  const decided = all.filter((p) => p.status === "VERIFIED" || p.status === "REJECTED").sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0)).slice(0, 8);
  const remind = (name: string, amount: number) => encodeURIComponent(`Hi ${name}, a gentle reminder from thabaal: your plan renewal of ${R(amount)} is due. Pay in My account on thabaal.in. Thank you!`);

  return (
    <>
      <PageHead title="Payments" sub="Confirm UPI payments, chase what is late, and see what is coming." />

      <Kpis
        className="mb16"
        items={[
          { label: "To confirm", value: String(queue.length + recharges.length), note: queue.length ? `${R(queueAmt)} in plan payments` : recharges.length ? "wallet recharges" : "nothing waiting", tone: queue.length + recharges.length ? "dn" : "up" },
          { label: "Not paid", value: R(owed), note: `${late.length} overdue or locked${neverPaid.length ? ` · ${neverPaid.length} never paid` : ""}`, tone: late.length ? "dn" : "up" },
          { label: "Received this month", value: R(thisMonth.collected), note: "plan payments confirmed", tone: "mute", spark: hist.map((h) => h.collected) },
          { label: "Renewals in 30 days", value: R(fc.in30.reduce((s, r) => s + r.renewal, 0)), note: `${fc.in30.length} business${fc.in30.length === 1 ? "" : "es"}`, tone: "mute" },
        ]}
      />

      <Tabs
        tabs={[
          {
            id: "check",
            label: "To confirm",
            count: queue.length + recharges.length,
            panel: (
              <>
                <div className="card mb16" style={{ borderLeft: "6px solid var(--bar2)" }}>
                  <h2 style={{ marginBottom: 4 }}>Plan payments waiting for you</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Businesses that paid by UPI and sent a reference number. Find the number in your bank app, then confirm. A reference alone never changes their plan.
                  </p>
                  {queue.length ? (
                    <div className="list">
                      {queue.map((q) => (
                        <PendingRow key={q.id} row={q} showClient />
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">Nothing waiting. New ones also arrive in your email.</p>
                  )}
                </div>
                <div className="card">
                  <h2 style={{ marginBottom: 4 }}>Wallet recharges waiting for you</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Approve only after the money shows in your bank or UPI app.
                  </p>
                  {recharges.length ? (
                    <div className="list">
                      {recharges.map((w) => (
                        <div key={w.id} className="row">
                          <div className="grow">
                            <div className="t">
                              {R(w.amount)} from <Link href={`/admin/clients/${w.client.id}`}>{w.client.name}</Link>
                            </div>
                            <div className="muted small">
                              UPI reference {w.utr ?? "–"} · sent {formatInTimeZone(w.createdAt, APP_TZ, "d MMM, h:mm a")}
                              {w.note ? ` · ${w.note}` : ""}
                            </div>
                          </div>
                          <DecideRecharge id={w.id} label={`${R(w.amount)} from ${w.client.name}`} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No recharges waiting.</p>
                  )}
                </div>
              </>
            ),
          },
          {
            id: "due",
            label: "Due and overdue",
            count: late.length,
            panel: (
              <div className="g6">
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: "18px 20px 4px" }}>
                    <h2>Who owes money</h2>
                    <p className="muted small">Oldest first. The reminder opens WhatsApp with a message ready; nothing is sent until you press send there.</p>
                  </div>
                  <div className="tw">
                    <table className="dt">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Ended</th>
                          <th className="num">Renewal</th>
                          <th>How late</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {late.length || neverPaid.length ? (
                          <>
                            {late.map((r) => {
                              const ph = (r.phone ?? "").replace(/\D/g, "");
                              return (
                                <tr key={r.id}>
                                  <td>
                                    <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                                    <div className="muted small">{planName(r.plan)}</div>
                                  </td>
                                  <td className="small">{r.endsAt ? day(r.endsAt) : "–"}</td>
                                  <td className="num">{R(r.renewal)}</td>
                                  <td>
                                    <Pill tone={r.state === "locked" ? "bad" : "warn"}>
                                      {r.days} day{r.days === 1 ? "" : "s"}
                                      {r.state === "locked" ? " · locked" : ""}
                                    </Pill>
                                  </td>
                                  <td>
                                    {ph ? (
                                      <a className="btn sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${ph.length === 10 ? `91${ph}` : ph}?text=${remind(r.name, r.renewal)}`}>
                                        Remind
                                      </a>
                                    ) : (
                                      <span className="muted small">no phone</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {neverPaid.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                                  <div className="muted small">needs a plan, never paid</div>
                                </td>
                                <td className="small">–</td>
                                <td className="num">–</td>
                                <td>
                                  <Pill tone="bad">app closed</Pill>
                                </td>
                                <td />
                              </tr>
                            ))}
                          </>
                        ) : (
                          <tr>
                            <td colSpan={5} className="muted small">
                              Nobody owes money.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>How late, in money</h2>
                    </div>
                  </div>
                  <HBars rows={aging} fmt={R} />
                  <p className="muted small" style={{ marginTop: 14 }}>
                    A business stays open for {GRACE_DAYS} days after its plan ends, then locks until a payment is confirmed.
                  </p>
                </div>
              </div>
            ),
          },
          { id: "all", label: "All payments", panel: <PaymentsTable rows={table} /> },
          {
            id: "fore",
            label: "Forecast",
            panel: (
              <div className="g6">
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>What is coming in</h2>
                      <p>If every business renews the plan and cycle it has now, by the month its plan ends.</p>
                    </div>
                  </div>
                  <BarChart labels={fc.byMonth.map((m) => m.label)} series={[{ name: "Renewals", vals: fc.byMonth.map((m) => m.amount), color: "#20C985" }]} fmt={K} label="Expected renewals" />
                  <h2 style={{ fontSize: 17, margin: "16px 0 8px" }}>Received each month</h2>
                  <BarChart labels={hist.map((h) => h.label)} series={[{ name: "Received", vals: hist.map((h) => h.collected), color: "var(--bar)" }]} fmt={K} h={170} label="Plan payments received by month" />
                </div>
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>Renewals in the next 30 days</h2>
                    </div>
                  </div>
                  {fc.in30.length ? (
                    <div className="list">
                      {fc.in30.map((r) => (
                        <div className="row" key={r.id}>
                          <div className="grow">
                            <div className="t">
                              <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                            </div>
                            <div className="muted small">
                              {planName(r.plan)} · {cycleName(r.cycle)} · ends {r.endsAt ? day(r.endsAt) : "–"}
                            </div>
                          </div>
                          <b>{R(r.renewal)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No renewals in the next 30 days.</p>
                  )}
                  <h2 style={{ fontSize: 17, margin: "18px 0 8px" }}>Recently checked</h2>
                  {decided.length ? (
                    <div className="list">
                      {decided.map((p) => (
                        <div className="row" key={p.id}>
                          <div className="grow">
                            <div className="t">{p.client.name}</div>
                            <div className="muted small">
                              {planName(p.plan)} · {R(p.amountPaise / 100)}
                              {p.decidedBy ? ` · by ${p.decidedBy}` : ""}
                              {p.decidedAt ? ` · ${day(p.decidedAt)}` : ""}
                            </div>
                          </div>
                          <Pill tone={p.status === "VERIFIED" ? "ok" : "bad"}>{p.status === "VERIFIED" ? "Confirmed" : "Turned down"}</Pill>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">Nothing checked yet.</p>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
