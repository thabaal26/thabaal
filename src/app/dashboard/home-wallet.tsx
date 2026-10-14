import { Suspense } from "react";
import { ExternalLink } from "@/components/icons";
import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";
import { spendSummary } from "@/lib/spend";
import { walletBalance } from "@/lib/wallet";

/*
 * Home's WhatsApp money card, from live figures: a wallet client's Thabaal balance, or for everyone
 * else this month's WhatsApp spend, the prepaid Meta balance left (when it has been synced) and the
 * free replies left this month. It streams in after the rest of Home (Meta may be slow to answer).
 */

const card = "flex flex-col justify-between rounded-card border-[1.5px] border-line bg-panel p-5 shadow-card";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const smallBtn = "inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-semibold transition";

function Bar({ pct, low }: { pct: number; low: boolean }) {
  return (
    <div className="my-3 h-2.5 overflow-hidden rounded-full bg-track" role="presentation">
      <div className={cn("h-full rounded-full", low ? "bg-danger-solid" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Header() {
  return (
    <div className="mb-3.5 flex items-center justify-between gap-2">
      <h2 className="font-display text-[19px] font-semibold text-ink">WhatsApp wallet</h2>
      <Link href="/dashboard/revenue?tab=costs" className="inline-flex min-h-[32px] items-center justify-center rounded-[10px] border-[1.5px] border-line px-3 text-[13.5px] font-semibold text-muted transition hover:text-ink">
        Costs
      </Link>
    </div>
  );
}

async function WalletBody({ clientId, isWallet, lowAlert, canManage }: { clientId: string; isWallet: boolean; lowAlert: number; canManage: boolean }) {
  if (isWallet) {
    const balance = await walletBalance(clientId).catch(() => null);
    if (balance === null) return <Unavailable />;
    const low = balance < lowAlert;
    return (
      <section className={card}>
        <div>
          <Header />
          <div className="text-[13.5px] font-medium text-muted">Wallet balance</div>
          <div className="tabular mt-0.5 font-display text-[26px] font-semibold text-ink">{inr(balance)}</div>
          <Bar pct={lowAlert > 0 ? (balance / (lowAlert * 4)) * 100 : 100} low={low} />
          <p className="text-[13px] text-muted">{balance <= 0 ? "Empty: campaigns are stopped until you add money." : low ? "Running low. Add money so campaigns keep going." : "Enough for your next campaigns."}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Link href="/dashboard/wallet" className={cn(smallBtn, "bg-brand text-on-brand hover:brightness-105")}>
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
    <section className={card}>
      <div>
        <Header />
        {synced ? (
          <>
            <div className="text-[13.5px] font-medium text-muted">Meta balance left</div>
            <div className="tabular mt-0.5 font-display text-[26px] font-semibold text-ink">
              {inr(left)} <span className="font-ui text-[14px] font-normal text-muted">of {inr(Math.round(s.prepaidFunds))}</span>
            </div>
            <Bar pct={s.prepaidFunds > 0 ? (left / s.prepaidFunds) * 100 : 0} low={low} />
          </>
        ) : (
          <>
            <div className="text-[13.5px] font-medium text-muted">Spent on WhatsApp in {s.monthLabel}</div>
            <div className="tabular mt-0.5 font-display text-[26px] font-semibold text-ink">{inr(s.totalMonthSpentWithGst)}</div>
            <div className="my-3 h-px bg-line" />
          </>
        )}
        <p className="text-[13px] text-muted">
          {synced ? `${inr(s.totalMonthSpentWithGst)} spent in ${s.monthLabel}, incl. GST${s.liveSyncedFromMeta ? "" : " (estimate)"}. ` : `Incl. GST${s.liveSyncedFromMeta ? ", from Meta" : " (estimate)"}. `}
          {q.freeRemaining.toLocaleString("en-IN")} of {q.totalFreeLimit.toLocaleString("en-IN")} free replies left this month.
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Link href="/dashboard/revenue?tab=costs" className={cn(smallBtn, "border-[1.5px] border-line text-ink hover:border-ink")}>
          Spend breakdown
        </Link>
        {canManage && s.metaAccount.billingUrl && (
          <a href={s.metaAccount.billingUrl} target="_blank" rel="noopener noreferrer" className={cn(smallBtn, "bg-brand text-on-brand hover:brightness-105")}>
            Recharge on Meta <ExternalLink aria-hidden className="size-3.5" />
          </a>
        )}
      </div>
    </section>
  );
}

function Unavailable() {
  return (
    <section className={card}>
      <div>
        <Header />
        <p className="text-[13.5px] text-muted">WhatsApp costs couldn&apos;t be loaded just now. Open Costs to try again.</p>
      </div>
    </section>
  );
}

function Loading() {
  return (
    <section className={card} aria-busy="true">
      <div>
        <Header />
        <div className="h-4 w-32 animate-pulse rounded bg-sunken" />
        <div className="mt-2 h-8 w-40 animate-pulse rounded bg-sunken" />
        <div className="my-3 h-2.5 animate-pulse rounded-full bg-sunken" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-sunken" />
      </div>
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
