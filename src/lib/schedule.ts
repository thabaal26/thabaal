import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type Schedule = {
  scheduleType: "ONCE" | "WEEKLY";
  daysOfWeek: number[];
  sendTime: string;
  runAt: Date | null;
  timezone: string;
};

/** Next time a campaign should start, strictly after `after`. Null when there is none. */
export function computeNextRun(s: Schedule, after = new Date()): Date | null {
  if (s.scheduleType === "ONCE") return s.runAt && s.runAt > after ? s.runAt : null;
  if (!s.daysOfWeek.length) return null;

  const [h, m] = s.sendTime.split(":").map(Number);
  const local = toZonedTime(after, s.timezone);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(local);
    d.setDate(local.getDate() + i);
    if (!s.daysOfWeek.includes(d.getDay())) continue;
    d.setHours(h, m, 0, 0);
    const utc = fromZonedTime(d, s.timezone);
    if (utc > after) return utc;
  }
  return null;
}

/** Minutes needed to deliver `total` messages in batches. */
export function estimateDuration(total: number, batchSize: number, intervalMinutes: number) {
  if (total <= 0 || batchSize <= 0) return 0;
  return (Math.ceil(total / batchSize) - 1) * intervalMinutes;
}

/** Friendly countdown, like "in 5 min", "in 2h 10m" or "in 3 days". */
export function timeUntil(at: Date, now = new Date()) {
  const mins = Math.ceil((at.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return "any moment now";
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) return `in ${formatMinutes(mins)}`;
  const days = Math.round(mins / (24 * 60));
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function formatMinutes(mins: number) {
  if (mins < 1) return "instantly";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ");
}
