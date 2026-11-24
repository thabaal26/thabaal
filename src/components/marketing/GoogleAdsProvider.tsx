"use client";

import Script from "next/script";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getMarketingConsent, type ConsentStatus } from "@/lib/marketing/consent";

// Strict configuration validation: NO production credentials as hardcoded defaults
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
export const GOOGLE_ADS_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? "";
export const isAdsConfigValid = /^AW-\d+$/.test(GOOGLE_ADS_ID) && /^[A-Za-z0-9_-]+$/.test(GOOGLE_ADS_CONVERSION_LABEL);

type AdsContextType = {
  ready: boolean;
  consent: ConsentStatus;
  enabled: boolean;
};

const AdsContext = createContext<AdsContextType>({ ready: false, consent: null, enabled: false });

export function GoogleAdsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentStatus>(null);

  useEffect(() => {
    const current = getMarketingConsent();
    setConsent(current);

    const handler = (e: Event) => {
      const custom = e as CustomEvent<ConsentStatus>;
      const newStatus = custom.detail;
      setConsent(newStatus);
      if (typeof window !== "undefined" && typeof (window as any).gtag === "function") {
        (window as any).gtag("consent", "update", {
          ad_storage: newStatus === "granted" ? "granted" : "denied",
          analytics_storage: newStatus === "granted" ? "granted" : "denied",
          ad_user_data: newStatus === "granted" ? "granted" : "denied",
          ad_personalization: newStatus === "granted" ? "granted" : "denied",
        });
      }
    };
    window.addEventListener("thabaal:consent-change", handler);
    return () => window.removeEventListener("thabaal:consent-change", handler);
  }, []);

  // Basic Consent Mode: Tags load ONLY when consent is granted AND configuration is valid
  const shouldLoadScripts = isAdsConfigValid && consent === "granted";

  return (
    <AdsContext.Provider value={{ ready, consent, enabled: shouldLoadScripts }}>
      {shouldLoadScripts && (
        <>
          <Script
            id="thabaal-google-ads-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('consent', 'default', {
                  'ad_storage': 'denied',
                  'analytics_storage': 'denied',
                  'ad_user_data': 'denied',
                  'ad_personalization': 'denied'
                });
                gtag('consent', 'update', {
                  'ad_storage': 'granted',
                  'analytics_storage': 'granted',
                  'ad_user_data': 'granted',
                  'ad_personalization': 'granted'
                });
                gtag('js', new Date());
                gtag('config', '${GOOGLE_ADS_ID}');
              `,
            }}
          />
          <Script
            id="thabaal-google-ads-tag"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
            onLoad={() => setReady(true)}
          />
        </>
      )}
      {children}
    </AdsContext.Provider>
  );
}

export function GoogleAdsConversion({ transactionId }: { transactionId?: string | null }) {
  const { enabled } = useContext(AdsContext);
  const lastAttemptedId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !transactionId) return;
    if (lastAttemptedId.current === transactionId) return;
    if (typeof window === "undefined") return;

    const storageKey = `thabaal-ads-conv:${transactionId}`;
    try {
      const status = sessionStorage.getItem(storageKey);
      if (status === "dispatched" || status === "done" || status === "queued") return;
    } catch {}

    lastAttemptedId.current = transactionId;

    try {
      (window as any).dataLayer = (window as any).dataLayer || [];
      if (typeof (window as any).gtag !== "function") {
        (window as any).gtag = function () {
          (window as any).dataLayer.push(arguments);
        };
      }

      try {
        sessionStorage.setItem(storageKey, "queued");
      } catch {}

      (window as any).gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
        value: 1.0,
        currency: "INR",
        transaction_id: transactionId,
        event_callback: () => {
          try {
            sessionStorage.setItem(storageKey, "dispatched");
          } catch {}
        },
        event_timeout: 2000,
      });
    } catch (err) {
      console.warn("[GoogleAdsConversion] Failed to dispatch conversion:", err);
      try {
        sessionStorage.setItem(storageKey, "retryable");
      } catch {}
    }
  }, [enabled, transactionId]);

  return null;
}
