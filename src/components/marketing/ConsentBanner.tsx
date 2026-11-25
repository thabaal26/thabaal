"use client";

import { useEffect, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  getMarketingConsent,
  setMarketingConsent,
  type ConsentStatus,
} from "@/lib/marketing/consent";
import { useLanguage } from "@/lib/i18n/context";

export function ConsentBanner({ lang: propLang }: { lang?: "en" | "ta" } = {}) {
  const [consent, setConsent] = useState<ConsentStatus>("denied"); // default hidden until mounted
  const [mounted, setMounted] = useState(false);

  let ctxLang: "en" | "ta" = "ta";
  try {
    const ctx = useLanguage();
    if (ctx?.lang) ctxLang = ctx.lang;
  } catch {}

  useEffect(() => {
    setMounted(true);
    setConsent(getMarketingConsent());

    const handler = (e: Event) => {
      const custom = e as CustomEvent<ConsentStatus>;
      setConsent(custom.detail);
    };

    const storageHandler = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY || event.key === null) {
        setConsent(getMarketingConsent());
      }
    };

    window.addEventListener("thabaal:consent-change", handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("thabaal:consent-change", handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  if (!mounted || consent !== null) {
    return null; // Don't show if user already made a choice
  }

  const activeLang = propLang || ctxLang || "ta";
  const ta = activeLang === "ta";

  return (
    <div
      role="region"
      aria-label="Cookie consent banner"
      className="relative w-full z-40 px-3.5 py-2.5 sm:px-5 sm:py-3 bg-[#161b22] border-b border-gray-800 shadow-lg text-white lg:fixed lg:inset-x-auto lg:bottom-5 lg:right-5 lg:max-w-md lg:p-4 lg:rounded-2xl lg:border lg:bg-[#161b22]/95 lg:backdrop-blur lg:shadow-2xl"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-stretch justify-between gap-2.5 sm:gap-4 lg:gap-3">
        <div className="text-xs sm:text-sm text-gray-300 space-y-0.5 sm:space-y-1">
          <p className="font-semibold text-white">
            {ta ? "குக்கீகள் & விளம்பர கண்காணிப்பு" : "Cookie & Marketing Preferences"}
          </p>
          <p className="text-gray-400 leading-snug">
            {ta
              ? "விளம்பர அளவீடு மற்றும் பகுப்பாய்விற்காக கூகுள் விளம்பர குறிச்சொற்களைப் பயன்படுத்த உங்கள் அனுமதியைத் தேர்ந்தெடுக்கவும். நீங்கள் நிராகரித்தாலும் அனைத்து சேவைகளையும் முழுமையாகப் பயன்படுத்தலாம்."
              : "Choose whether to enable Google Ads measurement and performance cookies. You can use all Thabaal services normally even if you decline."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto lg:w-full">
          <button
            type="button"
            onClick={() => setMarketingConsent("denied")}
            className="flex-1 sm:flex-none lg:flex-1 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium transition border border-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161b22]"
          >
            {ta ? "நிராகரி" : "Decline"}
          </button>
          <button
            type="button"
            onClick={() => setMarketingConsent("granted")}
            className="flex-1 sm:flex-none lg:flex-1 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition shadow-lg shadow-emerald-900/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#161b22]"
          >
            {ta ? "ஏற்கிறேன்" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}
