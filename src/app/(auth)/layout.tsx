import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LanguageProvider } from "@/lib/i18n/context";
import { fontClassNames, INIT_SCRIPT } from "../fonts";
import "../globals.css";
import "../controls.css";

export const metadata: Metadata = {
  title: {
    default: "Account recovery · Thabaal",
    template: "%s · Thabaal",
  },
  robots: {
    index: false,
    follow: false,
  },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171b24",
};

/**
 * Independent root layout strictly for password-recovery pages (/forgot-password, /reset-password).
 * Keeps reset tokens and recovery URLs completely isolated from marketing/Google Ads tags.
 */
export default async function AuthRootLayout({ children }: { children: React.ReactNode }) {
  let lang: "en" | "ta" = "en";
  try {
    const store = await cookies();
    const c = store.get("thabaal-lang")?.value;
    if (c === "ta" || c === "en") lang = c as "en" | "ta";
  } catch {}

  return (
    <html lang={lang} suppressHydrationWarning className={fontClassNames}>
      <head>
        <script id="thabaal-init" dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <LanguageProvider initialLang={lang}>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
