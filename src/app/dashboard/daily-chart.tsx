import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Calendar } from "lucide-react";
import { APP_TZ } from "@/lib/format";

const SERIES = [
  { key: "DELIVERED", label: "Delivered", color: "bg-[#247458]" },
  { key: "READ", label: "Read", color: "bg-[#52B788]" },
  { key: "SENT", label: "Sent", color: "bg-[#A7D7C5]" },
  { key: "FAILED", label: "Failed", color: "bg-[#F87171]" },
];

const label = (day: string, pattern: string) => formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);

export function DailyChart({ rows, since }: { rows: { day: string; status: string; n: number }[]; since: Date }) {
  const days = Array.from({ length: 14 }, (_, i) => formatInTimeZone(addDays(since, i), APP_TZ, "yyyy-MM-dd"));
  const val = (day: string, s: string) => rows.find((r) => r.day === day && r.status === s)?.n ?? 0;
  const totals = days.map((d) => SERIES.reduce((a, s) => a + val(d, s.key), 0));
  const max = Math.max(...totals, 1);

  return (
    <div className="p-5 sm:p-6">
      {/* Header with Title and Green Pill Filter */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink">Analytics</h2>
          <p className="text-xs text-muted">Daily message volume & delivery breakdown</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#247458] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
            <Calendar className="size-3.5" />
            <span>14 Days</span>
          </div>
        </div>
      </div>

      {/* Series Legend */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2.5 rounded-full ${s.color}`} />
            <span className="font-medium text-ink-2">{s.label}</span>
          </span>
        ))}
      </div>

      <div className="sr-only">
        <table>
          <caption>Messages per day for the last 14 days, by latest status</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {SERIES.map((s) => <th key={s.key} scope="col">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <th scope="row">{label(d, "EEE d MMM")}</th>
                {SERIES.map((s) => <td key={s.key}>{val(d, s.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar Chart Container with Benchmark Line */}
      <div className="relative">
        {/* Dashed Benchmark / Target Line from Mockup */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-[35%] z-10 border-b-2 border-dashed border-amber-400/80"
        />

        <div aria-hidden className="flex h-44 sm:h-52 items-end gap-1.5 sm:gap-2.5 border-b border-line pb-1">
          {days.map((d, i) => (
            <div key={d} className="group relative flex h-full flex-1 flex-col justify-end">
              <div
                className="flex flex-col overflow-hidden rounded-t-md transition-all group-hover:brightness-95"
                style={{ height: `${(totals[i] / max) * 100}%`, minHeight: totals[i] ? 4 : 0 }}
              >
                {SERIES.map((s) => {
                  const v = val(d, s.key);
                  return v ? <div key={s.key} className={s.color} style={{ height: `${(v / totals[i]) * 100}%` }} /> : null;
                })}
              </div>

              {/* Tooltip on Hover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-2xl bg-[#11221b] px-3 py-2 text-xs text-white shadow-xl group-hover:block">
                <p className="font-semibold text-white">
                  {label(d, "EEE d MMM")} · {totals[i]} messages
                </p>
                {SERIES.map((s) =>
                  val(d, s.key) ? (
                    <p key={s.key} className="text-white/80">
                      {s.label}: {val(d, s.key)}
                    </p>
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Date Labels Below Bars */}
      <div aria-hidden className="mt-3 flex gap-1.5 text-2xs font-medium text-muted sm:gap-2.5">
        {days.map((d, i) => (
          <span key={d} className="flex-1 whitespace-nowrap text-center">
            <span className="sm:hidden">{i % 3 === 0 ? label(d, "d/M") : ""}</span>
            <span className="hidden sm:inline">{i % 2 === 0 ? label(d, "d MMM") : ""}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
