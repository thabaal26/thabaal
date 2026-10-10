import { ExternalLink } from "lucide-react";
import { Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtNumber } from "@/lib/format";
import { senderFor } from "@/lib/senders";
import { CATEGORY_LABEL, RATES, spendSummary, total, type SpendRow } from "@/lib/spend";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SpendRows({ rows }: { rows: SpendRow[] }) {
  if (!rows.length) return <p className="py-2 text-sm text-muted">No charged messages yet.</p>;
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Spend by message category</caption>
      <tbody className="divide-y divide-line">
        {rows.map((r) => (
          <tr key={r.category}>
            <th scope="row" className="py-2 pr-3 text-left align-top font-normal text-ink">
              {CATEGORY_LABEL[r.category] ?? r.category}
              <span className="block text-xs text-muted">
                {fmtNumber(r.charged)} charged{r.free ? ` · ${fmtNumber(r.free)} free` : ""}
                {RATES[r.category] ? ` · ₹${RATES[r.category]} each` : ""}
              </span>
            </th>
            <td className="tabular py-2 text-right align-top font-medium text-ink">{r.cost ? rupees(r.cost) : "Free"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Message spend worked out from the messages this portal sent, at Meta's published rates, and the
 * prepaid balance last recorded for the client's WhatsApp account. Neither is read live from Meta,
 * so the card says so and links to Meta's Billing Hub for the authoritative figures.
 */
export async function SpendCard({ clientId, className }: { clientId: string; canManage: boolean; className?: string }) {
  const [s, { number }] = await Promise.all([spendSummary(clientId), senderFor(clientId)]);
  const acc = s.metaAccount;
  // The balance store falls back to another account when it has no record for this one; only show a match.
  const recorded = Boolean(number?.businessAccountId && acc.wabaId === number.businessAccountId);
  const low = recorded && s.remainingBalance < 50;

  return (
    <Card className={className}>
      <CardHeader
        title="WhatsApp spend"
        description="Estimated at Meta's India rates"
        action={
          <a href={acc.billingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
            Billing Hub <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens Meta Business Suite)</span>
          </a>
        }
      />
      <dl className="grid grid-cols-2 divide-x divide-line border-b border-line">
        <div className="px-4 py-4 sm:px-5">
          <dt className="text-xs text-muted">{s.monthLabel} so far</dt>
          <dd className="tabular mt-1 text-xl font-semibold leading-tight text-ink">{rupees(s.totalMonthSpent)}</dd>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <dt className="text-xs text-muted">{s.lastMonthLabel}</dt>
          <dd className="tabular mt-1 text-xl font-semibold leading-tight text-ink">{rupees(total(s.previous))}</dd>
        </div>
      </dl>

      <div className="space-y-4 p-4 sm:p-5">
        <div className={cn("rounded-control border p-3.5", low ? "border-warning-border bg-warning-bg" : "border-line bg-subtle")}>
          {recorded ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-ink-2">Prepaid balance · last recorded</p>
                {low && (
                  <Badge tone="amber" dot>
                    Low balance
                  </Badge>
                )}
              </div>
              <p className="tabular mt-1 text-2xl font-semibold leading-tight text-ink">{rupees(s.remainingBalance)}</p>
              <p className="mt-1 text-xs text-muted">
                {acc.accountName} · not read live from Meta, so check the Billing Hub before a large campaign.
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-ink-2">Prepaid balance</p>
              <p className="mt-1 text-sm text-muted">No balance is recorded for this WhatsApp account. See it on Meta&apos;s Billing Hub.</p>
            </>
          )}
          <a href={acc.billingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClass(low ? "primary" : "secondary", "sm"), "mt-3 w-full")}>
            Recharge on Meta <ExternalLink aria-hidden className="size-3.5" />
            <span className="sr-only">(opens Meta Business Suite)</span>
          </a>
        </div>

        <div>
          <p className="text-xs font-medium text-muted">{s.monthLabel} by category</p>
          <SpendRows rows={s.current} />
        </div>

        <p className="border-t border-line pt-3 text-xs text-muted">
          All-time estimate <span className="tabular font-medium text-ink-2">{rupees(s.allTimeSpent)}</span> · Marketing ₹{RATES.marketing}, utility ₹{RATES.utility} per
          message. Service replies within 24 hours are free.
        </p>
      </div>
    </Card>
  );
}
