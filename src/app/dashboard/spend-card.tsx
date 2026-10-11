import { ExternalLink, Lightbulb, Trash2 } from "@/components/icons";
import { ActionButton } from "@/components/action-button";
import { Wallet3D } from "@/components/icons-3d";
import { Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import { cssColor, type ChartColor } from "@/lib/chart-theme";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import { senderFor } from "@/lib/senders";
import { CATEGORY_LABEL, RATES, spendSummary, total, type SpendRow } from "@/lib/spend";
import { deleteTopUp } from "./actions/spend";
import { TopUpForm } from "./top-up-form";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CAT_COLORS: Record<string, ChartColor> = {
  marketing: "gold",
  utility: "blue",
  authentication: "violet",
  service: "emerald",
};
const catColor = (c: string) => cssColor(CAT_COLORS[c] ?? "neutral");

function SpendRows({ rows }: { rows: SpendRow[] }) {
  if (!rows.length) return <p className="py-2 text-sm text-muted">No charged messages yet.</p>;
  const maxCost = Math.max(1, ...rows.map((r) => r.cost), 1);
  const totalCost = rows.reduce((acc, r) => acc + r.cost, 0);

  return (
    <div className="mt-2 space-y-2.5">
      {/* Stacked Category Distribution Bar */}
      {totalCost > 0 && (
        <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
          {rows
            .filter((r) => r.cost > 0)
            .map((r) => (
              <div
                key={r.category}
                className="bar h-full min-w-1.5 first:rounded-l-full last:rounded-r-full"
                style={{ flexGrow: r.cost, flexBasis: 0, background: catColor(r.category) }}
                title={`${CATEGORY_LABEL[r.category] ?? r.category}: ${rupees(r.cost)}`}
              />
            ))}
        </div>
      )}

      <ul className="space-y-2">
        {rows.map((r) => {
          const color = catColor(r.category);
          const barW = r.cost > 0 ? Math.max(6, pct(r.cost, maxCost)) : r.free > 0 ? 100 : 0;
          return (
            <li key={r.category} className="rounded-control border border-line bg-subtle/40 px-3 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <span className="size-2.5 rounded-full" style={{ background: color }} />
                  {CATEGORY_LABEL[r.category] ?? r.category}
                </span>
                <span className="tabular font-semibold text-ink">{r.cost ? rupees(r.cost) : "₹0.00 (Free)"}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-track">
                <div
                  className="bar h-full rounded-full"
                  style={{ width: `${barW}%`, background: color }}
                />
              </div>
              <p className="mt-1 text-2xs text-muted">
                {fmtNumber(r.charged)} charged{r.free ? ` · ${fmtNumber(r.free)} free in 24h window` : ""}
                {RATES[r.category] ? ` · ₹${RATES[r.category]}/msg` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Message spend synced live from Meta's `pricing_analytics` Graph API (with local DB fallback when offline),
 * alongside the prepaid balance recorded for the client's WhatsApp account.
 */
export async function SpendCard({ clientId, canManage, className }: { clientId: string; canManage: boolean; className?: string }) {
  const [s, { number }] = await Promise.all([spendSummary(clientId), senderFor(clientId)]);
  const acc = s.metaAccount;
  const wabaId = number?.businessAccountId || acc.wabaId;
  // Show balance when the WABA matches or when top-ups/syncs have been recorded for this client.
  const recorded = Boolean((number?.businessAccountId && acc.wabaId === number.businessAccountId) || s.topUps.length > 0 || new Date(s.lastSyncedAt).getTime() > 0);
  const low = recorded && s.remainingBalance < 50;

  // Estimate how many more marketing messages (incl. 18% GST) the current balance can fund
  const mktRateWithGst = RATES.marketing * 1.18;
  const estMarketingRunway = recorded && mktRateWithGst > 0 ? Math.max(0, Math.floor(s.remainingBalance / mktRateWithGst)) : 0;
  const freeServiceCount = s.current.reduce((acc, r) => acc + r.free, 0);
  const estSavedByFreeWindow = freeServiceCount * RATES.marketing;
  const runwayPct = Math.min(100, Math.max(4, Math.round((s.remainingBalance / 500) * 100)));

  return (
    <Card className={cn("card-3d", className)}>
      <CardHeader
        tone="gold"
        icon={<Wallet3D />}
        title="Meta WhatsApp spend & wallet telemetry"
        description={s.liveSyncedFromMeta ? "Live from Meta pricing_analytics Graph API" : "Estimated at Meta's India conversation rates"}
        action={
          <div className="flex items-center gap-2">
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
        }
      />
      <dl className="grid grid-cols-2 divide-x divide-line border-b border-line bg-subtle/30">
        <div className="px-3.5 py-3 sm:px-5 sm:py-4">
          <dt className="text-[11px] text-muted sm:text-xs">{s.monthLabel} so far (ex-GST)</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(s.totalMonthSpent)}</dd>
          {s.totalMonthSpent > 0 && (
            <dd className="tabular mt-0.5 text-2xs text-muted">
              {rupees(s.totalMonthSpentWithGst)} incl. 18% GST
            </dd>
          )}
        </div>
        <div className="px-3.5 py-3 sm:px-5 sm:py-4">
          <dt className="text-[11px] text-muted sm:text-xs">{s.lastMonthLabel}</dt>
          <dd className="tabular mt-0.5 text-lg font-semibold leading-tight text-ink sm:mt-1 sm:text-xl">{rupees(total(s.previous))}</dd>
          {s.metaTotalDelivered > 0 && (
            <dd className="tabular mt-0.5 text-2xs text-muted">
              {fmtNumber(s.metaTotalDelivered)} delivered on Meta
            </dd>
          )}
        </div>
      </dl>

      <div className="space-y-3 p-3 sm:space-y-4 sm:p-5">
        <div className={cn("rounded-control border p-3 sm:p-3.5", low ? "border-warning-border bg-warning-bg" : "border-line bg-subtle")}>
          {recorded ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink-2">
                  Prepaid wallet · {new Date(s.lastSyncedAt).getTime() > 0 ? `synced ${fmtDate(new Date(s.lastSyncedAt), "d MMM, h:mm a")}` : "last recorded"}
                </p>
                {low ? (
                  <Badge tone="amber" dot>
                    Low balance · Top up soon
                  </Badge>
                ) : (
                  <Badge tone="green">~{fmtNumber(estMarketingRunway)} mktg msgs left</Badge>
                )}
              </div>
              <p className="tabular mt-1 text-xl font-semibold leading-tight text-ink sm:text-2xl">{rupees(s.remainingBalance)}</p>

              {/* Visual Balance Runway Meter */}
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-track sm:mt-2.5">
                <div className={cn("bar h-full rounded-full", low ? "bg-chart-gold" : "bg-chart-emerald")} style={{ width: `${runwayPct}%` }} />
              </div>

              <p className="mt-1.5 text-xs text-muted">
                {acc.accountName} · Enough for ~<b>{fmtNumber(estMarketingRunway)}</b> marketing messages (incl. GST).
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-ink-2">Prepaid balance</p>
              <p className="mt-1 text-xs text-muted sm:text-sm">No balance is recorded for this WhatsApp account yet. Sync it below or see Meta&apos;s Billing Hub.</p>
            </>
          )}
          <a href={acc.billingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClass(low ? "primary" : "secondary", "sm"), "mt-2.5 w-full sm:mt-3")}>
            Recharge on Meta <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens Meta Business Suite)</span>
          </a>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{s.monthLabel} spend by category</p>
          <SpendRows rows={s.current} />
        </div>

        {freeServiceCount > 0 && (
          <div className="rounded-control border border-brand/25 bg-brand-soft/35 p-2.5 text-xs text-ink-2 sm:p-3">
            <p className="flex items-center gap-1.5 font-semibold text-brand-deep">
              <Lightbulb aria-hidden className="size-3.5 shrink-0" /> Meta spend optimization insight
            </p>
            <p className="mt-0.5 leading-relaxed">
              You sent <b>{fmtNumber(freeServiceCount)} free service messages</b> inside the 24-hour customer reply window, saving ~<b>{rupees(estSavedByFreeWindow)}</b> in marketing charges. Always send catalogues & price lists right after a customer replies!
            </p>
          </div>
        )}

        {s.byPhone.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">{s.monthLabel} by WhatsApp number</p>
            <ul className="divide-y divide-line text-xs">
              {s.byPhone.map((p) => (
                <li key={p.phone} className="flex items-center justify-between gap-2 py-1.5">
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
          <div className="border-t border-line pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">Recent top-ups</p>
            <ul className="divide-y divide-line text-xs">
              {s.topUps.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
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

        {canManage && <TopUpForm clientId={clientId} wabaId={wabaId} />}

        <p className="border-t border-line pt-3 text-xs text-muted">
          All-time spend <span className="tabular font-medium text-ink-2">{rupees(s.allTimeSpent)}</span> · Marketing ₹{RATES.marketing}, utility ₹{RATES.utility} per
          message (+18% GST). Service replies within 24 hours are free.
        </p>
      </div>
    </Card>
  );
}


