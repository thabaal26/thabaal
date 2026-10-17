import "server-only";
import { cookies } from "next/headers";
import { DICTIONARY } from "./dict";
import { LANG_COOKIE, type Lang } from "./context";

export async function getServerLanguage(): Promise<Lang> {
  try {
    const store = await cookies();
    const val = store.get(LANG_COOKIE)?.value;
    return val === "ta" ? "ta" : "en";
  } catch {
    return "en";
  }
}

export async function getServerTranslations() {
  const lang = await getServerLanguage();
  return {
    lang,
    isTamil: lang === "ta",
    t: (section: keyof typeof DICTIONARY, key: string, fallback?: string): string => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (DICTIONARY as any)[section];
      if (s && s[key]) {
        return s[key][lang] ?? s[key]["en"] ?? fallback ?? key;
      }
      return fallback ?? key;
    },
  };
}
