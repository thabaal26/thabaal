import { ShieldAlert } from "lucide-react";
import { Card, CardHeader, Meter, QualityBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import type { numberHealth } from "@/lib/limits";

type Health = Awaited<ReturnType<typeof numberHealth>>;

/** Quality and 24-hour usage of a client's WhatsApp numbers. */
export function NumberHealth({ numbers, className }: { numbers: Health; className?: string }) {
  if (!numbers.length) return null;
  return (
    <Card className={className}>
      <CardHeader
        title="WhatsApp number health"
        description="Meta limits how many different people you can message in 24 hours. Good quality raises the limit over time; campaigns pause on their own at the limit."
      />
      <ul className="divide-y divide-line">
        {numbers.map((n) => {
          const full = n.left === 0;
          const share = n.limit ? pct(n.used, n.limit) : 0;
          return (
            <li key={n.id} className="space-y-2.5 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink">
                  {n.label} <span className="tabular font-normal text-muted">{n.displayPhone}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <QualityBadge rating={n.qualityRating} />
                  {n.qualityRating === "RED" && (
                    <span className="inline-flex items-center gap-1 text-xs text-danger">
                      <ShieldAlert aria-hidden className="size-3.5" /> Campaigns paused to protect this number
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
                  <span className="text-ink-2">
                    <b className="tabular text-ink">{fmtNumber(n.used)}</b> of {n.limit === null ? "unlimited" : fmtNumber(n.limit)} people · last 24 h
                  </span>
                  <span className={cn("tabular", full ? "font-medium text-warning" : "text-muted")}>
                    {n.left === null ? "No limit" : full ? "Limit reached" : `${fmtNumber(n.left)} left`}
                  </span>
                </div>
                {n.limit !== null && <Meter className="mt-1.5" tone={full ? "warning" : "brand"} value={Math.max(2, share)} />}
                <p className="mt-1 text-xs text-muted">
                  Meta limit {n.tier}/day{n.dailyCap != null ? ` · warm-up cap ${fmtNumber(n.dailyCap)}/day` : ""}
                  {n.statusCheckedAt ? ` · checked ${fmtDate(n.statusCheckedAt, "d MMM, h:mm a")}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
