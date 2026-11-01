// Saved delivery addresses (Customer.addresses): every address a customer has used, newest first, up to 5.
// Plain helpers shared by server and client code (no database access here; see address-book-server.ts).

export type SavedAddress = {
  text: string;
  /** Area / locality, when known (groups orders on the packing list). */
  area?: string | null;
  /** Map link of a location they shared for this address. */
  mapUrl?: string | null;
  /** When it was last used or given (ISO). */
  usedAt: string;
};

export const MAX_ADDRESSES = 5;

/** The same address however it is spaced, cased or punctuated. */
const normal = (t: string) => t.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, "");

/** A short id for an address (in WhatsApp button ids), the same for the same address. */
export function addressKey(text: string) {
  let h = 0x811c9dc5;
  for (const ch of normal(text)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const sameAddress = (a: string, b: string) => normal(a) !== "" && normal(a) === normal(b);

/** The stored list, cleaned: only real entries, newest first. */
export function readAddresses(raw: unknown): SavedAddress[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedAddress[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const e = r as Record<string, unknown>;
    const text = typeof e.text === "string" ? e.text.trim().slice(0, 500) : "";
    if (!text) continue;
    out.push({
      text,
      area: typeof e.area === "string" && e.area.trim() ? e.area.trim().slice(0, 80) : null,
      mapUrl: typeof e.mapUrl === "string" && /^https:\/\//.test(e.mapUrl) ? e.mapUrl.slice(0, 500) : null,
      usedAt: typeof e.usedAt === "string" && !Number.isNaN(Date.parse(e.usedAt)) ? e.usedAt : new Date(0).toISOString(),
    });
  }
  return out.sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt));
}

/**
 * The list with this address on top (used now). The same address given again replaces the old entry, keeping its
 * area and map link when the new one has none. Only the newest MAX_ADDRESSES are kept.
 */
export function withAddress(list: SavedAddress[], entry: { text: string; area?: string | null; mapUrl?: string | null }, now = new Date()): SavedAddress[] {
  const text = entry.text.trim().slice(0, 500);
  if (!normal(text)) return list;
  const old = list.find((a) => sameAddress(a.text, text));
  const top: SavedAddress = { text, area: entry.area?.trim() || old?.area || null, mapUrl: entry.mapUrl || old?.mapUrl || null, usedAt: now.toISOString() };
  return [top, ...list.filter((a) => !sameAddress(a.text, text))].slice(0, MAX_ADDRESSES);
}

/** Merges several lists (saved, latest on the profile, past orders), newest first, without repeats. */
export function mergeAddresses(...lists: SavedAddress[][]): SavedAddress[] {
  const all = lists.flat().sort((a, b) => Date.parse(b.usedAt) - Date.parse(a.usedAt));
  const out: SavedAddress[] = [];
  for (const a of all) if (!out.some((o) => sameAddress(o.text, a.text))) out.push(a);
  return out.slice(0, MAX_ADDRESSES);
}

/** "1", "2nd", "address 3", "#2" → 0-based index; null for anything else. */
export function pickedNumber(text: string, count: number): number | null {
  const m = /^\s*(?:address\s*|no\.?\s*|#)?([1-9])(?:st|nd|rd|th)?\s*(?:address|one)?\s*[.!]?\s*$/i.exec(text);
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return i < count ? i : null;
}
