import type { Metadata } from "next";
import { AlertCircle, Banknote, Clock, IndianRupee } from "@/components/icons";
import { PickClientNotice, Stat } from "@/components/ui";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { paymentsData, WAY_COLOR, WAY_LABEL, WAY_LABEL_TA, type Way } from "@/lib/payments-data";
import { getScope } from "@/lib/session";
import { getCatalogWithProducts } from "@/lib/catalog";
import { paySettingsFor } from "@/lib/pay-settings-server";
import { LoyaltyRedeemSetting } from "../orders/loyalty-points-ui";
import { inr } from "../portal-format";
import { LinkTabs, PortalPage, Seg, T } from "../portal-ui";
import { BankAccount, HowCustomersPay, ReminderRules } from "./pay-settings-form";
import { CollectList, CsvButton, ReceiptButton, RecordByNumber, TxnTable } from "./payments-board";
import Link from "@/components/intent-link";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { planGate } from "@/app/dashboard/plan-lock";
import { LiveRefresh } from "@/components/live-refresh";
import { RefreshButton } from "@/components/refresh-button";

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
  { id: "w", label: "Last 7 days", ta: "கடந்த 7 நாட்கள்" },
  { id: "m", label: "Last 30 days", ta: "கடந்த 30 நாட்கள்" },
] as const;

const SUB = "Money received, money waiting and what you should collect today.";
const SUB_TA = "வந்த பணம், வர வேண்டிய பணம், இன்று வசூலிக்க வேண்டியவை.";

