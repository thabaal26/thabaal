export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
export const GOOGLE_ADS_CONVERSION_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? "";
export const isAdsConfigValid =
  /^AW-\d+$/.test(GOOGLE_ADS_ID) && /^[A-Za-z0-9_-]+$/.test(GOOGLE_ADS_CONVERSION_LABEL);

export type GoogleAdsLoaderStatus = "idle" | "loading" | "loaded" | "error";

export interface GoogleAdsRuntime {
  adsId: string;
  configured: boolean;
  status: GoogleAdsLoaderStatus;
  promise?: Promise<void>;
}

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: any[]) => void;
    __thabaalGoogleAdsRuntime?: GoogleAdsRuntime;
  }
}

export const GOOGLE_ADS_SCRIPT_ID = "thabaal-google-ads-tag";

/**
 * Initializes the window dataLayer, gtag shim, Consent Mode v2 signals, and tag configuration
 * strictly once per document lifecycle. Subsequent consent grants update consent state without
 * issuing duplicate gtag('config', ...) commands.
 */
export function initializeGoogleAdsQueue(adsId: string): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }

  let state = window.__thabaalGoogleAdsRuntime;
  if (!state) {
    state = {
      adsId,
      configured: false,
      status: "idle",
    };
    window.__thabaalGoogleAdsRuntime = state;
  }

  if (state.adsId !== adsId) {
    throw new Error("Thabaal Google Ads runtime ID mismatch");
  }

  if (!state.configured) {
    window.gtag("consent", "default", {
      'ad_storage': 'denied',
      'analytics_storage': 'denied',
      'ad_user_data': 'denied',
      'ad_personalization': 'denied',
    });
    window.gtag("consent", "update", {
      'ad_storage': 'granted',
      'analytics_storage': 'granted',
      'ad_user_data': 'granted',
      'ad_personalization': 'granted',
    });
    window.gtag("js", new Date());
    window.gtag("config", adsId);
    state.configured = true;
  } else {
    window.gtag("consent", "update", {
      'ad_storage': 'granted',
      'analytics_storage': 'granted',
      'ad_user_data': 'granted',
      'ad_personalization': 'granted',
    });
  }
}

/**
 * Idempotent document-level Google tag script loader with shared promise caching and explicit
 * readiness tracking (`idle` | `loading` | `loaded` | `error`). Never treats mere DOM element
 * presence as proof that the remote script finished loading.
 */
export function ensureGoogleAdsScriptLoaded(adsId: string): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  let runtime = window.__thabaalGoogleAdsRuntime;
  if (!runtime) {
    runtime = { adsId, configured: false, status: "idle" };
    window.__thabaalGoogleAdsRuntime = runtime;
  }

  if (runtime.adsId !== adsId) {
    return Promise.reject(new Error("Thabaal Google Ads runtime ID mismatch"));
  }

  if (runtime.status === "loaded") {
    return Promise.resolve();
  }

  if (runtime.status === "loading" && runtime.promise) {
    return runtime.promise;
  }

  const expectedSrc = `https://www.googletagmanager.com/gtag/js?id=${adsId}`;
  const existing =
    (document.getElementById(GOOGLE_ADS_SCRIPT_ID) as HTMLScriptElement | null) ||
    (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${adsId}"]`) as HTMLScriptElement | null);

  if (existing && existing.dataset.thabaalLoaded === "1") {
    runtime.status = "loaded";
    return Promise.resolve();
  }

  runtime.status = "loading";
  const loadPromise = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.id = GOOGLE_ADS_SCRIPT_ID;
      script.async = true;
      script.src = expectedSrc;
    }

    const onLoad = () => {
      cleanup();
      script.dataset.thabaalLoaded = "1";
      runtime!.status = "loaded";
      resolve();
    };

    const onError = () => {
      cleanup();
      script.remove();
      runtime!.status = "error";
      runtime!.promise = undefined;
      reject(new Error("Failed to load Google Ads tag script"));
    };

    const cleanup = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existing) {
      document.head.appendChild(script);
    }
  });

  runtime.promise = loadPromise;
  return loadPromise;
}
