import { ExternalLink, Trash2, Wallet } from "@/components/icons";
import { cache, Suspense } from "react";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, CardHeader, Skeleton } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { Disclosure } from "@/components/viz";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { senderFor } from "@/lib/senders";
import { CATEGORY_LABEL, RATES, spendSummary, total } from "@/lib/spend";
import { deleteTopUp } from "./actions/spend";
import { SpendAnalyticsCharts } from "./spend-charts";
import { TopUpForm } from "./top-up-form";
import { T } from "./portal-ui";

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
        icon={<Wallet className="size-5 shrink-0" />}
        title={<T ta="Meta WhatsApp செலவு மற்றும் வாலட் தகவல்">Meta WhatsApp spend & wallet telemetry</T>}
        description={
          <Suspense fallback={<T ta="Meta-விலிருந்து செலவு விவரங்கள் பெறப்படுகின்றன…">Loading spend from Meta…</T>}>
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
  return (
    <>
      {s.liveSyncedFromMeta ? (
        <T ta="Meta pricing_analytics Graph API நேரலை · Apache ECharts செலவு மற்றும் அளவு பகுப்பாய்வு">
          Live from Meta pricing_analytics Graph API · Apache ECharts spend & volume analysis
        </T>
      ) : (
        <T ta="Meta-வின் இந்திய கட்டண அடிப்படையில் மதிப்பிடப்பட்டது · Apache ECharts செலவு மற்றும் அளவு பகுப்பாய்வு">
          Estimated at Meta&apos;s India conversation rates · Apache ECharts spend & volume analysis
        </T>
      )}
    </>
  );
}

async function SpendActions({ clientId }: { clientId: string }) {
  const { s } = await loadSpend(clientId);
  const acc = s.metaAccount;
  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {s.liveSyncedFromMeta && (
        <Badge tone="green" dot>
          <T ta="நேரலை Meta இணைப்பு">Live Meta sync</T>
        </Badge>
      )}
      <a href={acc.billingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
        <T ta="கட்டண மையம்">Billing Hub</T> <ExternalLink aria-hidden className="size-3.5 shrink-0" />
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
        <div className="px-2.5 py-2 sm:px-5 sm:py-3.5">
          <dt className="truncate text-[10.5px] text-muted sm:text-xs">
            {s.monthLabel} <T ta="இதுவரை (GST தவிர)">so far (ex-GST)</T>
          </dt>
          <dd className="tabular mt-0.5 truncate text-[15px] font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(s.totalMonthSpent)}</dd>
          <dd className="tabular mt-0.5 truncate text-[10px] text-muted sm:text-2xs">
            {s.totalMonthSpent > 0 ? (
              <>
                {rupees(s.totalMonthSpentWithGst)} <T ta="18% GST உட்பட">incl. 18% GST</T>
              </>
            ) : (
              <T ta="கட்டணங்கள் இல்லை">No charges yet</T>
            )}
          </dd>
        </div>

        <div className="px-2.5 py-2 sm:px-5 sm:py-3.5">
          <dt className="truncate text-[10.5px] text-muted sm:text-xs">{s.lastMonthLabel}</dt>
          <dd className="tabular mt-0.5 truncate text-[15px] font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(totalLastMonthSpent)}</dd>
          <dd className="tabular mt-0.5 truncate text-[10px] text-muted sm:text-2xs">
            {s.metaTotalDelivered > 0 ? (
              <>
                {fmtNumber(s.metaTotalDelivered)} <T ta="Meta-வில் வழங்கப்பட்டது">delivered on Meta</T>
              </>
            ) : (
              <>
                {fmtNumber(s.previous.reduce((a, r) => a + r.charged, 0))} <T ta="கட்டணம் வசூலிக்கப்பட்டது">charged</T>
              </>
            )}
          </dd>
        </div>

        <div className="px-2.5 py-2 sm:px-5 sm:py-3.5">
          <dt className="truncate text-[10.5px] text-muted sm:text-xs">
            <T ta="ப்ரீபெய்ட் வாலட்">Prepaid wallet</T>
          </dt>
          <dd className={cn("tabular mt-0.5 truncate text-[15px] font-semibold leading-tight sm:mt-1 sm:text-xl", low ? "text-warning" : "text-ink")}>
            {recorded ? rupees(s.remainingBalance) : "—"}
          </dd>
          <dd className="tabular mt-0.5 truncate text-[10px] text-muted sm:text-2xs">
            {recorded ? (
              <T ta={`~${fmtNumber(estMarketingRunway)} விளம்பரம் · ~${fmtNumber(estUtilityRunway)} சேவை செய்திகள்`}>
                {`~${fmtNumber(estMarketingRunway)} mktg · ~${fmtNumber(estUtilityRunway)} util msgs`}
              </T>
            ) : (
              <T ta="இன்னும் இணைக்கப்படவில்லை">Not synced yet</T>
            )}
          </dd>
        </div>

        <div className="px-2.5 py-2 sm:px-5 sm:py-3.5">
          <dt className="truncate text-[10.5px] text-muted sm:text-xs">
            <T ta="24 மணிநேர இலவச சேவை வரம்பு">Free 24h Service Quota</T>
          </dt>
          <dd className="tabular mt-0.5 truncate text-[15px] font-semibold leading-tight text-success sm:mt-1 sm:text-xl">
            {fmtNumber(s.serviceQuota.freeRemaining)} <span className="text-[11px] font-medium text-muted sm:text-xs">/ {fmtNumber(s.serviceQuota.totalFreeLimit)}</span>
          </dd>
          <dd className="tabular mt-0.5 truncate text-[10px] text-muted sm:text-2xs">
            <T ta={`ஒரு எண்ணிற்கு மாதம் 1,000 இலவசம் · ${fmtNumber(s.serviceQuota.freeUsed)} பயன்படுத்தப்பட்டது`}>
              {`1,000 free/mo per number · ${fmtNumber(s.serviceQuota.freeUsed)} used`}
            </T>
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
              <span>
                <T ta="வாலட் இணைப்பு, ரீசார்ஜ்கள் மற்றும் எண் வாரியாக விவரம்">Wallet sync, top-ups &amp; per-number breakdown</T>
              </span>
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
                  <p className="mb-1.5 text-xs font-medium text-muted">
                    {s.monthLabel} <T ta="WhatsApp எண் வாரியாக">by WhatsApp number</T>
                  </p>
                  <ul className="divide-y divide-line rounded-control border border-line bg-subtle/30 px-3 text-xs">
                    {s.byPhone.map((p) => (
                      <li key={p.phone} className="flex items-center justify-between gap-2 py-2">
                        <span className="tabular font-medium text-ink">{formatPhone(p.phone)}</span>
                        <span className="tabular text-muted">
                          {fmtNumber(p.charged)} <T ta="கட்டணம்">paid</T>{p.free ? ` · ${fmtNumber(p.free)} இலவசம்` : ""} · <b className="font-semibold text-ink">{rupees(p.cost)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.topUps.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted">
                    <T ta="சமீபத்திய ரீசார்ஜ்கள்">Recent top-ups</T>
                  </p>
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
                            <Trash2 aria-hidden className="size-3.5 shrink-0 text-muted hover:text-danger" />
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
