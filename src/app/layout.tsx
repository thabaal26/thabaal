import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Tamil } from "next/font/google";
import { ConfirmHost } from "@/components/confirm";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { Toaster } from "@/components/toast";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false });
// Campaign text, replies and the catalogue are often Tamil. The font's unicode-range means
// browsers only fetch it on pages that actually contain Tamil, so it isn't preloaded.
const tamil = Noto_Sans_Tamil({ variable: "--font-tamil", subsets: ["tamil"], weight: ["400", "500", "600", "700"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "WhatsApp Campaign Portal", template: "%s · Campaign Portal" },
  description: "Schedule WhatsApp campaigns, manage templates and track every message.",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Campaigns", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // lets the layout use safe-area insets
  themeColor: "#0c1714",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${tamil.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Toaster />
        <ConfirmHost />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