/** Payments (portal design): to collect, received, cash on delivery, every transaction, settings. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locked = await planGate("orders");
  if (locked) return locked;
  const sp = await searchParams;
  const scope = await getScope();
  const tab: TabId = TABS.some((t) => t.id === sp.tab) ? (sp.tab as TabId) : "collect";
  const per = sp.per === "w" || sp.per === "m" ? sp.per : "t";
  const way = typeof sp.way === "string" && sp.way in WAY_LABEL ? (sp.way as Way) : "";
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ tab: tab === "collect" ? undefined : tab, per: per === "t" ? undefined : per, way: way || undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/dashboard/revenue${q.size ? `?${q}` : ""}`;
  };
  // The Cash / COD tab shows only while cash on delivery is on (Payment settings).
  const tabsFor = (codOn: boolean) => (
    <LinkTabs
      label="Payments views"
      current={tab}
      tabs={TABS.filter((t) => codOn || t.id !== "cod" || tab === "cod").map((t) => ({ ...t, href: t.id === "collect" ? "/dashboard/revenue" : `/dashboard/revenue?tab=${t.id}` }))}
    />
  );
  const tabs = tabsFor(true);

  if (!scope.clientId)
    return (
      <PortalPage title="Payments" titleTa="பணம்" sub={SUB} subTa={SUB_TA}>
        {tabs}
        <PickClientNotice what="payments" />
      </PortalPage>
    );
  const clientId = scope.clientId;

  const [d, pay] = await Promise.all([paymentsData(clientId, per), paySettingsFor(clientId)]);
  const now = new Date().getTime();
  const toCollect = d.collect.filter((r) => !r.cod).reduce((n, r) => n + r.due, 0);
  const codPending = d.collect.filter((r) => r.cod).reduce((n, r) => n + r.due, 0);
  const failed = d.collect.filter((r) => r.state === "failed").length;
  const claimed = d.collect.filter((r) => r.state === "claimed").length;

  const kpis = (
    <StaggerGroup className="grid g4 keep2" style={{ marginBottom: 16 }}>
      <StaggerItem index={0} className="h-full">
        <Stat
          label="Received today"
          value={inr(d.receivedToday)}
          sub="Money in your account"
          icon={<IndianRupee className="size-4 shrink-0" />}
          tone="brand"
          href="/dashboard/revenue?tab=got"
        />
      </StaggerItem>
      <StaggerItem index={1} className="h-full">
        <Stat
          label="Money to collect"
          value={inr(toCollect)}
          sub={claimed ? `${claimed} say they paid · check` : "Not paid yet"}
          icon={<Clock className="size-4 shrink-0" />}
          tone="amber"
          href="/dashboard/revenue?tab=collect"
        />
      </StaggerItem>
      <StaggerItem index={2} className="h-full">
        <Stat
          label="COD pending"
          value={inr(codPending)}
          sub="Collect during delivery"
          icon={<Banknote className="size-4 shrink-0" />}
          tone="info"
          href="/dashboard/revenue?tab=cod"
        />
      </StaggerItem>
      <StaggerItem index={3} className="h-full">
        <Stat
          label="Failed or expired"
          value={failed}
          sub={failed ? "Needs your attention" : "Nothing stuck"}
          icon={<AlertCircle className="size-4 shrink-0" />}
          tone={failed ? "rose" : "brand"}
          href="/dashboard/revenue?tab=collect"
        />
      </StaggerItem>
    </StaggerGroup>
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
            <table className="mcards">
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
                    <td data-m="title">
                      <b>{r.name}</b>
                    </td>
                    <td>
                      <span className={`pill ${r.way === "cash" ? "info" : "ok"}`}>
                        <T ta={WAY_LABEL_TA[r.way]}>{WAY_LABEL[r.way]}</T>
                      </span>
                    </td>
                    <td className="num" data-m="amount">{inr(r.amount)}</td>
                    <td data-m="end">
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
  } else if (tab === "cod" && !pay.settings.codOn) {
    body = (
      <div className="note">
        <T ta="டெலிவரியின் போது பணம் (COD) முடக்கப்பட்டுள்ளது. ">Cash on delivery is off. </T>
        <Link href="/dashboard/revenue?tab=set">
          <b><T ta="பண அமைப்புகளில் இயக்கவும்">Turn it on in Payment settings</T></b>
        </Link>
        .
      </div>
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
    body = (
      <>
        <TxnTable rows={d.txns.map((t) => ({ ...t, when: fmtDate(new Date(t.atMs), "d MMM, h:mm a") }))} canOperate={scope.canOperate} />
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          <T ta="கடந்த 90 நாட்களின் பரிவர்த்தனைகள்.">Showing the last 90 days.</T>
        </p>
      </>
    );
  } else if (tab === "set") {
    const [client, ownPaymentTemplate, paymentTemplate, catalogue] = await Promise.all([
      db.client.findUnique({ where: { id: clientId }, select: { loyaltyAutoRedeem: true } }),
      db.template.findFirst({ where: { clientId, name: PAYMENT_TEMPLATE }, select: { status: true } }),
      paymentTemplateFor(clientId),
      // Whether a catalogue is connected; null when Meta couldn't be asked (the badge is then left out).
      getCatalogWithProducts(clientId)
        .then((c) => Boolean(c.catalogId))
        .catch(() => null),
    ]);
    body = (
      <div className="stack">
        <HowCustomersPay
          settings={pay.settings}
          paymentConfig={pay.paymentConfig}
          catalogue={catalogue}
          canManage={scope.canManage}
          payTemplate={{ using: paymentTemplate?.name ?? null, ownName: PAYMENT_TEMPLATE, ownStatus: ownPaymentTemplate?.status ?? null }}
        />
        {scope.canManage && <BankAccount settings={pay.settings} />}
        <ReminderRules settings={pay.settings} canManage={scope.canManage} />
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
      </div>
    );
  } else {
    body = <CollectList rows={d.collect} nowMs={now} canOperate={scope.canOperate} />;
  }

  return (
    <PortalPage title="Payments" titleTa="பணம்" sub={SUB} subTa={SUB_TA} actions={<><RefreshButton />{scope.canOperate && <RecordByNumber rows={d.collect} />}</>}>
      <LiveRefresh />
      {kpis}
      {tabsFor(pay.settings.codOn)}
      <ScrollReveal duration={450}>
        {body}
      </ScrollReveal>
    </PortalPage>
  );
}
