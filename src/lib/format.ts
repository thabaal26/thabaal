import { formatInTimeZone } from "date-fns-tz";

export const APP_TZ = process.env.APP_TIMEZONE ?? "Asia/Kolkata";

export function fmtDate(d: Date | null | undefined, pattern = "d MMM yyyy, h:mm a") {
  return d ? formatInTimeZone(d, APP_TZ, pattern) : "—";
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function pct(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** A moment `n` days before now. Kept out of components so renders stay pure. */
export function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

/**
 * Accurately formats a template's date label.
 * Templates show "created <date>" (e.g. "created 7 Oct", "created 15 Oct").
 * If the template was genuinely updated on a later date (or preferUpdated is true),
 * it reflects the updated date without falsely claiming older templates were updated today.
 */
export function templateDateLabel(
  createdAt: Date | string | null | undefined,
  updatedAt?: Date | string | null | undefined,
  options?: { preferUpdated?: boolean }
): string {
  if (!createdAt) return "—";
  const c = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  const u = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;

  const createdStr = fmtDate(c, "d MMM");
  if (!u) return `created ${createdStr}`;

  const updatedStr = fmtDate(u, "d MMM");

  if (options?.preferUpdated) {
    if (createdStr === updatedStr) {
      return `created ${createdStr}`;
    }
    return `updated ${updatedStr}`;
  }

  if (createdStr === updatedStr || Math.abs(u.getTime() - c.getTime()) <= 86_400_000) {
    return `created ${createdStr}`;
  }

  return `created ${createdStr} · updated ${updatedStr}`;
}

