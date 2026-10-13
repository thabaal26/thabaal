/*
 * Custom fields: extra details a client keeps on customers and orders (birthday, GSTIN, PO number…).
 * Definitions live on Client.customFields; values on Customer.extra and Order.extra, keyed by field key.
 * Pure helpers, safe to import in client components.
 */

export type CustomFieldType = "text" | "number" | "date" | "select";
export type CustomFieldTarget = "customer" | "order";

export type CustomField = {
  /** Stable id used to store values: lower case, digits and underscores. */
  key: string;
  label: string;
  type: CustomFieldType;
  /** Choices for a "select" field. */
  options?: string[];
  on: CustomFieldTarget;
};

export const FIELD_TYPES: { id: CustomFieldType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "select", label: "Choice list" },
];

export const MAX_FIELDS = 20;

/** "Preferred time" → "preferred_time". */
export const fieldKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "field";

/** The client's field definitions, cleaned (unknown or broken entries are dropped). */
export function readFields(raw: unknown, on?: CustomFieldTarget): CustomField[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomField[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 40) : "";
    const key = typeof r.key === "string" && /^[a-z0-9_]{1,40}$/.test(r.key) ? r.key : fieldKey(label);
    const type = (["text", "number", "date", "select"] as const).find((t) => t === r.type) ?? "text";
    const target = r.on === "order" ? "order" : "customer";
    if (!label || seen.has(`${target}:${key}`)) continue;
    seen.add(`${target}:${key}`);
    const options =
      type === "select" && Array.isArray(r.options)
        ? [...new Set(r.options.filter((o): o is string => typeof o === "string").map((o) => o.trim().slice(0, 40)).filter(Boolean))].slice(0, 20)
        : undefined;
    if (type === "select" && !options?.length) continue;
    out.push({ key, label, type, ...(options && { options }), on: target });
  }
  return (on ? out.filter((f) => f.on === on) : out).slice(0, MAX_FIELDS * 2);
}

/** Saved values, as strings by key. */
export function readValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = String(v);
  }
  return out;
}

/** Checks typed values against the fields; returns what to save (blank values are left out) or an error. */
export function cleanValues(fields: CustomField[], input: Record<string, string> | undefined): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const v = (input?.[f.key] ?? "").trim().slice(0, 200);
    if (!v) continue;
    if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(v)) return { error: `${f.label} must be a number.` };
    if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: `${f.label} must be a date.` };
    if (f.type === "select" && !f.options?.includes(v)) return { error: `Pick one of the choices for ${f.label}.` };
    values[f.key] = v;
  }
  return { values };
}

/** A value as people read it (dates as 14 Oct 2026). */
export function showValue(f: CustomField, v: string | undefined) {
  if (!v) return "";
  if (f.type === "date") {
    const d = new Date(`${v}T00:00:00`);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  return v;
}
