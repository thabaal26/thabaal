import { fromZonedTime, toZonedTime } from "date-fns-tz";

/** The tag that marks your own numbers; a campaign's "Send test" goes only to these customers. */
export const TEST_TAG = "test";

export const DAYS =["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

/** The scheduler checks for due batches this often, so no campaign sends faster than one batch per tick. */
export const SCHEDULER_TICK_MINUTES = 5;

/** Minutes between batches in practice: the chosen interval, but never less than one scheduler tick. */
export const effectiveInterval = (intervalMinutes: number) => Math.max(intervalMinutes, SCHEDULER_TICK_MINUTES);

/** Minutes needed to deliver `total` messages in batches. */
export function estimateDuration(total: number, batchSize: number, intervalMinutes: number) {
  if (total <= 0 || batchSize <= 0) return 0;
  return (Math.ceil(total / batchSize) - 1) * effectiveInterval(intervalMinutes);
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

export function formatMinutes(mins: number, ta = false) {
  if (mins < 1) return ta ? "உடனே" : "instantly";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h && (ta ? `${h} மணி` : `${h}h`), m && (ta ? `${m} நிமி` : `${m}m`)].filter(Boolean).join(" ");
}

/** Short day names in Tamil, Sunday first like DAYS. */
export const DAYS_TA = ["ஞாயி", "திங்", "செவ்", "புத", "வியா", "வெள்", "சனி"] as const;

/** A day's short name (0 = Sunday) in English or Tamil. */
export function dayName(i: number, ta = false): string {
  return (ta ? DAYS_TA : DAYS)[i] ?? "";
}

export const TIME_PRESETS = [
  { label: "Morning", time: "09:00", hint: "9:00 AM" },
  { label: "Midday", time: "11:00", hint: "11:00 AM" },
  { label: "Afternoon", time: "15:00", hint: "3:00 PM" },
  { label: "Evening", time: "18:00", hint: "6:00 PM" },
] as const;

export const WEEKLY_PAIRS = [
  { label: "Tue & Fri", days: [2, 5] },
  { label: "Mon & Thu", days: [1, 4] },
  { label: "Wed & Sat", days: [3, 6] },
] as const;

export function describeScheduleSummary(
  scheduleType: "ONCE" | "WEEKLY",
  daysOfWeek: number[],
  sendTime: string,
  runDate?: string,
  ta = false,
): string {
  const [h, m] = (sendTime || "10:00").split(":").map(Number);
  const timeFormatted = `${(h % 12) || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
  if (ta) return describeScheduleTa(scheduleType, daysOfWeek, timeFormatted, runDate);

  if (scheduleType === "ONCE") {
    if (!runDate) return `Once at ${timeFormatted}`;
    const [y, mo, d] = runDate.split("-").map(Number);
    const dateObj = new Date(y, mo - 1, d);
    const dateFormatted = dateObj.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return `Once on ${dateFormatted} at ${timeFormatted}`;
  }

  const sorted = [...new Set(daysOfWeek)].sort();
  if (sorted.length === 7) return `Daily (every day) at ${timeFormatted}`;
  if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) {
    return `Every weekday (Mon–Fri) at ${timeFormatted}`;
  }
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) {
    return `Every weekend (Sat & Sun) at ${timeFormatted}`;
  }
  if (sorted.length === 1) {
    return `Every ${DAYS[sorted[0]]} (once a week) at ${timeFormatted}`;
  }
  if (sorted.length === 2) {
    return `Every ${DAYS[sorted[0]]} & ${DAYS[sorted[1]]} (2× a week) at ${timeFormatted}`;
  }
  if (sorted.length > 0) {
    return `${sorted.length}× a week (${sorted.map((d) => DAYS[d]).join(", ")}) at ${timeFormatted}`;
  }
  return `Weekly at ${timeFormatted} (pick at least one day)`;
}

function describeScheduleTa(scheduleType: "ONCE" | "WEEKLY", daysOfWeek: number[], time: string, runDate?: string): string {
  if (scheduleType === "ONCE") {
    if (!runDate) return `${time}-க்கு ஒருமுறை`;
    const [y, mo, d] = runDate.split("-").map(Number);
    const date = new Date(y, mo - 1, d).toLocaleDateString("ta-IN", { weekday: "short", day: "numeric", month: "short" });
    return `${date} அன்று ${time}-க்கு ஒருமுறை`;
  }
  const sorted = [...new Set(daysOfWeek)].sort();
  const name = (i: number) => DAYS_TA[i];
  if (sorted.length === 7) return `தினமும் ${time}-க்கு`;
  if (sorted.length === 5 && sorted.every((d) => d >= 1 && d <= 5)) return `ஒவ்வொரு வார நாளும் (திங்–வெள்) ${time}-க்கு`;
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return `ஒவ்வொரு வார இறுதியும் (சனி & ஞாயி) ${time}-க்கு`;
  if (sorted.length === 1) return `ஒவ்வொரு ${name(sorted[0])} (வாரம் ஒருமுறை) ${time}-க்கு`;
  if (sorted.length === 2) return `ஒவ்வொரு ${name(sorted[0])} & ${name(sorted[1])} (வாரம் 2 முறை) ${time}-க்கு`;
  if (sorted.length > 0) return `வாரம் ${sorted.length} முறை (${sorted.map(name).join(", ")}) ${time}-க்கு`;
  return `வாரந்தோறும் ${time}-க்கு (குறைந்தது ஒரு நாளைத் தேர்வு செய்யவும்)`;
}

