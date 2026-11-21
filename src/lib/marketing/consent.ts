"use client";

export const CONSENT_COOKIE_NAME = "thabaal_marketing_consent";
export const CONSENT_STORAGE_KEY = "thabaal:marketing-consent";
export type ConsentStatus = "granted" | "denied" | null;

export function getMarketingConsent(): ConsentStatus {
  if (typeof window === "undefined") return null;
  try {
    // 0. Turn 53 Architect Condition B: One-shot, fail-closed reset parameter check
    const search = window.location.search;
    if (search && (search.includes("reset_consent=1") || search.includes("cookie_settings=1"))) {
      resetMarketingConsent();
      // Strip reset parameter from visible URL so later navigations or reloads do not re-trigger reset
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("reset_consent");
        url.searchParams.delete("cookie_settings");
        const cleanSearch = url.searchParams.toString();
        const cleanUrl = url.pathname + (cleanSearch ? `?${cleanSearch}` : "") + url.hash;
        window.history.replaceState({}, "", cleanUrl);
      } catch {}
      return null;
    }

    // 1. Check cookie
    const match = document.cookie.match(new RegExp(`(^|;\\s*)${CONSENT_COOKIE_NAME}=([^;]*)`));
    if (match) {
      const val = decodeURIComponent(match[2]);
      if (val === "granted" || val === "denied") return val;
    }
    // 2. Check localStorage fallback
    const local = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (local === "granted" || local === "denied") return local;
  } catch {}
  return null;
}

export function setMarketingConsent(status: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  try {
    const maxAge = 365 * 24 * 60 * 60; // 1 year
    document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(status)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, status);
    } catch {}
    window.dispatchEvent(new CustomEvent("thabaal:consent-change", { detail: status }));
  } catch {}
}

export function resetMarketingConsent(): void {
  if (typeof window === "undefined") return;
  try {
    document.cookie = `${CONSENT_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {}
    window.dispatchEvent(new CustomEvent("thabaal:consent-change", { detail: null }));
  } catch {}
}
