import { NextResponse } from "next/server";
import { nightColor } from "@/lib/theme";

// Unified Thabaal install manifest so "Install app" / "Add to Home Screen" in Chrome always shows "Thabaal".
export async function GET() {
  const icons = [
    { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ];

  return NextResponse.json(
    {
      id: "/",
      name: "Thabaal",
      short_name: "Thabaal",
      description: "Thabaal (தபால்) — A message with momentum. Warm, quick, and dependable identity for customer messaging, campaigns, and orders.",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f5f7fa",
      theme_color: nightColor(),
      icons,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store, max-age=0" } },
  );
}
