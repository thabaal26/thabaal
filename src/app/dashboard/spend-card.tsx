import { ExternalLink, Trash2 } from "@/components/icons";
import { cache, Suspense } from "react";
import { ActionButton } from "@/components/action-button";
import { Wallet3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader, Skeleton } from "@/components/ui";
import { Disclosure } from "@/components/viz";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import { senderFor } from "@/lib/senders";
import { CATEGORY_LABEL, RATES, spendSummary, total } from "@/lib/spend";
import { deleteTopUp } from "./actions/spend";
import { SpendAnalyticsCharts } from "./spend-charts";
import { TopUpForm } from "./top-up-form";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Read once per request: the card's header and body both use it. */
const loadSpend = cache(async (clientId: string) => {
  const [s, { number }] = await Promise.all([spendSummary(clientId), senderFor(clientId)]);
  return { s, number };
});

/**
 * Message spend synced live from Meta's `pricing_analytics` Graph API (with local DB fallback when offline),
 * alongside the prepaid balance recorded for the client's WhatsApp account — visualized with Apache ECharts.
 *
 * The card frame and title show with the rest of the Overview; what comes from Meta (spend, balance,
 * the live badge) streams in when it arrives, so the page never waits on Meta.
 */
export function SpendCard({ clientId, canManage, className }: { clientId: string; canManage: boolean; className?: string }) {
  return (
    <Card className={cn("card-3d", className)}>
      <CardHeader
        tone="gold"
        icon={<Wallet3D />}
        title="Meta WhatsApp spend & wallet telemetry"
        description={
          <Suspense fallback="Loading spend from Meta…">
            <SpendDescription clientId={clientId} />
          </Suspense>
        }
        action={
          <Suspense fallback={null}>
            <SpendActions clientId={clientId} />
          </Suspense>
        }
      />
      <Suspense fallback={<SpendBodySkeleton />}>
        <SpendBody clientId={clientId} canManage={canManage} />
      </Suspense>
    </Card>
  );
}

async function SpendDescription({ clientId }: { clientId: string }) {
  const { s } = await loadSpend(clientId);
  return <>{s.liveSyncedFromMeta ? "Live from Meta pricing_analytics Graph API · Apache ECharts spend & volume analysis" : "Estimated at Meta's India conversation rates · Apache ECharts spend & volume analysis"}</>;
}

async function SpendActions({ clientId }: { clientId: string }) {
  const { s } = await loadSpend(clientId);
  const acc = s.metaAccount;
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {s.liveSyncedFromMeta && (
        <Badge tone="green" dot>
          Live Meta sync
        </Badge>
      )}
      <a href={acc.billingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
        Billing Hub <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(opens Meta Business Suite)</span>
      </a>
    </div>
  );
}

