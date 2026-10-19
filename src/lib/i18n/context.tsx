"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DICTIONARY } from "./dict";
import { trNode, trText } from "./phrases-ta";

export type Lang = "en" | "ta";
export const LANG_KEY = "thabaal-lang";
export const LANG_COOKIE = "thabaal-lang";
export const LANG_EVENT = "thabaal-lang";

function getLangSnapshot(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    return localStorage.getItem(LANG_KEY) === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

function subscribeLang(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(LANG_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LANG_EVENT, callback);
  };
}

export function setLanguage(next: Lang) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LANG_KEY, next);
    // Write cookie for SSR and server components
    document.cookie = `${LANG_COOKIE}=${next};path=/;max-age=31536000;SameSite=Lax`;
    // Set html element lang attribute directly
    document.documentElement.lang = next;
  } catch {}
  window.dispatchEvent(new Event(LANG_EVENT));
}

interface LanguageContextType {
  lang: Lang;
  isTamil: boolean;
  isTa: boolean;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (section: keyof typeof DICTIONARY, key: string, fallback?: string) => string;
}

export const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ initialLang = "en", children }: { initialLang?: Lang; children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, () => initialLang);
  const isTamil = lang === "ta";
  const isTa = isTamil;

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      // Sync cookie if missing
      if (!document.cookie.includes(`${LANG_COOKIE}=`)) {
        document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=31536000;SameSite=Lax`;
      }
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLanguage(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLanguage(lang === "ta" ? "en" : "ta");
  }, [lang]);

  const t = useCallback(
    (section: keyof typeof DICTIONARY, key: string, fallback?: string): string => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (DICTIONARY as any)[section];
      if (s && s[key]) {
        return s[key][lang] ?? s[key]["en"] ?? fallback ?? key;
      }
      return fallback ?? key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, isTamil, isTa, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * `tr("Save")` gives the Tamil for a fixed phrase in Tamil mode (English otherwise, or when the
 * phrase has no Tamil yet); `trn(children)` does the same for the text parts of a label.
 */
export function useTr() {
  const { isTa } = useLanguage();
  return {
    isTa,
    tr: (s: string) => trText(s, isTa),
    trn: (n: ReactNode) => trNode(n, isTa),
    /** Pick the English or the Tamil sentence. */
    L: <V,>(en: V, ta: V): V => (isTa ? ta : en),
  };
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Graceful fallback outside provider
    const current = getLangSnapshot();
    return {
      lang: current,
      isTamil: current === "ta",
      isTa: current === "ta",
      setLang: setLanguage,
      toggleLang: () => setLanguage(current === "ta" ? "en" : "ta"),
      t: (section: keyof typeof DICTIONARY, key: string, fallback?: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (DICTIONARY as any)[section];
        if (s && s[key]) {
          return s[key][current] ?? s[key]["en"] ?? fallback ?? key;
        }
        return fallback ?? key;
      },
    };
  }
  return ctx;
}
