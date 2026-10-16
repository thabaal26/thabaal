import type { Metadata } from "next";
import { PickClientNotice } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { paymentsData, WAY_COLOR, WAY_LABEL, type Way } from "@/lib/payments-data";
import { getScope } from "@/lib/session";
import { LoyaltyRedeemSetting } from "../orders/loyalty-points-ui";
import { PaymentForm } from "../orders/payment-form";
import { inr } from "../portal-format";
import { LinkTabs, PortalPage, Seg } from "../portal-ui";
import { SpendCard } from "../spend-card";
import { CollectList, CsvButton, ReceiptButton, RecordByNumber, TxnTable } from "./payments-board";
import Link from "@/components/intent-link";

export const metadata: Metadata = { title: "Payments" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "collect", label: "To collect", ta: "வசூலிக்க" },
  { id: "got", label: "Received", ta: "வந்த பணம்" },
  { id: "cod", label: "Cash / COD", ta: "ரொக்கம்" },
  { id: "all", label: "All transactions", ta: "அனைத்தும்" },
  { id: "set", label: "Payment settings", ta: "அமைப்பு" },
  { id: "costs", label: "WhatsApp costs", ta: "வாட்ஸ்அப் செலவு" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const PERIODS = [
  { id: "t", label: "Today" },
  { id: "w", label: "This week" },
  { id: "m", label: "This month" },
] as const;

const SUB = "Money received, money waiting and what you should collect today.";
const SUB_TA = "வந்த பணம், வர வேண்டிய பணம், இன்று வசூலிக்க வேண்டியவை.";

/** Payments (portal design): to collect, received, cash on delivery, every transaction, settings. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : "collect";
  const per = sp.per === "w" || sp.per === "m" ? sp.per : "t";
  const way = typeof sp.way === "string" && sp.way in WAY_LABEL ? (sp.way as Way) : "";
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ tab: tab === "collect" ? undefined : tab, per: per === "t" ? undefined : per, way: way || undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/revenue${q.size ? `?${q}` : ""}`;
  };
  const tabs = <LinkTabs label="Payments views" current={tab} tabs={TABS.map((t) => ({ ...t, href: t.id === "collect" ? "/dashboard/revenue" : `/dashboard/revenue?tab=${t.id}` }))} />;

  if (!scope.clientId)
    return (
      <PortalPage title="Payments" titleTa="பணம்" sub={SUB} subTa={SUB_TA}>
        {tabs}
        <PickClientNotice what="payments" />
      </PortalPage>
    );
  const clientId = scope.clientId;

  const d = await paymentsData(clientId, per);
  const now = new Date().getTime();
  const toCollect = d.collect.filter((r) => !r.cod).reduce((n, r) => n + r.due, 0);
  const codPending = d.collect.filter((r) => r.cod).reduce((n, r) => n + r.due, 0);
  const failed = d.collect.filter((r) => r.state === "failed").length;
  const claimed = d.collect.filter((r) => r.state === "claimed").length;

  const kpis = (
    <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
      <div className="card stat">
        <div className="l">Received today</div>
        <div className="v">{inr(d.receivedToday)}</div>
        <div className="d muted">Money in your account</div>
      </div>
      <div className="card stat">
        <div className="l">Money to collect</div>
        <div className="v">{inr(toCollect)}</div>
        <div className="d muted">{claimed ? `${claimed} say they paid · check` : "Not paid yet"}</div>
      </div>
      <div className="card stat">
        <div className="l">COD pending</div>
        <div className="v">{inr(codPending)}</div>
        <div className="d muted">Collect during delivery</div>
      </div>
      <div className="card stat">
        <div className="l">Failed or expired</div>
        <div className="v">{failed}</div>
        <div className={`d ${failed ? "down" : "muted"}`}>{failed ? "Needs your attention" : "Nothing stuck"}</div>
      </div>
    </div>
  );

  let body: React.ReactNode = null;

  if (tab === "collect") {
    body = <CollectList rows={d.collect} nowMs={now} canOperate={scope.canOperate} />;
  } else if (tab === "got") {
    const list = d.received.filter((r) => !way || r.way === way);
    const total = list.reduce((n, r) => n + r.amount, 0);
    const ways = (Object.keys(WAY_LABEL) as Way[]).filter((w) => d.received.some((r) => r.way === w));
    const by = Object.fromEntries(ways.map((w) => [w, list.filter((r) => r.way === w).reduce((n, r) => n + r.amount, 0)])) as Record<Way, number>;
    const when = (ms: number) => fmtDate(new Date(ms), per === "t" ? "h:mm a" : "d MMM, h:mm a");
    body = (
      <>
        <div className="toolbar">
          <Seg label="Period" value={per} options={PERIODS.map((p) => ({ ...p, href: href({ per: p.id === "t" ? undefined : p.id }) }))} />
          <div className="chips" style={{ marginLeft: 8 }}>
            <Link className="chip" href={href({ way: undefined })} aria-pressed={!way} scroll={false}>
              All ways
            </Link>
            {ways.map((w) => (
              <Link key={w} className="chip" href={href({ way: w })} aria-pressed={way === w} scroll={false}>
                {WAY_LABEL[w]}
              </Link>
            ))}
          </div>
          <CsvButton
            name={`received-${per}`}
            label="Export"
            rows={[["When", "Order", "Customer", "Paid by", "Amount", "Reference", "Collected by"], ...list.map((r) => [fmtDate(new Date(r.atMs), "d MMM yyyy, h:mm a"), r.ref, r.name, WAY_LABEL[r.way], r.amount, r.reference ?? "", r.collectedBy ?? ""])]}
          />
        </div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="hd">
            <h2>How customers paid</h2>
            <b>
              {inr(total)} from {list.length} payment{list.length === 1 ? "" : "s"}
            </b>
          </div>
          <div className="bar" style={{ height: 14 }}>
            {ways.map((w) => (
              <i key={w} style={{ width: `${total ? Math.round(((by[w] ?? 0) / total) * 100) : 0}%`, background: WAY_COLOR[w] }} />
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            {ways.map((w) => (
              <span key={w} style={{ ["--c" as string]: WAY_COLOR[w] }}>
                {WAY_LABEL[w]} {inr(by[w] ?? 0)}
              </span>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Paid by</th>
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="muted">{when(r.atMs)}</td>
                    <td>{r.ref}</td>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td>
                      <span className={`pill ${r.way === "cash" ? "info" : "ok"}`}>{WAY_LABEL[r.way]}</span>
                    </td>
                    <td className="num">{inr(r.amount)}</td>
                    <td>
                      <ReceiptButton row={r} way={WAY_LABEL[r.way]} when={fmtDate(new Date(r.atMs), "EEE d MMM, h:mm a")} />
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Nothing received in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  } else if (tab === "cod") {
    const cod = d.collect.filter((r) => r.cod);
    const dayTotal = d.cashDay.reduce((n, r) => n + r.amount, 0);
    const dayOrders = d.cashDay.reduce((n, r) => n + r.orders, 0);
    body = (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="hd">
            <div>
              <h2>Cash to collect</h2>
              <p>Tap “Record cash received” once the money is in your hand.</p>
            </div>
          </div>
          <CollectList rows={cod} nowMs={now} canOperate={scope.canOperate} intro={false} />
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Day close</h2>
              <p>Cash recorded today, by who collected it. Count what each person hands over.</p>
            </div>
          </div>
          <div className="list">
            {d.cashDay.map((r) => (
              <div key={r.by} className="row">
                <div className="grow t">{r.by}</div>
                <span className="muted small">
                  {r.orders} order{r.orders === 1 ? "" : "s"}
                </span>
                <b>{inr(r.amount)}</b>
              </div>
            ))}
            {d.cashDay.length === 0 && <p className="muted small">No cash recorded today yet.</p>}
          </div>
          <div className="row" style={{ borderTop: "2px solid var(--line)" }}>
            <div className="grow t">Total</div>
            <div className="muted small">
              {dayOrders} order{dayOrders === 1 ? "" : "s"}
            </div>
            <b>{inr(dayTotal)}</b>
          </div>
          {d.cashDay.length > 0 && (
            <div className="tools" style={{ marginTop: 14 }}>
              <CsvButton name="cash-today" label="Share summary (CSV)" rows={[["Collected by", "Orders", "Amount"], ...d.cashDay.map((r) => [r.by, r.orders, r.amount]), ["Total", dayOrders, dayTotal]]} />
            </div>
          )}
        </div>
      </>
    );
  } else if (tab === "all") {
    body = <TxnTable rows={d.txns.map((t) => ({ ...t, when: fmtDate(new Date(t.atMs), "d MMM, h:mm a") }))} />;
  } else if (tab === "set") {
    const [client, ownPaymentTemplate, paymentTemplate] = await Promise.all([
      db.client.findUnique({ where: { id: clientId }, select: { paymentConfig: true, loyaltyAutoRedeem: true } }),
      db.template.findFirst({ where: { clientId, name: PAYMENT_TEMPLATE }, select: { status: true } }),
      paymentTemplateFor(clientId),
    ]);
    body = (
      <div className="stack">
        <section className="card">
          <div className="hd">
            <div>
              <h2>How customers pay</h2>
              <p>Pay inside WhatsApp, a UPI link or QR, or cash on delivery. Orders and Payments change to match.</p>
            </div>
          </div>
          {scope.canManage && client ? (
            <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />
          ) : (
            <p className="muted small">Ask your admin to change payment settings.</p>
          )}
          <div className="note small" style={{ marginTop: 14 }}>
            <b>How an order flows:</b> offer message › Order now › catalogue › cart › Review and pay › paid. Orders without WhatsApp payments go through a UPI link or QR, or cash on delivery, and you mark them
            paid. Cash on delivery is chosen per order (Orders › More actions).
          </div>
        </section>
        {scope.canManage && client && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>Loyalty points at checkout</h2>
                <p>Let customers use their points on an order.</p>
              </div>
            </div>
            <LoyaltyRedeemSetting on={client.loyaltyAutoRedeem} />
          </section>
        )}
        <section className="card">
          <div className="hd">
            <div>
              <h2>Reminders</h2>
              <p>thabaal chases the money for you.</p>
            </div>
          </div>
          <div className="list">
            <div className="row">
              <div className="grow">
                <div className="t">One automatic reminder</div>
                <div className="muted small">When a WhatsApp payment request is still unpaid after a few hours, the customer gets one polite reminder.</div>
              </div>
              <span className="pill ok">On</span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="t">Remind everyone now</div>
                <div className="muted small">To collect › Remind everyone sends the request again to everyone waiting.</div>
              </div>
              <Link className="btn sm" href="/dashboard/revenue">
                Open
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  } else {
    body = <SpendCard clientId={clientId} canManage={scope.canManage} />;
  }

  return (
    <PortalPage title="Payments" titleTa="பணம்" sub={SUB} subTa={SUB_TA} actions={scope.canOperate ? <RecordByNumber rows={d.collect} /> : undefined}>
      {kpis}
      {tabs}
      {body}
    </PortalPage>
  );
}
