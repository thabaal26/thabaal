import { Suspense } from "react";
import { ExternalLink } from "@/components/icons";
import Link from "@/components/intent-link";
import { INDIA_GST_RATE, RATES, spendSummary } from "@/lib/spend";
import { affordableMessages, walletBalance } from "@/lib/wallet";
import { T } from "./portal-ui";

/*
 * Home's WhatsApp money card, from live figures: a wallet client's Thabaal balance, or for everyone
 * else the prepaid Meta balance left (when it has been synced) or this month's WhatsApp spend, with
 * an estimate of marketing messages left. Streams in after the rest of Home (Meta may be slow).
 * Markup follows the portal design (portal.css classes).
 */

const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

/** "About 140 marketing messages left." Rounded down to a friendly figure; it's an estimate. */
function messagesLeftText(n: number) {
  if (!Number.isFinite(n)) return "";
  if (n <= 0) return "Not enough left for a marketing message.";
  const shown = n >= 1000 ? Math.floor(n / 100) * 100 : n >= 100 ? Math.floor(n / 10) * 10 : n;
  return `About ${shown.toLocaleString("en-IN")} marketing message${shown === 1 ? "" : "s"} left.`;
}

function Header() {
  return (
    <div className="hd" suppressHydrationWarning>
      <h2 suppressHydrationWarning>
        <T ta="வாட்ஸ்அப் செலவு">WhatsApp spend</T>
      </h2>
      <Link className="btn sm" href="/dashboard/report">
        <T ta="செலவுகள்">Costs</T>
      </Link>
    </div>
  );
}

function Bar({ pct, low }: { pct: number; low: boolean }) {
  return (
    <div className="bar" style={{ margin: "12px 0 6px" }} role="presentation">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: low ? "var(--bar3)" : "var(--bar2)" }} />
    </div>
  );
}

async function WalletBody({ clientId, isWallet, lowAlert, canManage }: { clientId: string; isWallet: boolean; lowAlert: number; canManage: boolean }) {
  if (isWallet) {
    const [balance, canSend] = await Promise.all([walletBalance(clientId).catch(() => null), affordableMessages(clientId, "MARKETING").catch(() => Infinity)]);
    if (balance === null) return <Unavailable />;
    const low = balance < lowAlert;
    return (
      <section className="card">
        <Header />
        <div className="stat">
          <div className="l">Balance</div>
          <div className="v">{money(balance)}</div>
        </div>
        <Bar pct={lowAlert > 0 ? (balance / (lowAlert * 4)) * 100 : 100} low={low} />
        <p className="small">
          {low && balance > 0 && <span className="pill warn">Low balance</span>} {messagesLeftText(canSend)}{" "}
          {balance <= 0 ? "Empty: campaigns are stopped until you add money." : low ? "Add money before your next campaign." : "Enough for your next campaigns."}
        </p>
        <div className="tools" style={{ marginTop: 12 }}>
          <Link className="btn primary sm" href="/dashboard/wallet">
            + Add money
          </Link>
        </div>
      </section>
    );
  }

  const s = await spendSummary(clientId).catch(() => null);
  if (!s) return <Unavailable />;
  const synced = s.metaAccount.liveBalance > 0 || s.prepaidFunds > 0;
  const left = s.remainingBalance;
  const low = synced && s.prepaidFunds > 0 && left / s.prepaidFunds < 0.2;
  const q = s.serviceQuota;
  return (
    <section className="card">
      <Header />
      {synced ? (
        <>
          <div className="stat">
            <div className="l">Balance</div>
            <div className="v">{money(left)}</div>
          </div>
          <Bar pct={s.prepaidFunds > 0 ? (left / s.prepaidFunds) * 100 : 0} low={low} />
          <p className="small">
            {low && <span className="pill warn">Low balance</span>} {messagesLeftText(Math.floor(left / (RATES.marketing * (1 + INDIA_GST_RATE))))}
            {low ? " Top up before your next campaign." : ""}
          </p>
          <p className="muted small" style={{ marginTop: 6 }}>
            {money(s.totalMonthSpentWithGst)} spent in {s.monthLabel}, incl. GST{s.liveSyncedFromMeta ? "" : " (estimate)"}. {q.freeRemaining.toLocaleString("en-IN")} of{" "}
            {q.totalFreeLimit.toLocaleString("en-IN")} free replies left this month.
          </p>
        </>
      ) : (
        <>
          <div className="stat" suppressHydrationWarning>
            <div className="l" suppressHydrationWarning>Spent on WhatsApp in {s.monthLabel}</div>
            <div className="v" suppressHydrationWarning>{money(s.totalMonthSpentWithGst)}</div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            Incl. GST{s.liveSyncedFromMeta ? ", from Meta" : " (estimate)"}. {q.freeRemaining.toLocaleString("en-IN")} of {q.totalFreeLimit.toLocaleString("en-IN")} free replies left this month.
          </p>
        </>
      )}
      <div className="tools" style={{ marginTop: 12 }}>
        {canManage && s.metaAccount.billingUrl && (
          <a className="btn primary sm" href={s.metaAccount.billingUrl} target="_blank" rel="noopener noreferrer">
            <T ta="மெட்டாவில் ரீசார்ஜ்">Recharge on Meta</T> <ExternalLink aria-hidden className="ic" style={{ width: 14, height: 14 }} />
          </a>
        )}
      </div>
    </section>
  );
}

function Unavailable() {
  return (
    <section className="card" suppressHydrationWarning>
      <Header />
      <p className="muted small">WhatsApp spend couldn&apos;t be loaded just now.</p>
    </section>
  );
}

function Loading() {
  return (
    <section className="card" aria-busy="true" suppressHydrationWarning>
      <Header />
      <div className="stat" suppressHydrationWarning>
        <div className="l">Balance</div>
        <div className="v muted">…</div>
      </div>
      <div className="bar" style={{ margin: "12px 0 6px" }} />
    </section>
  );
}

export function HomeWallet(props: { clientId: string; isWallet: boolean; lowAlert: number; canManage: boolean }) {
  return (
    <Suspense fallback={<Loading />}>
      <WalletBody {...props} />
    </Suspense>
  );
}
