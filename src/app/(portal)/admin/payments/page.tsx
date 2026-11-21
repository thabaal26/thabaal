import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { cycleName, forecast, loadClientRows, loadHistory, loadPayments, planName, SUB_STATUS, type ClientRow } from "@/lib/admin-data";
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
const waLink = (phone: string | null, text: string) => {
  const ph = (phone ?? "").replace(/\D/g, "");
  return ph ? `https://wa.me/${ph.length === 10 ? `91${ph}` : ph}?text=${encodeURIComponent(text)}` : null;
};

/** A WhatsApp reminder that opens with the message ready; nothing is sent until the admin presses send there. */
function Remind({ r, text }: { r: ClientRow; text: string }) {
  const href = waLink(r.phone, text);
  return href ? (
    <a className="btn sm" target="_blank" rel="noopener noreferrer" href={href}>
      Remind
    </a>
  ) : (
    <span className="muted small">no phone</span>
  );
}

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
  const paying = rows.filter((r) => r.state === "ok" || r.state === "due");

  // Auto-pay is the only way plans are paid: who is on it, who is failing, and who will lapse without it.
  const withSub = rows.filter((r) => r.sub).sort((a, b) => b.risk - a.risk || a.name.localeCompare(b.name));
  const failing = rows.filter((r) => r.autoPay === "failing");
  const autoOn = rows.filter((r) => r.autoPay === "on");
  const autoMonthly = autoOn.reduce((s, r) => s + (r.monthly || 0), 0);
  const noAuto = paying.filter((r) => r.autoPay === "none" || r.autoPay === "off").sort((a, b) => (a.endsAt?.getTime() ?? 0) - (b.endsAt?.getTime() ?? 0));
  const in30Auto = fc.in30.filter((r) => r.autoPay === "on");
  const toConfirm = queue.length + recharges.length;

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
  const recent = all
    .filter((p) => p.status === "VERIFIED" || p.status === "REJECTED")
    .sort((a, b) => (b.decidedAt?.getTime() ?? 0) - (a.decidedAt?.getTime() ?? 0))
    .slice(0, 8);
  const askToSubscribe = (name: string) =>
    `Hi ${name}, a gentle reminder from thabaal: your plan isn't on auto-pay yet, so it will stop when the paid period ends. Subscribe once in My account on thabaal.in and it renews by itself; you can cancel any time. Thank you!`;
  const askToFix = (name: string) =>
    `Hi ${name}, your thabaal auto-pay couldn't collect this period's payment. Please open My account on thabaal.in and set up auto-pay again (another card or UPI app works too) so nothing stops. Thank you!`;

  return (
    <>
      <PageHead title="Payments" sub="Plans are paid by Razorpay auto-pay and confirmed by themselves. Watch failed charges and who isn't on auto-pay." />

      <Kpis
        className="mb16"
        items={[
          {
            label: "On auto-pay",
            value: String(autoOn.length),
            note: autoOn.length ? `${R(autoMonthly)} a month renewing by itself` : "nobody subscribed yet",
            tone: autoOn.length ? "up" : "mute",
          },
          {
            label: "Auto-pay failing",
            value: String(failing.length),
            note: failing.length ? "Razorpay couldn't charge them" : "every charge went through",
            tone: failing.length ? "dn" : "up",
          },
          { label: "Received this month", value: R(thisMonth.collected), note: "plan payments received", tone: "mute", spark: hist.map((h) => h.collected) },
          {
            label: "Renewals in 30 days",
            value: R(fc.in30.reduce((s, r) => s + r.renewal, 0)),
            note: `${fc.in30.length} business${fc.in30.length === 1 ? "" : "es"} · ${in30Auto.length} on auto-pay`,
            tone: "mute",
          },
        ]}
      />

      <Tabs
        tabs={[
          {
            id: "auto",
            label: "Auto-pay",
            count: failing.length + noAuto.length,
            panel: (
              <>
                {failing.length > 0 && (
                  <div className="card mb16" style={{ borderLeft: "6px solid var(--bad)" }}>
                    <h2 style={{ marginBottom: 4 }}>Charges that failed</h2>
                    <p className="muted small" style={{ marginBottom: 12 }}>
                      Razorpay retries a failed charge for a few days, then stops. The owner was emailed; a reminder helps them set up auto-pay again.
                    </p>
                    <div className="list">
                      {failing.map((r) => (
                        <div key={r.id} className="row">
                          <div className="grow">
                            <div className="t">
                              <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                            </div>
                            <div className="muted small">
                              {planName(r.sub?.plan)} · {R(r.sub?.amount ?? r.renewal)} · {SUB_STATUS[r.sub?.status ?? ""]?.[1] ?? "failing"}
                              {r.endsAt ? ` · paid through ${day(r.endsAt)}` : ""}
                            </div>
                          </div>
                          <Remind r={r} text={askToFix(r.name)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card mb16" style={{ padding: 0 }}>
                  <div style={{ padding: "18px 20px 4px" }}>
                    <h2>Every subscription</h2>
                    <p className="muted small">The newest subscription of each business, straight from Razorpay&apos;s updates. Nothing here needs checking by hand.</p>
                  </div>
                  <div className="tw">
                    <table className="dt">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Plan</th>
                          <th className="num">Each period</th>
                          <th>Status</th>
                          <th>Paid through</th>
                          <th>Last charge</th>
                          <th>Since</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withSub.length ? (
                          withSub.map((r) => {
                            const [tone, label] = SUB_STATUS[r.sub!.status] ?? (["mute", r.sub!.status] as const);
                            return (
                              <tr key={r.id}>
                                <td>
                                  <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                                  {r.sub!.note ? <div className="muted small">{r.sub!.note}</div> : null}
                                </td>
                                <td className="small">
                                  {planName(r.sub!.plan)} · {cycleName(r.sub!.cycle)}
                                </td>
                                <td className="num">{R(r.sub!.amount)}</td>
                                <td>
                                  <Pill tone={tone}>{label}</Pill>
                                </td>
                                <td className="small">{r.endsAt ? day(r.endsAt) : "–"}</td>
                                <td className="small">{r.lastAutoCharge ? day(r.lastAutoCharge) : "–"}</td>
                                <td className="small">{day(r.sub!.since)}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="muted small">
                              No business has subscribed yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <h2 style={{ marginBottom: 4 }}>Paying now, but not on auto-pay</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Their plan stops when the paid period ends, unless they subscribe in My account. Soonest first.
                  </p>
                  {noAuto.length ? (
                    <div className="list">
                      {noAuto.map((r) => (
                        <div key={r.id} className="row">
                          <div className="grow">
                            <div className="t">
                              <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                            </div>
                            <div className="muted small">
                              {planName(r.plan)} · {R(r.renewal)} · ends {r.endsAt ? day(r.endsAt) : "–"}
                              {r.autoPay === "off" ? " · cancelled auto-pay" : " · never subscribed"}
                            </div>
                          </div>
                          <Remind r={r} text={askToSubscribe(r.name)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">Every paying business is on auto-pay.</p>
                  )}
                </div>
              </>
            ),
          },
          {
            id: "due",
            label: "Overdue and locked",
            count: late.length,
            panel: (
              <div className="g6">
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: "18px 20px 4px" }}>
                    <h2>Who owes money</h2>
                    <p className="muted small">
                      {late.length ? `${R(owed)} outside. ` : ""}Oldest first. The reminder opens WhatsApp with a message ready; nothing is sent until you
                      press send there.
                    </p>
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
                            {late.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                                  <div className="muted small">
                                    {planName(r.plan)}
                                    {r.autoPay === "failing" ? " · auto-pay failing" : r.autoPay === "on" ? " · auto-pay collecting" : " · no auto-pay"}
                                  </div>
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
                                  <Remind r={r} text={r.autoPay === "failing" ? askToFix(r.name) : askToSubscribe(r.name)} />
                                </td>
                              </tr>
                            ))}
                            {neverPaid.map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                                  <div className="muted small">needs a plan, never subscribed</div>
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
                    A business stays open for {GRACE_DAYS} days after its plan ends, then locks until a payment goes through.
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
                          <Pill tone={r.autoPay === "on" ? "ok" : r.autoPay === "failing" ? "bad" : "warn"}>
                            {r.autoPay === "on" ? "Auto-pay" : r.autoPay === "failing" ? "Failing" : "No auto-pay"}
                          </Pill>
                          <b>{R(r.renewal)}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No renewals in the next 30 days.</p>
                  )}
                  <h2 style={{ fontSize: 17, margin: "18px 0 8px" }}>Recent payments</h2>
                  {recent.length ? (
                    <div className="list">
                      {recent.map((p) => (
                        <div className="row" key={p.id}>
                          <div className="grow">
                            <div className="t">{p.client.name}</div>
                            <div className="muted small">
                              {planName(p.plan)} · {R(p.amountPaise / 100)}
                              {p.decidedBy ? ` · by ${p.decidedBy}` : ""}
                              {p.decidedAt ? ` · ${day(p.decidedAt)}` : ""}
                            </div>
                          </div>
                          <Pill tone={p.status === "VERIFIED" ? "ok" : "bad"}>
                            {p.status === "REJECTED" ? "Turned down" : p.method === "RAZORPAY" ? "Auto-pay" : p.method === "ADMIN_RECORD" ? "Recorded" : "UPI confirmed"}
                          </Pill>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">No payments yet.</p>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "check",
            label: "To confirm",
            count: toConfirm,
            panel: (
              <>
                <div className="card mb16" style={{ borderLeft: "6px solid var(--bar2)" }}>
                  <h2 style={{ marginBottom: 4 }}>Old UPI plan payments</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    Plan payments are confirmed by Razorpay now. Only UPI references sent before auto-pay can wait here: find the number in your bank app,
                    then confirm. A reference alone never changes a plan.
                  </p>
                  {queue.length ? (
                    <div className="list">
                      {queue.map((q) => (
                        <PendingRow key={q.id} row={q} showClient />
                      ))}
                    </div>
                  ) : (
                    <p className="muted small">Nothing waiting.</p>
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
        ]}
      />
    </>
  );
}
