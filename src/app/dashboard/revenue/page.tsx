import type { Metadata } from "next";
import { AlertCircle, Banknote, Clock, IndianRupee } from "@/components/icons";
import { PickClientNotice, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { paymentsData, WAY_COLOR, WAY_LABEL, WAY_LABEL_TA, type Way } from "@/lib/payments-data";
import { getScope } from "@/lib/session";
import { LoyaltyRedeemSetting } from "../orders/loyalty-points-ui";
import { PaymentForm } from "../orders/payment-form";
import { inr } from "../portal-format";
import { LinkTabs, PortalPage, Seg, T } from "../portal-ui";
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
] as const;
type TabId = (typeof TABS)[number]["id"];

const PERIODS = [
  { id: "t", label: "Today", ta: "இன்று" },
  { id: "w", label: "This week", ta: "இந்த வாரம்" },
  { id: "m", label: "This month", ta: "இந்த மாதம்" },
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
      <Stat
        label="Received today"
        value={inr(d.receivedToday)}
        sub="Money in your account"
        icon={<IndianRupee className="size-4" />}
        tone="brand"
        href="/dashboard/revenue?tab=got"
      />
      <Stat
        label="Money to collect"
        value={inr(toCollect)}
        sub={claimed ? `${claimed} say they paid · check` : "Not paid yet"}
        icon={<Clock className="size-4" />}
        tone="amber"
        href="/dashboard/revenue?tab=collect"
      />
      <Stat
        label="COD pending"
        value={inr(codPending)}
        sub="Collect during delivery"
        icon={<Banknote className="size-4" />}
        tone="info"
        href="/dashboard/revenue?tab=cod"
      />
      <Stat
        label="Failed or expired"
        value={failed}
        sub={failed ? "Needs your attention" : "Nothing stuck"}
        icon={<AlertCircle className="size-4" />}
        tone={failed ? "rose" : "brand"}
        href="/dashboard/revenue?tab=collect"
      />
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
            <Link className="chip" href={href({ way: undefined })} aria-current={!way ? "true" : undefined} scroll={false}>
              <T ta="அனைத்து வழிகள்">All ways</T>
            </Link>
            {ways.map((w) => (
              <Link key={w} className="chip" href={href({ way: w })} aria-current={way === w ? "true" : undefined} scroll={false}>
                <T ta={WAY_LABEL_TA[w]}>{WAY_LABEL[w]}</T>
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
            <div>
              <h2><T ta="வாடிக்கையாளர் செலுத்திய விதம்">How customers paid</T></h2>
              <b>
                {inr(total)} <T ta={`(${list.length} முறை)`}>{`from ${list.length} payment${list.length === 1 ? "" : "s"}`}</T>
              </b>
            </div>
          </div>
          <div className="bar" style={{ height: 14 }}>
            {ways.map((w) => (
              <i key={w} style={{ width: `${total ? Math.round(((by[w] ?? 0) / total) * 100) : 0}%`, background: WAY_COLOR[w] }} />
            ))}
          </div>
          <div className="legend" style={{ marginTop: 10 }}>
            {ways.map((w) => (
              <span key={w} style={{ ["--c" as string]: WAY_COLOR[w] }}>
                <T ta={WAY_LABEL_TA[w]}>{WAY_LABEL[w]}</T> {inr(by[w] ?? 0)}
              </span>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th><T ta="நேரம்">When</T></th>
                  <th><T ta="ஆர்டர்">Order</T></th>
                  <th><T ta="வாடிக்கையாளர்">Customer</T></th>
                  <th><T ta="செலுத்திய முறை">Paid by</T></th>
                  <th className="num"><T ta="தொகை">Amount</T></th>
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
                      <span className={`pill ${r.way === "cash" ? "info" : "ok"}`}>
                        <T ta={WAY_LABEL_TA[r.way]}>{WAY_LABEL[r.way]}</T>
                      </span>
                    </td>
                    <td className="num">{inr(r.amount)}</td>
                    <td>
                      <ReceiptButton row={r} way={WAY_LABEL[r.way]} when={fmtDate(new Date(r.atMs), "EEE d MMM, h:mm a")} canOperate={scope.canOperate} />
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      <T ta="இந்த காலத்தில் பணம் எதுவும் வரவில்லை.">Nothing received in this period.</T>
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
              <h2><T ta="வசூலிக்க வேண்டிய ரொக்கம்">Cash to collect</T></h2>
              <p><T ta="பணம் உங்கள் கைக்கு வந்ததும் 'ரொக்கம் பதிவு செய்' என்பதை அழுத்தவும்.">Tap “Record cash received” once the money is in your hand.</T></p>
            </div>
          </div>
          <CollectList rows={cod} nowMs={now} canOperate={scope.canOperate} intro={false} />
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2><T ta="நாள் கணக்கு முடிவு">Day close</T></h2>
              <p><T ta="இன்று வசூலான ரொக்கம். ஒவ்வொருவரும் ஒப்படைக்கும் தொகையை சரிபார்க்கவும்.">Cash recorded today, by who collected it. Count what each person hands over.</T></p>
            </div>
          </div>
          <div className="list">
            {d.cashDay.map((r) => (
              <div key={r.by} className="row">
                <div className="grow t">{r.by}</div>
                <span className="muted small">
                  {r.orders} <T ta="ஆர்டர்கள்">{`order${r.orders === 1 ? "" : "s"}`}</T>
                </span>
                <b>{inr(r.amount)}</b>
              </div>
            ))}
            {d.cashDay.length === 0 && <p className="muted small"><T ta="இன்று இதுவரை ரொக்கம் எதுவும் பதிவாகவில்லை.">No cash recorded today yet.</T></p>}
          </div>
          <div className="row" style={{ borderTop: "2px solid var(--line)" }}>
            <div className="grow t"><T ta="மொத்தம்">Total</T></div>
            <div className="muted small">
              {dayOrders} <T ta="ஆர்டர்கள்">{`order${dayOrders === 1 ? "" : "s"}`}</T>
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
    body = <TxnTable rows={d.txns.map((t) => ({ ...t, when: fmtDate(new Date(t.atMs), "d MMM, h:mm a") }))} canOperate={scope.canOperate} />;
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
              <h2><T ta="வாடிக்கையாளர்கள் பணம் செலுத்தும் முறை">How customers pay</T></h2>
              <p><T ta="WhatsApp மூலம் செலுத்துதல், UPI இணைப்பு அல்லது ரொக்கம்.">Pay inside WhatsApp, a UPI link or QR, or cash on delivery. Orders and Payments change to match.</T></p>
            </div>
          </div>
          {scope.canManage && client ? (
            <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />
          ) : (
            <p className="muted small"><T ta="அமைப்புகளை மாற்ற நிர்வாகியிடம் கேட்கவும்.">Ask your admin to change payment settings.</T></p>
          )}
          <div className="note small" style={{ marginTop: 14 }}>
            <b><T ta="ஆர்டர் வழிமுறை: ">How an order flows: </T></b>
            <T ta="சலுகை செய்தி › Order now › பட்டியல் › கார்ட் › Review and pay › பணம் செலுத்தப்பட்டது. WhatsApp கட்டணம் இல்லாத ஆர்டர்கள் UPI அல்லது ரொக்கம் மூலம் முடியும்.">
              offer message › Order now › catalogue › cart › Review and pay › paid. Orders without WhatsApp payments go through a UPI link or QR, or cash on delivery, and you mark them paid.
            </T>
          </div>
        </section>
        {scope.canManage && client && (
          <section className="card">
            <div className="hd">
              <div>
                <h2><T ta="செக்அவுட்டில் லாயல்டி புள்ளிகள்">Loyalty points at checkout</T></h2>
                <p><T ta="ஆர்டரில் வாடிக்கையாளர்கள் தங்கள் லாயல்டி புள்ளிகளைப் பயன்படுத்த அனுமதிக்கவும்.">Let customers use their points on an order.</T></p>
              </div>
            </div>
            <LoyaltyRedeemSetting on={client.loyaltyAutoRedeem} />
          </section>
        )}
        <section className="card">
          <div className="hd">
            <div>
              <h2><T ta="நினைவூட்டல்கள்">Reminders</T></h2>
              <p><T ta="தபால் உங்களுக்காகப் பணத்தை வசூலிக்க நினைவூட்டும்.">thabaal chases the money for you.</T></p>
            </div>
          </div>
          <div className="list">
            <div className="row">
              <div className="grow">
                <div className="t"><T ta="தானியங்கி நினைவூட்டல்">One automatic reminder</T></div>
                <div className="muted small">
                  <T ta="WhatsApp கட்டணக் கோரிக்கை சில மணிநேரங்களாக செலுத்தப்படாமல் இருந்தால், வாடிக்கையாளருக்கு தானாக ஒரு பணிவான நினைவூட்டல் அனுப்பப்படும்.">
                    When a WhatsApp payment request is still unpaid after a few hours, the customer gets one polite reminder.
                  </T>
                </div>
              </div>
              <span className="pill ok"><T ta="இயங்குகிறது">On</T></span>
            </div>
            <div className="row">
              <div className="grow">
                <div className="t"><T ta="அனைவருக்கும் நினைவூட்டல் அனுப்பு">Remind everyone now</T></div>
                <div className="muted small">
                  <T ta="வசூலிக்க › அனைவருக்கும் நினைவூட்டு மூலம் காத்திருக்கும் அனைவருக்கும் கோரிக்கை மீண்டும் அனுப்பப்படும்.">
                    To collect › Remind everyone sends the request again to everyone waiting.
                  </T>
                </div>
              </div>
              <Link className="btn sm" href="/dashboard/revenue">
                <T ta="திற">Open</T>
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  } else {
    body = <CollectList rows={d.collect} nowMs={now} canOperate={scope.canOperate} />;
  }

  return (
    <PortalPage title="Payments" titleTa="பணம்" sub={SUB} subTa={SUB_TA} actions={scope.canOperate ? <RecordByNumber rows={d.collect} /> : undefined}>
      {kpis}
      {tabs}
      {body}
    </PortalPage>
  );
}
