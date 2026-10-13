/*
 * Wallet prices, shared by the server and the wallet page. Meta's India rates per delivered message,
 * before GST (keep in step with RATES in lib/spend.ts). Meta adds 18% GST, so a charge is rate × 1.18.
 */

export const WALLET_CATEGORIES = ["marketing", "utility", "authentication", "service"] as const;
export type WalletCategory = (typeof WALLET_CATEGORIES)[number];

export const META_RATES: Record<WalletCategory, number> = {
  marketing: 0.8631,
  utility: 0.115,
  authentication: 0.115,
  service: 0.115,
};

export const WALLET_GST = 0.18;

export const CATEGORY_NAMES: Record<WalletCategory, string> = {
  marketing: "Marketing (offers, campaigns)",
  utility: "Utility (order and payment updates)",
  authentication: "Authentication (OTP)",
  service: "Service (replies; Meta's free ones cost nothing)",
};

/** The client's rate per category before GST: their own where set, else Meta's. */
export function ratesFor(raw: unknown): Record<WalletCategory, number> {
  const own = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = { ...META_RATES };
  for (const c of WALLET_CATEGORIES) {
    const v = Number(own[c]);
    if (Number.isFinite(v) && v >= 0 && v <= 100) out[c] = v;
  }
  return out;
}

/** What one delivered message costs the wallet, GST included. */
export const chargeFor = (rate: number) => Math.round(rate * (1 + WALLET_GST) * 10_000) / 10_000;

/** Template category (MARKETING / UTILITY / AUTHENTICATION) → wallet category. */
export const categoryOfTemplate = (c: string | null | undefined): WalletCategory =>
  c === "UTILITY" ? "utility" : c === "AUTHENTICATION" ? "authentication" : "marketing";

export const rupees = (n: number) =>
  `${n < 0 ? "−" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
