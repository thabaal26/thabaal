// Shared filters for the dashboard and the list pages: a period (preset or custom dates) plus who and
// what to look at (products, single customers, customer groups, area, campaign). Lives in the URL so
// every view can be shared, reloaded and bookmarked. Pure: safe for server and client code.

import { addDays, addMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const APP_TZ = "Asia/Kolkata";
const DAY = 86_400_000;

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 days" },
  { key: "14d", label: "Last 14 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
] as const;
export type PresetKey = (typeof PRESETS)[number]["key"];
export type RangeKey = PresetKey | "custom";

export type FilterState = {
  range: RangeKey;
  /** Custom period, inclusive, as yyyy-MM-dd in India time. */
  from: string;
  to: string;
  /** Product names (as on orders and the catalogue). */
  products: string[];
  /** Single customers, by id. */
  customers: string[];
  /** Customer groups (tags); a customer in any of them counts. */
  tags: string[];
  /** "region:Madurai city", "loc:Sellur" or "none". */
  area: string;
  /** Campaign id: only people that campaign messaged. */
  campaign: string;
};

type SP = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map((s) => s.trim()).filter(Boolean);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function readFilters(sp: SP, defaultRange: RangeKey = "7d"): FilterState {
  const from = one(sp.from);
  const to = one(sp.to);
  const raw = one(sp.range);
  const custom = DATE_RE.test(from) || DATE_RE.test(to);
  const range: RangeKey = custom ? "custom" : (PRESETS.some((p) => p.key === raw) ? (raw as PresetKey) : defaultRange);
  return {
    range,
    from: DATE_RE.test(from) ? from : "",
    to: DATE_RE.test(to) ? to : "",
    products: list(sp.product),
    customers: list(sp.cust),
    tags: list(sp.tag).filter((t) => !t.startsWith("product:") && t !== "__optout"),
    area: one(sp.area),
    campaign: one(sp.campaign),
  };
}

/** How many "who/what" filters are on (not counting the period). */
export const activeCount = (f: FilterState) => f.products.length + f.customers.length + f.tags.length + (f.area ? 1 : 0) + (f.campaign ? 1 : 0);

/** The query string for these filters, leaving out defaults; `extra` adds page params (view, show…). */
export function filterQuery(f: FilterState, extra: Record<string, string | undefined> = {}, defaultRange: RangeKey = "7d") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
  if (f.range === "custom") {
    if (f.from) q.set("from", f.from);
    if (f.to) q.set("to", f.to);
  } else if (f.range !== defaultRange) q.set("range", f.range);
  for (const p of f.products) q.append("product", p);
  for (const c of f.customers) q.append("cust", c);
  for (const t of f.tags) q.append("tag", t);
  if (f.area) q.set("area", f.area);
  if (f.campaign) q.set("campaign", f.campaign);
  return q.toString();
}

export const withQuery = (path: string, qs: string) => (qs ? `${path}?${qs}` : path);

/** The parts of the filter a page or tab can offer. The period is always there. */
export type FilterSection = "period" | "products" | "customers" | "tags" | "area" | "campaign";
export const ALL_SECTIONS: FilterSection[] = ["period", "products", "customers", "tags", "area", "campaign"];

/** Drops filters a page or tab doesn't use, so a filter carried over from elsewhere can't change figures silently. */
export function keepFilters(f: FilterState, sections: FilterSection[]): FilterState {
  const has = (s: FilterSection) => sections.includes(s);
  return {
    ...f,
    products: has("products") ? f.products : [],
    customers: has("customers") ? f.customers : [],
    tags: has("tags") ? f.tags : [],
    area: has("area") ? f.area : "",
    campaign: has("campaign") ? f.campaign : "",
  };
}

/* ───────────────────────── Period ───────────────────────── */

export type Period = {
  start: Date;
  /** Exclusive end: now for periods that run to today. */
  end: Date;
  /** Calendar days covered. */
  days: number;
  bucket: "hour" | "day" | "week";
  /** The same length of time just before (to the same moment of day when the period runs to now). */
  prevStart: Date;
  prevEnd: Date;
  toNow: boolean;
  /** "Last 7 days", "3 – 9 Oct". */
  label: string;
  /** For sentences: "the last 7 days", "today so far", "3 – 9 Oct". */
  phrase: string;
  /** "the 7 days before", "yesterday". */
  prevLabel: string;
};

const ymd = (d: Date) => formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
export const dayStartIST = (d: Date) => fromZonedTime(`${ymd(d)}T00:00:00`, APP_TZ);
const fromYmd = (s: string) => fromZonedTime(`${s}T00:00:00`, APP_TZ);
const fmt = (d: Date, p: string) => formatInTimeZone(d, APP_TZ, p);

