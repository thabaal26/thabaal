import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Noto_Sans_Tamil, Nunito, Poppins } from "next/font/google";
import { ConfirmHost } from "@/components/confirm";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "@/components/toast";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });
// Fonts a portal can pick (Settings → Appearance). Not preloaded: a browser only downloads one
// when the page actually uses it.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap", preload: false });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "600", "700", "800"], display: "swap" });
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${tamil.variable} ${nunito.variable} ${inter.variable} ${poppins.variable} h-full antialiased`}>
      <head>
        {/* Sets light or dark before the first paint, from the saved choice or the device setting. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans" suppressHydrationWarning>
        {children}
        <Toaster />
        <ConfirmHost />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
