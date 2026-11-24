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

interface ConversionDispatchState {
  status: "pending" | "tag_callback_completed" | "retryable" | "max_retries_exceeded";
  attempts: number;
  lastAttemptTs: number;
}

const MAX_DISPATCH_ATTEMPTS = 3;
const DISPATCH_TIMEOUT_MS = 2000; // matches Google event_timeout: 2000
const GRACE_BUFFER_MS = 1000;
const IN_FLIGHT_WINDOW_MS = DISPATCH_TIMEOUT_MS + GRACE_BUFFER_MS; // 3000ms

export function GoogleAdsConversion({ transactionId }: { transactionId?: string | null }) {
  const { enabled } = useContext(AdsContext);
  const [attemptTrigger, setAttemptTrigger] = useState(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !transactionId) return;
    if (typeof window === "undefined") return;

    const storageKey = `thabaal-ads-conv:${transactionId}`;

    function parseState(): ConversionDispatchState | null {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        if (raw.startsWith("{")) {
          return JSON.parse(raw);
        }
        if (raw === "dispatched" || raw === "done" || raw === "tag_callback_completed") {
          return { status: "tag_callback_completed", attempts: 1, lastAttemptTs: Date.now() };
        }
        if (raw.startsWith("queued:")) {
          const ts = parseInt(raw.slice(7), 10);
          return { status: "pending", attempts: 1, lastAttemptTs: isNaN(ts) ? Date.now() : ts };
        }
        if (raw === "retryable") {
          return { status: "retryable", attempts: 1, lastAttemptTs: Date.now() };
        }
        return null;
      } catch {
        return null;
      }
    }

    function saveState(state: ConversionDispatchState) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    }

    const current = parseState();

    // 1. Terminal states: permanent suppression for this session
    if (current?.status === "tag_callback_completed" || current?.status === "max_retries_exceeded") {
      return;
    }

    const currentAttempts = current?.attempts ?? 0;
    if (currentAttempts >= MAX_DISPATCH_ATTEMPTS) {
      saveState({ status: "max_retries_exceeded", attempts: currentAttempts, lastAttemptTs: Date.now() });
      return;
    }

    // 2. In-flight concurrency check: if currently pending within window, do not double-dispatch
    if (current?.status === "pending") {
      const elapsed = Date.now() - current.lastAttemptTs;
      if (elapsed < IN_FLIGHT_WINDOW_MS) {
        // Schedule recovery timer for remaining time if not already handled
        const remaining = IN_FLIGHT_WINDOW_MS - elapsed;
        const timer = setTimeout(() => {
          setAttemptTrigger((prev) => prev + 1);
        }, remaining + 100);
        return () => clearTimeout(timer);
      }
      // If elapsed >= 3000ms, past attempt expired without callback -> falls through to bounded retry
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const nextAttempts = currentAttempts + 1;
    saveState({
      status: "pending",
      attempts: nextAttempts,
      lastAttemptTs: Date.now(),
    });

    let recoveryTimer: NodeJS.Timeout | null = null;

    try {
      (window as any).dataLayer = (window as any).dataLayer || [];
      if (typeof (window as any).gtag !== "function") {
        (window as any).gtag = function () {
          (window as any).dataLayer.push(arguments);
        };
      }

      // Schedule in-page automatic recovery timer if Google callback stalls
      recoveryTimer = setTimeout(() => {
        inFlightRef.current = false;
        const check = parseState();
        if (check?.status === "pending") {
          if (nextAttempts < MAX_DISPATCH_ATTEMPTS) {
            saveState({ status: "retryable", attempts: nextAttempts, lastAttemptTs: Date.now() });
            setAttemptTrigger((prev) => prev + 1);
          } else {
            saveState({ status: "max_retries_exceeded", attempts: nextAttempts, lastAttemptTs: Date.now() });
          }
        }
      }, IN_FLIGHT_WINDOW_MS);

      (window as any).gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
        value: 1.0,
        currency: "INR",
        transaction_id: transactionId,
        event_callback: () => {
          if (recoveryTimer) clearTimeout(recoveryTimer);
          inFlightRef.current = false;
          saveState({
            status: "tag_callback_completed",
            attempts: nextAttempts,
            lastAttemptTs: Date.now(),
          });
        },
        event_timeout: DISPATCH_TIMEOUT_MS,
      });
    } catch (err) {
      console.warn("[GoogleAdsConversion] Failed to dispatch conversion:", err);
      if (recoveryTimer) clearTimeout(recoveryTimer);
      inFlightRef.current = false;
      saveState({
        status: nextAttempts < MAX_DISPATCH_ATTEMPTS ? "retryable" : "max_retries_exceeded",
        attempts: nextAttempts,
        lastAttemptTs: Date.now(),
      });
    }

    return () => {
      if (recoveryTimer) clearTimeout(recoveryTimer);
    };
  }, [enabled, transactionId, attemptTrigger]);

  return null;
}
