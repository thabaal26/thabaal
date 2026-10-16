// The order number people see and quote. Clients set up for 100+ businesses each get their own prefix and
// running number ("FM-1001"), stored on the order as `ref`. Orders from before that carry no ref and keep the
// original shared form, RG-<1000 + number>. Safe to import anywhere (no database access).

/** The order number people see, e.g. FM-1001 (or RG-1023 for orders made before per-client numbers). */
export const orderRef = (o: { number: number; ref: string | null }) => o.ref ?? `RG-${1000 + o.number}`;

/** Finds an order number like "FM-1001" or "#rg-1023" inside a message or note. */
export const ORDER_REF_RE = /\b([A-Z]{2,5}-\d{4,})\b/i;

/** Order lookup for a reference from orderRef, or an order id (payment requests sent before order numbers). */
export function orderWhereRef(ref: string) {
  const r = ref.trim().replace(/^#/, "");
  if (!/^[A-Z]{2,5}-\d+$/i.test(r)) return { id: r };
  const legacy = /^RG-(\d+)$/i.exec(r);
  return {
    OR: [
      { ref: { equals: r.toUpperCase() } },
      // Orders made before per-client numbers have no ref; RG-1023 means number 23.
      ...(legacy ? [{ ref: null, number: Number(legacy[1]) - 1000 }] : []),
    ],
  };
}

/** Initials of a business name for its order prefix: "Fresh Mart" → "FM", "Cup N Saucer" → "CNS". */
export function prefixFromName(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("").replace(/[^A-Z]/g, "");
  const p = (initials.length >= 2 ? initials : (words[0] ?? "OR").replace(/[^A-Z]/g, "")).slice(0, 4);
  return p.length >= 2 ? p : "OR";
}

export type OrderItem = {
  id: string;
  name?: string;
  quantity: number;
  price: number;
  currency?: string;
};

