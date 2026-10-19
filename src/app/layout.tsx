import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist, Geist_Mono, Inter, Noto_Sans_Tamil, Nunito, Poppins } from "next/font/google";
import { ConfirmHost } from "@/components/confirm";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "@/components/toast";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap", preload: false });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });
// Fonts a portal can pick (Settings → Appearance). Not preloaded: a browser only downloads one
// when the page actually uses it.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap", preload: false });
// Campaign text, replies and the catalogue are often Tamil. The font's unicode-range means
// browsers only fetch it on pages that actually contain Tamil, so it isn't preloaded.
const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "Thabaal · Customer Messaging & Campaigns", template: "%s · Thabaal" },
  applicationName: "Thabaal",
  description: "Thabaal (தபால்) — A message with momentum. Warm, quick, and dependable identity for customer messaging, campaigns, and orders.",
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "512x512" },
      { url: "/brands/thabaal/mark.png", type: "image/png" },
    ],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use safe-area insets
  themeColor: "#171b24",
};

import { cookies } from "next/headers";
import { LanguageProvider } from "@/lib/i18n/context";

const INIT_SCRIPT = `${THEME_SCRIPT}\n(function(){try{var l=localStorage.getItem("thabaal-lang");if(l==="ta"||l==="en"){document.documentElement.lang=l;}}catch(e){}\ntry{var origSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(typeof n==="string"&&(n.indexOf("bis_")===0||n==="data-darkreader-inline-stroke"||n==="data-darkreader-inline-fill"))return;return origSet.apply(this,arguments);};}catch(e){}\ntry{var mo=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var m=muts[i];if(m.type==="attributes"&&m.attributeName&&m.attributeName.indexOf("bis_")===0){m.target.removeAttribute(m.attributeName);}}});mo.observe(document.documentElement,{attributes:true,subtree:true,attributeFilter:["bis_skin_checked","bis_register"]});}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let lang: "en" | "ta" = "en";
  try {
    const store = await cookies();
    const c = store.get("thabaal-lang")?.value;
    if (c === "ta" || c === "en") lang = c as "en" | "ta";
  } catch {}

  return (
    <html lang={lang} suppressHydrationWarning className={`${dmSans.variable} ${geistSans.variable} ${geistMono.variable} ${tamil.variable} ${nunito.variable} ${inter.variable} ${poppins.variable} h-full antialiased`}>
      <head>
        {/* Sets light or dark, page language, and strips extension-injected attributes (bis_skin_checked) before first paint. */}
        <script id="thabaal-init" dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        <LanguageProvider initialLang={lang}>
          {children}
        </LanguageProvider>
        <Toaster />
        <ConfirmHost />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