export function resolvePeriod(f: FilterState, now = new Date(), firstDataAt?: Date): Period {
  const today = dayStartIST(now);
  let start: Date;
  let end: Date = now;
  let label: string = PRESETS.find((p) => p.key === f.range)?.label ?? "Custom";
  let phrase = label.toLowerCase();
  let prevLabel = "the period before";

  const lastN = (n: number) => {
    start = new Date(today.getTime() - (n - 1) * DAY);
    phrase = `the last ${n} days`;
    prevLabel = `the ${n} days before`;
  };

  switch (f.range) {
    case "today":
      start = today;
      phrase = "today so far";
      prevLabel = "yesterday";
      break;
    case "yesterday":
      start = new Date(today.getTime() - DAY);
      end = today;
      phrase = "yesterday";
      prevLabel = "the day before";
      break;
    case "14d":
      lastN(14);
      break;
    case "30d":
      lastN(30);
      break;
    case "90d":
      lastN(90);
      break;
    case "month":
      start = fromYmd(`${fmt(now, "yyyy-MM")}-01`);
      phrase = "this month";
      prevLabel = "the same number of days before";
      break;
    case "lastmonth": {
      end = fromYmd(`${fmt(now, "yyyy-MM")}-01`);
      start = fromYmd(`${fmt(addMonths(new Date(end.getTime() + DAY), -1), "yyyy-MM")}-01`);
      phrase = `${fmt(start, "MMMM")}`;
      label = fmt(start, "MMMM yyyy");
      prevLabel = "the month before";
      break;
    }
    case "year":
      start = fromYmd(`${fmt(now, "yyyy")}-01-01`);
      phrase = "this year";
      prevLabel = "the same number of days before";
      break;
    case "all":
      start = firstDataAt ? dayStartIST(firstDataAt) : new Date(today.getTime() - 364 * DAY);
      phrase = "all time";
      prevLabel = "before";
      break;
    case "custom": {
      const a = f.from || f.to;
      const b = f.to || f.from;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      start = fromYmd(lo);
      const after = addDays(fromYmd(hi), 1);
      end = after > now ? now : after;
      label = lo === hi ? fmt(start, "d MMM yyyy") : `${fmt(start, "d MMM")} – ${fmt(fromYmd(hi), "d MMM yyyy")}`;
      phrase = lo === hi ? fmt(start, "d MMM") : `${fmt(start, "d MMM")} – ${fmt(fromYmd(hi), "d MMM")}`;
      prevLabel = "the same length before";
      break;
    }
    default:
      lastN(7);
  }

  const toNow = end.getTime() === now.getTime();
  const days = Math.max(1, Math.round((dayStartIST(new Date(end.getTime() - 1)).getTime() - start!.getTime()) / DAY) + 1);
  // Compare with the same stretch just before; when the period runs to now, stop at the same time of day.
  const span = toNow ? end.getTime() - start!.getTime() : days * DAY;
  const prevStart = f.range === "lastmonth" ? fromYmd(`${fmt(addMonths(start!, -1), "yyyy-MM")}-01`) : new Date(start!.getTime() - (toNow ? days * DAY : span));
  const prevEnd = f.range === "lastmonth" ? start! : toNow ? new Date(now.getTime() - days * DAY) : start!;
  return {
    start: start!,
    end,
    days,
    bucket: days <= 1 ? "hour" : days > 92 ? "week" : "day",
    prevStart,
    prevEnd,
    toNow,
    label,
    phrase,
    prevLabel,
  };
}

/** Monday of the week a yyyy-MM-dd day falls in, as yyyy-MM-dd. */
export function weekKey(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

/** Chart buckets for a period: hours of the day, days, or weeks (Mondays). */
export function periodKeys(p: Period, now = new Date()): string[] {
  if (p.bucket === "hour") {
    const last = p.toNow ? Number(fmt(now, "H")) : 23;
    return Array.from({ length: last + 1 }, (_, h) => String(h).padStart(2, "0"));
  }
  const daysList = Array.from({ length: p.days }, (_, i) => ymd(addDays(p.start, i)));
  return p.bucket === "day" ? daysList : [...new Set(daysList.map(weekKey))];
}

/* ───────────────────────── Product filter on orders ───────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim();

/** Does this item name match one of the picked products? Exact (normalised) names. */
export function productMatcher(products: string[]) {
  const set = new Set(products.map(norm));
  return (name: string | null | undefined) => set.size === 0 || set.has(norm(name ?? ""));
}

/**
 * With a product filter, an order only counts for the matching lines: other items are dropped and
 * the total becomes the value of the matching lines. Orders with no matching line disappear.
 */
export function narrowOrders<T extends { items: unknown; total: number }>(orders: T[], products: string[]): T[] {
  if (!products.length) return orders;
  const match = productMatcher(products);
  const out: T[] = [];
  for (const o of orders) {
    const items = ((o.items as { name?: string; id?: string; quantity?: number | string; price?: number | string }[] | null) ?? []).filter((i) => match(i.name ?? i.id));
    if (!items.length) continue;
    const total = items.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
    out.push({ ...o, items, total: total || o.total });
  }
  return out;
}
