/** Standard delivery/shipping fee (in INR) added to every order by default. */
export const DEFAULT_SHIPPING_FEE = 60;

export type PricedItem = {
  quantity: number;
  price: number;
};

/** Computes the items subtotal for a list of order items. */
export function calcItemsSubtotal(items: PricedItem[]): number {
  return items.reduce(
    (sum, i) => sum + (Math.max(0, Number(i.price) || 0) * Math.max(0, Number(i.quantity) || 0)),
    0,
  );
}

/**
 * Computes the full pricing breakdown (itemsSubtotal, shippingFee, finalTotal) for an order.
 * - When creating/calculating a new order with priced items, adds `shippingFee` (default ₹60).
 * - When reading an existing stored order (`storedTotal`), derives the shipping fee from
 *   `storedTotal - itemsSubtotal` when `storedTotal > itemsSubtotal`, or defaults to ₹60 if
 *   `applyDefaultWhenEqual` is true.
 */
export function getOrderPricing(
  items: PricedItem[],
  storedTotal?: number | null,
  options?: { customShippingFee?: number; applyDefaultWhenEqual?: boolean },
): {
  subtotal: number;
  shipping: number;
  total: number;
} {
  const subtotal = Math.round(calcItemsSubtotal(items) * 100) / 100;

  if (options?.customShippingFee !== undefined) {
    const shipping = subtotal > 0 ? Math.max(0, Math.round(options.customShippingFee * 100) / 100) : 0;
    return {
      subtotal,
      shipping,
      total: Math.round((subtotal + shipping) * 100) / 100,
    };
  }

  if (storedTotal !== undefined && storedTotal !== null && storedTotal > 0) {
    const diff = Math.round((storedTotal - subtotal) * 100) / 100;
    if (diff > 0) {
      return {
        subtotal,
        shipping: diff,
        total: Math.round(storedTotal * 100) / 100,
      };
    }
    if (options?.applyDefaultWhenEqual && subtotal > 0) {
      return {
        subtotal,
        shipping: DEFAULT_SHIPPING_FEE,
        total: Math.round((subtotal + DEFAULT_SHIPPING_FEE) * 100) / 100,
      };
    }
    return {
      subtotal,
      shipping: 0,
      total: Math.round(storedTotal * 100) / 100,
    };
  }

  if (subtotal > 0) {
    return {
      subtotal,
      shipping: DEFAULT_SHIPPING_FEE,
      total: Math.round((subtotal + DEFAULT_SHIPPING_FEE) * 100) / 100,
    };
  }

  return { subtotal: 0, shipping: 0, total: 0 };
}
