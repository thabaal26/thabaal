import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nightColor, themeStyle } from "@/lib/theme";

// A client's own install manifest, so "Add to Home Screen" shows their name, logo and colours.
// Linked from the dashboard of a signed-in client; browsers fetch manifests without cookies,
// so it's keyed by client id and holds only public branding.
export async function GET(_: Request, ctx: RouteContext<"/api/manifest/[clientId]">) {
  const { clientId } = await ctx.params;
  const c = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, logoUrl: true, brandPrimary: true, brandAccent: true, tagline: true },
  });
  if (!c) return new NextResponse("Not found", { status: 404 });

  const theme = themeStyle(c) as Record<string, string> | undefined;
  const icons = c.logoUrl
    ? [
        { src: c.logoUrl, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: c.logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];

  return NextResponse.json(
    {
      id: `/?client=${clientId}`,
      name: c.name,
      short_name: c.name.length > 12 ? c.name.split(/\s+/)[0] : c.name,
      description: c.tagline ?? `${c.name} WhatsApp campaigns`,
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      background_color: theme?.["--color-canvas"] ?? "#f5f6f3",
      theme_color: nightColor(c),
      icons,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
