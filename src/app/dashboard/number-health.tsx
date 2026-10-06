import { ShieldAlert } from "lucide-react";
import { Card, CardHeader, QualityBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber, pct } from "@/lib/format";
import type { numberHealth } from "@/lib/limits";

type Health = Awaited<ReturnType<typeof numberHealth>>;

/** Quality and 24-hour usage of a client's WhatsApp numbers. */
export function NumberHealth({ numbers, compact }: { numbers: Health; compact?: boolean }) {
  if (!numbers.length) return null;
  return (
    <Card className={compact ? undefined : "mt-6"}>
      <CardHeader
        title="WhatsApp number health"
        description="Meta limits how many different people you can message in 24 hours. Good quality raises the limit over time; campaigns pause on their own at the limit."
      />
      <ul className="divide-y divide-line">
        {numbers.map((n) => {
          const full = n.left === 0;
          const share = n.limit ? pct(n.used, n.limit) : 0;
          return (
            <li key={n.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_1.2fr] sm:items-center sm:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {n.label} <span className="font-normal text-muted">{n.displayPhone}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <QualityBadge rating={n.qualityRating} />
                  {n.qualityRating === "RED" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-rose-700"><ShieldAlert className="size-3" /> Campaigns paused to protect this number</span>
                  )}
                </div>
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-ink-2">
                    <b className="tabular text-ink">{fmtNumber(n.used)}</b> of {n.limit === null ? "unlimited" : fmtNumber(n.limit)} people · last 24 h
                  </span>
                  <span className={cn("tabular", full ? "font-medium text-amber-700" : "text-muted")}>
                    {n.left === null ? "No limit" : full ? "Limit reached" : `${fmtNumber(n.left)} left`}
                  </span>
                </div>
                {n.limit !== null && (
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
                    <div className={cn("h-full rounded-full", full ? "bg-amber-500" : "bg-brand")} style={{ width: `${Math.min(100, Math.max(2, share))}%` }} />
                  </div>
                )}
                <p className="mt-1 text-[11px] text-muted">
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
