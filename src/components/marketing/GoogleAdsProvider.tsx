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
    setConsent(getMarketingConsent());

    const handler = (e: Event) => {
      const custom = e as CustomEvent<ConsentStatus>;
      setConsent(custom.detail);
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
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !transactionId || firedRef.current) return;
    if (typeof window === "undefined") return;

    const storageKey = `thabaal-ads-conv:${transactionId}`;
    try {
      if (sessionStorage.getItem(storageKey) === "done") return;
    } catch {}

    firedRef.current = true;

    try {
      (window as any).dataLayer = (window as any).dataLayer || [];
      if (typeof (window as any).gtag !== "function") {
        (window as any).gtag = function () {
          (window as any).dataLayer.push(arguments);
        };
      }

      (window as any).gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
        value: 1.0,
        currency: "INR",
        transaction_id: transactionId,
      });

      try {
        sessionStorage.setItem(storageKey, "done");
      } catch {}
    } catch (err) {
      console.warn("[GoogleAdsConversion] Failed to dispatch conversion:", err);
    }
  }, [enabled, transactionId]);

  return null;
}
