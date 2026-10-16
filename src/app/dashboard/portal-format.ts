/** Plain helpers for the portal pages, usable on the server and in the browser. */

/** ₹1,23,456 (Indian grouping, whole rupees). */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
