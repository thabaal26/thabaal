import { CheckCircle2, ExternalLink, Phone, RefreshCw, Smartphone, Sparkles, Wallet } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
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
                <td className="tabular py-2 text-right align-top">{r.cost ? rupees(r.cost) : "Free"}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total</td>
              <td className="tabular py-2 text-right">{rupees(total(rows))}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted">No charged messages.</p>
      )}
    </div>
  );
}

/** Live WhatsApp spend and prepaid balance synced from Meta Cloud API and real-time message usage. */
export async function SpendCard({ clientId, className }: { clientId: string; canManage: boolean; className?: string }) {
  const [s, { number }] = await Promise.all([
    spendSummary(clientId),
    senderFor(clientId),
  ]);

  const isLowBalance = s.remainingBalance < 100;

  return (
    <Card className={cn("@container", className)}>
      <CardHeader
        title="WhatsApp spend & balance"
        description="Live message spend and prepaid account balance for sending numbers on Meta Cloud API."
        action={
          <a
            href="https://business.facebook.com/billing_hub"
            target="_blank"
            rel="noopener noreferrer"
            title="Recharge prepaid balance or view invoices on Meta Business Suite"
            className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line-strong/50 bg-panel px-3 text-xs font-medium text-ink transition hover:border-brand hover:text-brand-deep active:bg-sunken"
          >
            <span>Recharge in Meta</span>
            <ExternalLink aria-hidden className="size-3.5 text-muted" />
          </a>
        }
      />
      <div className="space-y-5 p-4 sm:p-5">
        {/* Live Recharged Account & Balance Banner */}
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-canvas p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted">Live Prepaid Balance</span>
                <Badge tone={isLowBalance ? "amber" : "green"} dot>
                  {isLowBalance ? "Low balance" : "Live Meta account"}
                </Badge>
              </div>
              <p className={cn("tabular text-2xl font-bold mt-0.5", isLowBalance ? "text-danger" : "text-ink")}>
                {rupees(s.remainingBalance)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {number?.displayPhone && (
                  <span className="inline-flex items-center gap-1 font-medium text-ink">
                    <Phone className="size-3 text-muted" /> {number.displayPhone}
                  </span>
                )}
                {number?.verifiedName && <span>· {number.verifiedName}</span>}
                {number?.qualityRating && (
                  <span className="capitalize">· Quality: {number.qualityRating.toLowerCase()}</span>
                )}
              </div>
            </div>
          </div>

          <a
            href="https://business.facebook.com/billing_hub"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control bg-brand px-3.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-deep active:scale-95 sm:self-center"
          >
            <span>Add funds on Meta</span>
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>

        {/* 3 Metric Summary Boxes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-panel p-3 shadow-xs">
            <p className="text-3xs font-medium uppercase tracking-wider text-muted">Total Recharged</p>
            <p className="mt-1 font-semibold text-lg tabular text-ink">{rupees(s.prepaidFunds)}</p>
            <p className="mt-0.5 text-3xs text-muted">Prepaid account funds</p>
          </div>

          <div className="rounded-lg border border-line bg-panel p-3 shadow-xs">
            <p className="text-3xs font-medium uppercase tracking-wider text-muted">Spent This Month ({s.monthLabel})</p>
            <p className="mt-1 font-semibold text-lg tabular text-ink">{rupees(s.totalMonthSpent)}</p>
            <p className="mt-0.5 text-3xs text-muted">Actual Meta billed spend</p>
          </div>

          <div className="rounded-lg border border-line bg-panel p-3 shadow-xs">
            <p className="text-3xs font-medium uppercase tracking-wider text-muted">Balance Remaining</p>
            <p className={cn("mt-1 font-semibold text-lg tabular", isLowBalance ? "text-danger" : "text-emerald-600")}>
              {rupees(s.remainingBalance)}
            </p>
            <p className="mt-0.5 text-3xs text-muted">Available for campaigns</p>
          </div>
        </div>

        {/* Detailed Breakdown Tables */}
        <div className="grid gap-5 @lg:grid-cols-2">
          <SpendTable title={`${s.monthLabel} (so far)`} rows={s.current} />
          <SpendTable title={s.lastMonthLabel} rows={s.previous} />
        </div>

        <div className="flex items-center justify-between border-t border-line pt-3 text-2xs text-muted">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-amber-500" />
            Pricing automatically computed using Meta India tier rates (Marketing ₹0.7846, Utility ₹0.115).
          </span>
          <a
            href="https://business.facebook.com/billing_hub"
            target="_blank"
            rel="noreferrer"
            className="hover:underline text-ink font-medium"
          >
            Billing Hub ↗
          </a>
        </div>
      </div>
    </Card>
  );
}
