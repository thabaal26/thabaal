import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/format";

const SERIES = [
  { key: "READ", label: "Read", color: "bg-violet-500" },
  { key: "DELIVERED", label: "Delivered", color: "bg-emerald-500" },
  { key: "SENT", label: "Sent", color: "bg-sky-400" },
  { key: "FAILED", label: "Failed", color: "bg-rose-400" },
];

const label = (day: string, pattern: string) => formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);

export function DailyChart({ rows, since }: { rows: { day: string; status: string; n: number }[]; since: Date }) {
  const days = Array.from({ length: 14 }, (_, i) => formatInTimeZone(addDays(since, i), APP_TZ, "yyyy-MM-dd"));
  const val = (day: string, s: string) => rows.find((r) => r.day === day && r.status === s)?.n ?? 0;
  const totals = days.map((d) => SERIES.reduce((a, s) => a + val(d, s.key), 0));
  const max = Math.max(...totals, 1);

  return (
    <div className="px-4 pb-4 pt-3.5 sm:px-5 sm:pb-5 sm:pt-4">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted sm:mb-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-sm ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex h-36 items-end gap-1 border-b border-line sm:h-48 sm:gap-1.5" role="img" aria-label="Messages per day for the last 14 days">
        {days.map((d, i) => (
          <div key={d} className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className="flex flex-col overflow-hidden rounded-t-[4px] transition group-hover:opacity-80"
              style={{ height: `${(totals[i] / max) * 100}%`, minHeight: totals[i] ? 3 : 0 }}
            >
              {SERIES.map((s) => {
                const v = val(d, s.key);
                return v ? <div key={s.key} className={s.color} style={{ height: `${(v / totals[i]) * 100}%` }} /> : null;
              })}
            </div>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-night px-2.5 py-1.5 text-[11px] text-white shadow-pop group-hover:block">
              <p className="font-medium">
                {label(d, "EEE d MMM")} · {totals[i]}
              </p>
              {SERIES.map((s) =>
                val(d, s.key) ? (
                  <p key={s.key} className="text-white/70">
                    {s.label}: {val(d, s.key)}
                  </p>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 text-[11px] text-muted sm:gap-1.5">
        {days.map((d, i) => (
          <span key={d} className="flex-1 whitespace-nowrap text-center">
            {/* Every 3rd day on phones, every 2nd from tablets up. */}
            <span className="sm:hidden">{i % 3 === 0 ? label(d, "d/M") : ""}</span>
            <span className="hidden sm:inline">{i % 2 === 0 ? label(d, "d MMM") : ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
