import { Suspense } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/format";
import { ExternalLink, MessageCircle } from "@/components/icons";
import Link from "@/components/intent-link";
import { INDIA_GST_RATE, RATES, spendSummary } from "@/lib/spend";
import { affordableMessages, walletBalance } from "@/lib/wallet";
import { MetaBalanceForm } from "./meta-balance-form";
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

/** The card's artwork, as in the owner's reference: on a soft green curved panel, a green WhatsApp tile seen at a
 * slant with a white chat bubble behind it. Drawn here (two small SVGs; the slant is CSS), so it is sharp at any size and
 * follows dark mode. Decorative only: hidden from screen readers, never clickable, placed absolutely so it can't move
 * the figures (home.css .spend-card / .spend-art / .sa-*). */
function SpendArt() {
  return (
    <div aria-hidden className="spend-art">
      <div className="sa-mark">
        <svg className="sa-bubble" viewBox="0 0 120 96">
          <path d="M22 4h76a18 18 0 0 1 18 18v38a18 18 0 0 1-18 18H40l-20 14 4-14h-2A18 18 0 0 1 4 60V22A18 18 0 0 1 22 4z" />
          <rect x="24" y="30" width="58" height="8" rx="4" />
          <rect x="24" y="46" width="40" height="8" rx="4" />
        </svg>
        <svg className="sa-tile" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="sa-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5FE38E" />
              <stop offset=".55" stopColor="#22B45E" />
              <stop offset="1" stopColor="#12884A" />
            </linearGradient>
            <linearGradient id="sa-h" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity=".45" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="112" height="112" rx="30" fill="url(#sa-g)" />
          <rect x="10" y="8" width="100" height="50" rx="24" fill="url(#sa-h)" />
          <path className="sa-ring" d="M60 26a34 34 0 1 1-17.6 63.1L27 94l5-14.6A34 34 0 0 1 60 26z" />
          <path
            className="sa-phone"
            d="M75.6 69.1c-.9 2.5-4.6 4.6-7.2 4.9-1.9.2-4.4.3-12.9-3.2C44.8 66.4 37.9 55.6 37.4 54.9c-.5-.7-4.3-5.7-4.3-10.9s2.7-7.7 3.7-8.8c.9-1 2-1.2 2.7-1.2h1.9c.6 0 1.4-.1 2.2 1.8.9 2 2.8 7 3 7.5.3.5.4 1.1.1 1.8-.3.7-.5 1.1-1 1.7l-1.5 1.8c-.5.5-1 1-.4 2 .6 1 2.6 4.3 5.6 7 3.9 3.4 7.1 4.5 8.1 5 1 .5 1.6.4 2.2-.2.6-.7 2.5-2.9 3.2-3.9.7-1 1.3-.8 2.2-.5.9.3 5.8 2.7 6.8 3.2s1.7.7 1.9 1.2c.3.4.3 2.6-.6 5.1z"
          />
        </svg>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="hd" suppressHydrationWarning>
      <div className="hd-ico">
        <span aria-hidden className="ico-tile" data-tone="green">
          <MessageCircle />
        </span>
        <h2 suppressHydrationWarning>
          <T ta="வாட்ஸ்அப் செலவு">WhatsApp spend</T>
        </h2>
      </div>
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
      <section className="card spend-card">
        <SpendArt />
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
  const synced = Boolean(s.balanceFrom) || s.prepaidFunds > 0;
  const from = s.balanceFrom;
  const left = s.remainingBalance;
  const low = synced && s.prepaidFunds > 0 && left / s.prepaidFunds < 0.2;
  const q = s.serviceQuota;
  return (
    <section className="card spend-card">
      <SpendArt />
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
          {from && (
            <p className="muted small" style={{ marginTop: 6 }} suppressHydrationWarning>
              {money(from.synced)} on Meta at {formatInTimeZone(from.syncedAt, APP_TZ, "d MMM, h:mm a")}
              {from.added > 0 ? ` + ${money(from.added)} added` : ""} − {money(from.spentWithGst)} spent since (incl. GST
              {from.fromMeta ? ", from Meta" : ", estimate"}).
            </p>
          )}
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
        {canManage && s.metaAccount.wabaId && <MetaBalanceForm wabaId={s.metaAccount.wabaId} hasBalance={synced} />}
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
    <section className="card spend-card" aria-busy="true" suppressHydrationWarning>
      <SpendArt />
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
