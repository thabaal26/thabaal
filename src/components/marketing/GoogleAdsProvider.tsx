"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getMarketingConsent, type ConsentStatus } from "@/lib/marketing/consent";
import {
  computeRetryBackoffMs,
  DISPATCH_TIMEOUT_MS,
  IN_FLIGHT_WINDOW_MS,
  MAX_DISPATCH_ATTEMPTS,
  readConversionDispatchState,
  writeConversionDispatchState,
  type ConversionDispatchState,
} from "@/lib/marketing/google-ads-dispatch-state";
import {
  ensureGoogleAdsScriptLoaded,
  GOOGLE_ADS_CONVERSION_LABEL,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SCRIPT_ID,
  initializeGoogleAdsQueue,
  isAdsConfigValid,
  type GoogleAdsLoaderStatus,
  type GoogleAdsRuntime,
} from "@/lib/marketing/google-ads-loader";

export {
  ensureGoogleAdsScriptLoaded,
  GOOGLE_ADS_CONVERSION_LABEL,
  GOOGLE_ADS_ID,
  GOOGLE_ADS_SCRIPT_ID,
  initializeGoogleAdsQueue,
  isAdsConfigValid,
  type GoogleAdsLoaderStatus,
  type GoogleAdsRuntime,
};

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
      if (typeof window !== "undefined" && typeof window.gtag === "function") {
        window.gtag("consent", "update", {
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

  useEffect(() => {
    if (!shouldLoadScripts) {
      setReady(false);
      return;
    }

    let active = true;
    setReady(false);

    try {
      initializeGoogleAdsQueue(GOOGLE_ADS_ID);
      ensureGoogleAdsScriptLoaded(GOOGLE_ADS_ID)
        .then(() => {
          if (active) setReady(true);
        })
        .catch((error) => {
          if (active) setReady(false);
          console.error(
            "[GoogleAdsProvider] Tag loading failed:",
            error instanceof Error ? error.message : "Unknown error",
          );
        });
    } catch (error) {
      if (active) setReady(false);
      console.error(
        "[GoogleAdsProvider] Queue initialization failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    return () => {
      active = false;
    };
  }, [shouldLoadScripts]);

  return (
    <AdsContext.Provider value={{ ready, consent, enabled: shouldLoadScripts }}>
      {children}
    </AdsContext.Provider>
  );
}

// Module-scoped in-memory session cache ensuring retry-limit bound is strictly enforced
// across the JavaScript page lifecycle, even if sessionStorage throws or contains stale data.
const memoryFallback = new Map<string, ConversionDispatchState>();

export function GoogleAdsConversion({ transactionId }: { transactionId?: string | null }) {
  const { enabled, ready } = useContext(AdsContext);
  const [attemptTrigger, setAttemptTrigger] = useState(0);
  const inFlightRef = useRef(false);
  const attemptGenerationRef = useRef(0);

  useEffect(() => {
    // Wait strictly for marketing consent (`enabled`), actual script readiness (`ready`), and persisted reference.
    if (!enabled || !ready || !transactionId) return;
    if (typeof window === "undefined") return;

    const generation = ++attemptGenerationRef.current;
    const storageKey = `thabaal-ads-conv:${transactionId}`;
    const storage = typeof window.sessionStorage !== "undefined" ? window.sessionStorage : null;

    const readState = () => readConversionDispatchState(storageKey, memoryFallback, storage);
    const writeState = (state: ConversionDispatchState) =>
      writeConversionDispatchState(storageKey, state, memoryFallback, storage);

    const current = readState();

    // 1. Terminal states: permanent suppression for this session / page lifecycle
    if (current?.status === "tag_callback_completed" || current?.status === "max_retries_exceeded") {
      return;
    }

    const currentAttempts = current?.attempts ?? 0;
    if (currentAttempts >= MAX_DISPATCH_ATTEMPTS) {
      writeState({ status: "max_retries_exceeded", attempts: currentAttempts, lastAttemptTs: Date.now() });
      return;
    }

    // 2. In-flight concurrency check: if currently pending within window, wait remaining buffer
    if (current?.status === "pending") {
      const elapsed = Date.now() - current.lastAttemptTs;
      if (elapsed < IN_FLIGHT_WINDOW_MS) {
        const remaining = IN_FLIGHT_WINDOW_MS - elapsed;
        const waitTimer = setTimeout(() => {
          if (attemptGenerationRef.current !== generation) return;
          setAttemptTrigger((prev) => prev + 1);
        }, remaining + 100);
        return () => {
          if (attemptGenerationRef.current === generation) {
            attemptGenerationRef.current += 1;
          }
          clearTimeout(waitTimer);
        };
      }
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const nextAttempts = currentAttempts + 1;
    writeState({
      status: "pending",
      attempts: nextAttempts,
      lastAttemptTs: Date.now(),
    });

    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      window.dataLayer = window.dataLayer || [];
      if (typeof window.gtag !== "function") {
        window.gtag = function gtag() {
          // eslint-disable-next-line prefer-rest-params
          window.dataLayer!.push(arguments);
        };
      }

      // Schedule automatic in-page recovery timer if Google callback stalls past timeout + grace buffer
      recoveryTimer = setTimeout(() => {
        if (attemptGenerationRef.current !== generation) return;
        inFlightRef.current = false;
        const check = readState();
        if (check?.status === "pending") {
          if (nextAttempts < MAX_DISPATCH_ATTEMPTS) {
            writeState({ status: "retryable", attempts: nextAttempts, lastAttemptTs: Date.now() });
            setAttemptTrigger((prev) => prev + 1);
          } else {
            writeState({ status: "max_retries_exceeded", attempts: nextAttempts, lastAttemptTs: Date.now() });
          }
        }
      }, IN_FLIGHT_WINDOW_MS);

      window.gtag("event", "conversion", {
        send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_CONVERSION_LABEL}`,
        value: 1.0,
        currency: "INR",
        transaction_id: transactionId,
        event_callback: () => {
          if (attemptGenerationRef.current !== generation) return;
          if (recoveryTimer) clearTimeout(recoveryTimer);
          if (retryTimer) clearTimeout(retryTimer);
          inFlightRef.current = false;
          writeState({
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
      const targetStatus = nextAttempts < MAX_DISPATCH_ATTEMPTS ? "retryable" : "max_retries_exceeded";
      writeState({
        status: targetStatus,
        attempts: nextAttempts,
        lastAttemptTs: Date.now(),
      });
      if (nextAttempts < MAX_DISPATCH_ATTEMPTS) {
        const backoffMs = computeRetryBackoffMs(nextAttempts);
        retryTimer = setTimeout(() => {
          if (attemptGenerationRef.current !== generation) return;
          setAttemptTrigger((prev) => prev + 1);
        }, backoffMs);
      }
    }

    return () => {
      if (attemptGenerationRef.current === generation) {
        attemptGenerationRef.current += 1;
      }
      inFlightRef.current = false;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [enabled, ready, transactionId, attemptTrigger]);

  return null;
}