function SpendBodySkeleton() {
  return (
    <div aria-busy="true">
      <div className="grid grid-cols-2 gap-3 border-b border-line p-3 sm:grid-cols-4 sm:p-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <div className="p-3 sm:p-5">
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}

async function SpendBody({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { s, number } = await loadSpend(clientId);
  const acc = s.metaAccount;
  const wabaId = number?.businessAccountId || acc.wabaId;
  // Show balance when the WABA matches or when top-ups/syncs have been recorded for this client.
  const recorded = Boolean((number?.businessAccountId && acc.wabaId === number.businessAccountId) || s.topUps.length > 0 || new Date(s.lastSyncedAt).getTime() > 0);
  const low = recorded && s.remainingBalance < 50;

  // Estimate how many more marketing and utility messages (incl. 18% GST) the current balance can fund
  const mktRateWithGst = RATES.marketing * 1.18;
  const utilRateWithGst = RATES.utility * 1.18;
  const estMarketingRunway = recorded && mktRateWithGst > 0 ? Math.max(0, Math.floor(s.remainingBalance / mktRateWithGst)) : 0;
  const estUtilityRunway = recorded && utilRateWithGst > 0 ? Math.max(0, Math.floor(s.remainingBalance / utilRateWithGst)) : 0;
  const totalLastMonthSpent = total(s.previous);
  const lastSyncedLabel = new Date(s.lastSyncedAt).getTime() > 0 ? `synced ${fmtDate(new Date(s.lastSyncedAt), "d MMM, h:mm a")}` : "last recorded";

  return (
    <>
      {/* Top 4-KPI Summary Strip */}
      <dl className="grid grid-cols-2 divide-x divide-y divide-line border-b border-line bg-subtle/30 sm:grid-cols-4 sm:divide-y-0">
        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5">
          <dt className="text-[11px] text-muted sm:text-xs">{s.monthLabel} so far (ex-GST)</dt>
          <dd className="tabular mt-0.5 text-base font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(s.totalMonthSpent)}</dd>
          <dd className="tabular mt-0.5 text-[10px] text-muted sm:text-2xs">
            {s.totalMonthSpent > 0 ? `${rupees(s.totalMonthSpentWithGst)} incl. 18% GST` : "No charges yet"}
          </dd>
        </div>

        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5">
          <dt className="text-[11px] text-muted sm:text-xs">{s.lastMonthLabel}</dt>
          <dd className="tabular mt-0.5 text-base font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(totalLastMonthSpent)}</dd>
          <dd className="tabular mt-0.5 text-[10px] text-muted sm:text-2xs">
            {s.metaTotalDelivered > 0 ? `${fmtNumber(s.metaTotalDelivered)} delivered on Meta` : `${fmtNumber(s.previous.reduce((a, r) => a + r.charged, 0))} charged`}
          </dd>
        </div>

        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5">
          <dt className="text-[11px] text-muted sm:text-xs">Prepaid wallet</dt>
          <dd className={cn("tabular mt-0.5 text-base font-semibold leading-tight sm:mt-1 sm:text-xl", low ? "text-warning" : "text-ink")}>
            {recorded ? rupees(s.remainingBalance) : "—"}
          </dd>
          <dd className="tabular mt-0.5 text-[10px] text-muted sm:text-2xs">
            {recorded ? `~${fmtNumber(estMarketingRunway)} mktg · ~${fmtNumber(estUtilityRunway)} util msgs` : "Not synced yet"}
          </dd>
        </div>

        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5">
          <dt className="text-[11px] text-muted sm:text-xs">Free 24h Service Quota</dt>
          <dd className="tabular mt-0.5 text-base font-semibold leading-tight text-success sm:mt-1 sm:text-xl">
            {fmtNumber(s.serviceQuota.freeRemaining)} <span className="text-xs font-medium text-muted">/ {fmtNumber(s.serviceQuota.totalFreeLimit)} left</span>
          </dd>
          <dd className="tabular mt-0.5 text-[10px] text-muted sm:text-2xs">
            1,000 free/mo per number · {fmtNumber(s.serviceQuota.freeUsed)} used
          </dd>
        </div>
      </dl>

      {/* Main Apache ECharts Analytics Grid (Wallet Gauge + Category Donut + 14-Day Spend/Volume ColumnChart) */}
      <SpendAnalyticsCharts
        monthLabel={s.monthLabel}
        lastMonthLabel={s.lastMonthLabel}
        totalMonthSpent={s.totalMonthSpent}
        totalMonthSpentWithGst={s.totalMonthSpentWithGst}
        totalLastMonthSpent={totalLastMonthSpent}
        remainingBalance={s.remainingBalance}
        recorded={recorded}
        low={low}
        accountName={acc.accountName}
        billingUrl={acc.billingUrl}
        lastSyncedLabel={lastSyncedLabel}
        estMarketingRunway={estMarketingRunway}
        estUtilityRunway={estUtilityRunway}
        current={s.current}
        previous={s.previous}
        daily={s.daily}
        serviceQuota={s.serviceQuota}
        rates={RATES}
        categoryLabels={CATEGORY_LABEL}
        monthOrdersCount={s.monthOrdersCount}
        monthOrderRevenue={s.monthOrderRevenue}
      />

      {/* Collapsible Details: Per-Phone Spend, Recent Top-Ups & Admin Wallet Sync */}
      {(s.byPhone.length > 0 || s.topUps.length > 0 || canManage) && (
        <Disclosure
          summary={
            <span className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span>Wallet sync, top-ups &amp; per-number breakdown</span>
              <span className="text-[11px] font-normal text-muted">
                · Mktg ₹{RATES.marketing}, Util ₹{RATES.utility}, Service 1,000 free/mo then ₹{RATES.service} (+18% GST)
              </span>
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-4 pt-1 lg:grid-cols-2">
            <div className="space-y-3">
              {s.byPhone.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">{s.monthLabel} by WhatsApp number</p>
                  <ul className="divide-y divide-line rounded-control border border-line bg-subtle/30 px-3 text-xs">
                    {s.byPhone.map((p) => (
                      <li key={p.phone} className="flex items-center justify-between gap-2 py-2">
                        <span className="tabular font-medium text-ink">+{p.phone}</span>
                        <span className="tabular text-muted">
                          {fmtNumber(p.charged)} paid{p.free ? ` · ${fmtNumber(p.free)} free` : ""} · <b className="font-semibold text-ink">{rupees(p.cost)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.topUps.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">Recent top-ups</p>
                  <ul className="divide-y divide-line rounded-control border border-line bg-subtle/30 px-3 text-xs">
                    {s.topUps.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                        <div className="min-w-0">
                          <span className="tabular font-medium text-ink">{rupees(t.amount)}</span>
                          {t.note && <span className="text-muted"> · {t.note}</span>}
                          <span className="block text-2xs text-muted">{fmtDate(t.createdAt, "d MMM yyyy")}</span>
                        </div>
                        {canManage && (
                          <ActionButton action={deleteTopUp.bind(null, t.id)} variant="ghost" size="sm" confirm="Remove this top-up record?" title="Remove top-up">
                            <Trash2 aria-hidden className="size-3.5 text-muted hover:text-danger" />
                            <span className="sr-only">Remove top-up</span>
                          </ActionButton>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {canManage && (
              <div>
                <TopUpForm clientId={clientId} wabaId={wabaId} />
              </div>
            )}
          </div>
        </Disclosure>
      )}
    </>
  );
}
