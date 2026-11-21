"use client";

export const CONSENT_COOKIE_NAME = "thabaal_marketing_consent";
export type ConsentStatus = "granted" | "denied" | null;

export function getMarketingConsent(): ConsentStatus {
  if (typeof window === "undefined") return null;
  try {
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${CONSENT_COOKIE_NAME}=([^;]*)`));
    if (match) {
      const val = decodeURIComponent(match[2]);
      if (val === "granted" || val === "denied") return val;
    }
  } catch {}
  return null;
}

export function setMarketingConsent(status: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  try {
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(status)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    window.dispatchEvent(new CustomEvent("thabaal:consent-change", { detail: status }));
  } catch {}
}
