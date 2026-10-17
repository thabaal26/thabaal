/** Standard delivery/shipping fee (in INR) added to every order by default. */
export const DEFAULT_SHIPPING_FEE = 60;

export type PricedItem = {
  quantity: number;
  price: number;
};

/** Rupees off an order for the loyalty points used on it (100 points = ₹50). */
export const pointsDiscount = (o: { pointsRedeemed?: number | null }) => Math.max(0, Math.round((o.pointsRedeemed ?? 0) * 0.5 * 100) / 100);

/** Computes the items subtotal for a list of order items. */
export function calcItemsSubtotal(items: PricedItem[]): number {
  return items.reduce(
    (sum, i) => sum + (Math.max(0, Number(i.price) || 0) * Math.max(0, Number(i.quantity) || 0)),
    0,
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Computes the full pricing breakdown (items subtotal, shipping, points discount, final total) for an order.
 * - When creating/calculating a new order with priced items, adds `shippingFee` (default ₹60).
 * - When reading an existing stored order (`storedTotal`), derives the shipping fee from
 *   `storedTotal + discount - itemsSubtotal` when that is above zero, or defaults to ₹60 if
 *   `applyDefaultWhenEqual` is true.
 * - `discount` is the loyalty points discount already taken off the stored total (pointsDiscount(order)).
 */
export function getOrderPricing(
  items: PricedItem[],
  storedTotal?: number | null,
  options?: { customShippingFee?: number; applyDefaultWhenEqual?: boolean; discount?: number },
): {
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
} {
  const subtotal = r2(calcItemsSubtotal(items));
  const discount = r2(Math.max(0, options?.discount ?? 0));
  const out = (shipping: number, gross: number) => ({ subtotal, shipping, discount, total: r2(Math.max(0, gross - discount)) });

  if (options?.customShippingFee !== undefined) {
    const shipping = subtotal > 0 ? Math.max(0, r2(options.customShippingFee)) : 0;
    return out(shipping, subtotal + shipping);
  }

  if (storedTotal !== undefined && storedTotal !== null && (storedTotal > 0 || discount > 0)) {
    const gross = r2(storedTotal + discount);
    const diff = r2(gross - subtotal);
    if (diff > 0) return out(diff, gross);
    // The stored total is what the customer owes and what payments are checked against, so a stored order never
    // gains a shipping charge it wasn't saved with (free delivery set on Edit items, orders from before shipping).
    // applyDefaultWhenEqual is kept for callers but no longer adds ₹60 here.
    return out(0, gross);
  }

  if (subtotal > 0) return out(DEFAULT_SHIPPING_FEE, subtotal + DEFAULT_SHIPPING_FEE);

  return { subtotal: 0, shipping: 0, discount: 0, total: 0 };
}
