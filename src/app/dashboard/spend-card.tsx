import { ExternalLink, Wallet } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import { CATEGORY_LABEL, RATES, spendSummary, total, type SpendRow } from "@/lib/spend";
import { deleteTopUp } from "./actions/spend";
import { TopUpForm } from "./top-up-form";

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

/** Estimated WhatsApp spend from Meta's pricing webhooks, and the balance left from recorded top-ups. */
export async function SpendCard({ clientId, canManage, className }: { clientId: string; canManage: boolean; className?: string }) {
  const s = await spendSummary(clientId);
  return (
    <Card className={cn("@container", className)}>
      <CardHeader
        title="WhatsApp spend"
        description="Estimated from Meta's per-message India rates, before tax. Your Meta invoice is the final amount."
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
        <div className="flex flex-col gap-3 rounded-control bg-sunken p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
              <Wallet className="size-5" />
            </span>
            {s.balance ? (
              <div className="min-w-0">
                <p className="text-xs text-muted">Balance (estimated)</p>
                <p className={cn("tabular text-xl font-semibold", s.balance.left < 100 && "text-danger")}>{rupees(s.balance.left)}</p>
                <p className="text-xs text-muted">
                  Added {rupees(s.balance.added)} · spent ≈ {rupees(s.balance.spent)} since {fmtDate(s.balance.since, "d MMM yyyy")}
                  {s.balance.left < 100 && " · running low, add money in Meta's Billing & payments"}
                </p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="text-xs text-muted">Balance</p>
                <p className="text-sm font-medium text-ink">Track prepaid messaging funds</p>
                <p className="text-xs text-muted">
                  Meta handles recharges directly in Meta Business Manager. {canManage ? "Record top-ups below to track your live balance." : "Ask your manager to record top-ups."}
                </p>
              </div>
            )}
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

        <div className="grid gap-5 @lg:grid-cols-2">
          <SpendTable title={`${s.monthLabel} (so far)`} rows={s.current} />
          <SpendTable title={s.lastMonthLabel} rows={s.previous} />
        </div>

        {canManage && (
          <div className="space-y-3 border-t border-line pt-4">
            <TopUpForm />
            {s.topUps.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {s.topUps.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="tabular font-medium">{rupees(t.amount)}</span>
                      <span className="text-xs text-muted"> · {fmtDate(t.createdAt, "d MMM yyyy")}{t.addedBy && ` · ${t.addedBy}`}{t.note && ` · ${t.note}`}</span>
                    </span>
                    <ActionButton action={deleteTopUp.bind(null, t.id)} variant="ghost" confirm="Remove this top-up?" aria-label={`Remove top-up of ${rupees(t.amount)}`}>Remove</ActionButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
