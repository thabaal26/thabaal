import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { LanguageProvider } from "@/lib/i18n/context";
import { GoogleAdsProvider } from "@/components/marketing/GoogleAdsProvider";
import { ConsentBanner } from "@/components/marketing/ConsentBanner";
import { fontClassNames, INIT_SCRIPT } from "../fonts";
import "../globals.css";
import "../controls.css";

export const metadata: Metadata = {
  title: { default: "Thabaal · Customer Messaging & Campaigns", template: "%s · Thabaal" },
  applicationName: "Thabaal",
  description: "Thabaal (தபால்) — A message with momentum. Warm, quick, and dependable identity for customer messaging, campaigns, and orders.",
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171b24",
};

export default async function MarketingRootLayout({ children }: { children: React.ReactNode }) {
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
        <GoogleAdsProvider>
          <LanguageProvider initialLang={lang}>
            <ConsentBanner />
            {children}
          </LanguageProvider>
        </GoogleAdsProvider>
      </body>
    </html>
  );
}
