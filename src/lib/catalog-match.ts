// Ties order lines and free-text purchase notes to catalogue products. The catalogue is the only
// list of products: anything that doesn't match an item in it (a typed "Oil", a customer tag, a
// product since removed) is not a product and is left out of product views.

export type CatalogRef = { retailerId: string; name: string };

const SIZE = /\b\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|liter|litres|kg|g|gm|gms|gram|grams|pcs|pc)\b|\bx\s*\d+\b|\b\d+\s*x\b/g;
const SIZE_ONE = new RegExp(SIZE.source);
/** Words that alone don't identify a product ("oil" could be any oil). */
const GENERIC = new Set(["oil", "oils", "powder", "flour", "cold", "pressed", "pure", "organic", "natural", "fresh", "free", "pack", "bottle", "the", "and", "of", "with"]);
/** Local and alternate names written in notes and manual orders. */
const SYNONYMS: Record<string, string> = { sesame: "gingelly", seesame: "gingelly", nallennai: "gingelly", til: "gingelly", badam: "almond", flaxseed: "flax", linseed: "flax", bajra: "kambu" };

export const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim();

const sizeOf = (s: string) => (s.toLowerCase().match(SIZE) ?? []).map((x) => x.replace(/\s+/g, "").replace(/ltr|litre|liter|litres/, "l").replace(/gms?|grams?/, "g")).join(" ");

function tokens(s: string) {
  const core = s.toLowerCase().replace(/\([^)]*\)/g, (m) => (SIZE_ONE.test(m) ? " " : ` ${m.slice(1, -1)} `)).replace(SIZE, " ");
  return normKey(core)
    .split(" ")
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t);
}

type Entry = CatalogRef & { key: string; toks: string[]; core: string; size: string };

/**
 * A matcher over one catalogue. `item` matches an order line by SKU first, then by name;
 * `text` finds every catalogue product a free-text note (e.g. "Coconut oil (1 ltr), Badam oil") mentions.
 */
export function catalogMatcher(products: readonly CatalogRef[]) {
  const entries: Entry[] = products.map((p) => {
    const toks = tokens(p.name);
    return { retailerId: p.retailerId, name: p.name, key: normKey(p.name), toks, core: toks.join(" "), size: sizeOf(p.name) };
  });
  const bySku = new Map(entries.map((e) => [e.retailerId.toLowerCase(), e]));
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const memo = new Map<string, CatalogRef | null>();

  const byName = (raw: string): CatalogRef | null => {
    const key = normKey(raw);
    if (!key) return null;
    if (memo.has(key)) return memo.get(key)!;
    let hit: Entry | null = byKey.get(key) ?? null;
    if (!hit) {
      const toks = tokens(raw);
      const core = toks.join(" ");
      const squash = core.replace(/ /g, "");
      const size = sizeOf(raw);
      const distinct = toks.filter((t) => !GENERIC.has(t));
      const same = entries.filter((e) => e.core === core || e.core.replace(/ /g, "") === squash);
      let pool = same;
      if (!pool.length && distinct.length) {
        // Every distinctive word of the shorter name appears in the longer one ("Coconut oil" ⊂ "Sulphur free Coconut oil").
        pool = entries.filter((e) => {
          const eDistinct = e.toks.filter((t) => !GENERIC.has(t));
          if (!eDistinct.length) return false;
          const a = new Set(e.toks);
          const b = new Set(toks);
          return distinct.every((t) => a.has(t)) || eDistinct.every((t) => b.has(t));
        });
      }
      if (pool.length > 1 && size) pool = pool.filter((e) => e.size === size).length ? pool.filter((e) => e.size === size) : pool;
      // Prefer the closest name: fewest extra words.
      hit = pool.sort((x, y) => Math.abs(x.toks.length - toks.length) - Math.abs(y.toks.length - toks.length) || x.name.localeCompare(y.name))[0] ?? null;
    }
    const ref = hit ? { retailerId: hit.retailerId, name: hit.name } : null;
    memo.set(key, ref);
    return ref;
  };

  return {
    products: entries.map(({ retailerId, name }) => ({ retailerId, name })),
    /** The catalogue product an order line is, or null when it isn't one. */
    item(line: { id?: string | null; name?: string | null }): CatalogRef | null {
      const sku = line.id?.trim().toLowerCase();
      const e = sku ? bySku.get(sku) : undefined;
      if (e) return { retailerId: e.retailerId, name: e.name };
      return line.name ? byName(line.name) : null;
    },
    /** Catalogue products a free-text purchases note mentions. */
    text(note: string | null | undefined): CatalogRef[] {
      if (!note?.trim()) return [];
      const seen = new Map<string, CatalogRef>();
      for (const part of note.split(/[,/;&+\n]|\band\b/i)) {
        const ref = byName(part);
        if (ref) seen.set(ref.retailerId, ref);
      }
      return [...seen.values()];
    },
    /** The catalogue product a filter value names (its SKU or its name). */
    named(value: string): CatalogRef | null {
      const e = bySku.get(value.trim().toLowerCase()) ?? byKey.get(normKey(value));
      return e ? { retailerId: e.retailerId, name: e.name } : null;
    },
  };
}

export type CatalogMatcher = ReturnType<typeof catalogMatcher>;
