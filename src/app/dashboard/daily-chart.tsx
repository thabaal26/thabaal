import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ, fmtNumber } from "@/lib/format";

/**
 * Each message counts once, under its latest status. Sent, delivered and read are steps of one
 * journey, so they share one green ramp (darker = further along); failed wears the danger colour.
 * Stacked from the baseline in journey order, with failures on top.
 */
const SERIES = [
  { key: "READ", label: "Read", color: "bg-series-read" },
  { key: "DELIVERED", label: "Delivered", color: "bg-series-delivered" },
  { key: "SENT", label: "Sent", color: "bg-series-sent" },
  { key: "FAILED", label: "Failed", color: "bg-series-failed" },
];

const label = (day: string, pattern: string) => formatInTimeZone(new Date(`${day}T12:00:00Z`), "UTC", pattern);

/** A clean axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above the tallest column. */
function niceMax(n: number) {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= n) ?? 10 * p);
}

export function DailyChart({ rows, since }: { rows: { day: string; status: string; n: number }[]; since: Date }) {
  const days = Array.from({ length: 14 }, (_, i) => formatInTimeZone(addDays(since, i), APP_TZ, "yyyy-MM-dd"));
  const val = (day: string, s: string) => rows.find((r) => r.day === day && r.status === s)?.n ?? 0;
  const totals = days.map((d) => SERIES.reduce((a, s) => a + val(d, s.key), 0));
  const sum = totals.reduce((a, b) => a + b, 0);
  const top = niceMax(Math.max(...totals, 1));
  const ticks = [top, top / 2, 0];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold leading-6 text-ink">Messages per day</h2>
          <p className="mt-0.5 text-xs text-muted sm:text-sm">Last 14 days, each message counted under its latest status</p>
        </div>
        <p className="ml-auto text-right">
          <span className="tabular block text-xl font-semibold leading-tight text-ink">{fmtNumber(sum)}</span>
          <span className="text-xs text-muted">messages</span>
        </p>
      </div>

      <div className="p-4 sm:p-5">
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-ink-2">
              <span aria-hidden className={`size-2.5 rounded-[3px] ${s.color}`} />
              {s.label}
            </li>
          ))}
        </ul>

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

        <div aria-hidden className="flex gap-2">
          {/* Y axis: three clean ticks, hairline gridlines behind the columns. */}
          <div className="tabular flex h-44 w-7 shrink-0 flex-col justify-between text-right text-2xs text-muted sm:h-52">
            {ticks.map((t) => (
              <span key={t} className="-translate-y-1/2 leading-none last:translate-y-0">{fmtNumber(t)}</span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44 sm:h-52">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {ticks.map((t) => (
                  <div key={t} className="h-px bg-line last:bg-line-2" />
                ))}
              </div>
              <div className="relative flex h-full items-end">
                {days.map((d, i) => (
                  <div key={d} className="group relative flex h-full flex-1 items-end justify-center">
                    <div className="absolute inset-x-0.5 inset-y-0 rounded-control transition-colors group-hover:bg-sunken/70" />
                    {totals[i] > 0 && (
                      <div
                        className="bar-y relative flex w-full max-w-6 flex-col overflow-hidden rounded-t-[4px] sm:w-3/5"
                        style={{ height: `${(totals[i] / top) * 100}%`, minHeight: 3, animationDelay: `${i * 25}ms` }}
                      >
                        {[...SERIES].reverse().map((s) => {
                          const v = val(d, s.key);
                          return v ? <div key={s.key} className={`${s.color} border-t-2 border-panel first:border-t-0`} style={{ height: `${(v / totals[i]) * 100}%` }} /> : null;
                        })}
                      </div>
                    )}

                    {/* Hover detail for this day. */}
                    <div className="pointer-events-none absolute bottom-full z-20 mb-2 hidden min-w-36 rounded-control bg-ink px-3 py-2 text-xs text-white shadow-pop group-hover:block">
                      <p className="font-semibold">{label(d, "EEE d MMM")}</p>
                      <p className="tabular text-white/70">{fmtNumber(totals[i])} messages</p>
                      {totals[i] > 0 && (
                        <ul className="mt-1.5 space-y-0.5 border-t border-white/15 pt-1.5">
                          {SERIES.map((s) =>
                            val(d, s.key) ? (
                              <li key={s.key} className="flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5">
                                  <span className={`size-2 rounded-[2px] ${s.color}`} />
                                  {s.label}
                                </span>
                                <span className="tabular font-medium">{fmtNumber(val(d, s.key))}</span>
                              </li>
                            ) : null,
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 flex text-2xs text-muted">
              {days.map((d, i) => (
                <span key={d} className="flex-1 whitespace-nowrap text-center">
                  <span className="sm:hidden">{i % 3 === 0 ? label(d, "d/M") : ""}</span>
                  <span className="hidden sm:inline">{i % 2 === 0 ? label(d, "d MMM") : ""}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
