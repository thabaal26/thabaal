import { ExternalLink, Phone, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { CATEGORY_LABEL, RATES, spendSummary, total, type SpendRow } from "@/lib/spend";
import { senderFor } from "@/lib/senders";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SpendTable({ title, rows }: { title: string; rows: SpendRow[] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {rows.length ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.category}>
                <td className="py-2 pr-3 align-top">
                  {CATEGORY_LABEL[r.category] ?? r.category}
                  <span className="block text-xs text-muted">
                    {fmtNumber(r.charged)} charged{r.free ? ` · ${fmtNumber(r.free)} free` : ""}
                    {RATES[r.category] ? ` · ₹${RATES[r.category]} each` : ""}
                  </span>
                </td>
                <td className="tabular py-2 text-right align-top font-medium">{r.cost ? rupees(r.cost) : "Free"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total</td>
              <td className="tabular py-2 text-right">{rupees(total(rows))}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted py-2">No charged messages.</p>
      )}
    </div>
  );
}

/** Live WhatsApp spend and prepaid balance synced from Meta Business Suite and real-time message usage. */
export async function SpendCard({ clientId, className }: { clientId: string; canManage: boolean; className?: string }) {
  const [s, { number }] = await Promise.all([
    spendSummary(clientId),
    senderFor(clientId),
  ]);

  const isLowBalance = s.remainingBalance < 50;
  const metaAcc = s.metaAccount;

  return (
    <Card className={cn("@container", className)}>
      <CardHeader
        title={<span className="whitespace-nowrap">WhatsApp spend & balance</span>}
        description="Live message spend and prepaid account balance for sending numbers on Meta Cloud API."
        action={
          <a
            href={metaAcc.billingUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Meta Business Suite Billing Hub"
            className="inline-flex min-h-7 items-center gap-1 rounded-control border border-line px-2.5 text-2xs font-medium text-muted transition hover:border-brand hover:text-ink active:bg-sunken"
          >
            <span>Billing Hub</span>
            <ExternalLink aria-hidden className="size-3" />
          </a>
        }
      />
      <div className="space-y-4 p-4 sm:p-5">
        {/* Live Recharged Account & Balance Banner */}
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-3.5 @md:flex-row @md:items-center @md:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep shadow-xs">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-muted">Prepaid Balance</span>
                <Badge tone={isLowBalance ? "amber" : "green"} dot>
                  {isLowBalance ? "Low balance" : "Live Meta"}
                </Badge>
                <span className="text-3xs font-medium text-muted rounded bg-panel px-1.5 py-0.5 border border-line">
                  {metaAcc.currency}
                </span>
              </div>
              <p className={cn("tabular text-2xl @md:text-3xl font-extrabold tracking-tight mt-0.5 whitespace-nowrap", isLowBalance ? "text-danger" : "text-ink")}>
                {rupees(s.remainingBalance)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <span className="font-semibold text-ink">{metaAcc.accountName}</span>
                {number?.displayPhone && (
                  <span className="inline-flex items-center gap-1 text-ink">
                    · <Phone className="size-3 text-muted" /> {number.displayPhone}
                  </span>
                )}
                <span>· WABA: {metaAcc.wabaId}</span>
                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                  · <ShieldCheck className="size-3" /> Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-2 border-t border-line/60 @md:pt-0 @md:border-t-0">
            <a
              href={metaAcc.billingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control bg-brand px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-deep active:scale-95"
            >
              <span>Recharge on Meta</span>
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </div>
        </div>

        {/* Metric Summary Boxes */}
        <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border border-line bg-panel p-3 shadow-xs @md:block">
            <div>
              <p className="text-3xs font-medium uppercase tracking-wider text-muted">Prepaid Balance</p>
              <p className="text-3xs text-muted">From Meta Billing</p>
            </div>
            <p className="font-bold text-base @md:text-lg tabular text-ink whitespace-nowrap @md:mt-1">{rupees(s.prepaidFunds)}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-panel p-3 shadow-xs @md:block">
            <div>
              <p className="text-3xs font-medium uppercase tracking-wider text-muted">Spent This Month</p>
              <p className="text-3xs text-muted">{s.monthLabel} billed spend</p>
            </div>
            <p className="font-bold text-base @md:text-lg tabular text-ink whitespace-nowrap @md:mt-1">{rupees(s.totalMonthSpent)}</p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-panel p-3 shadow-xs @md:block">
            <div>
              <p className="text-3xs font-medium uppercase tracking-wider text-muted">Total Message Spend</p>
              <p className="text-3xs text-muted">All-time campaigns</p>
            </div>
            <p className="font-bold text-base @md:text-lg tabular text-ink whitespace-nowrap @md:mt-1">{rupees(s.allTimeSpent)}</p>
          </div>
        </div>

        {/* Detailed Breakdown Tables */}
        <div className="grid gap-4 @lg:grid-cols-2">
          <SpendTable title={`${s.monthLabel} (so far)`} rows={s.current} />
          <SpendTable title={s.lastMonthLabel} rows={s.previous} />
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-2.5 sm:flex-row sm:items-center sm:justify-between text-2xs text-muted">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-amber-500 shrink-0" />
            Pricing computed using Meta India tier rates (Marketing ₹0.7846, Utility ₹0.115).
          </span>
          <a
            href={metaAcc.billingUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:underline text-ink font-semibold inline-flex items-center gap-1"
          >
            <span>Meta Billing Hub</span>
            <ExternalLink className="size-3" />
          </a>
        </div>
      </div>
    </Card>
  );
}
