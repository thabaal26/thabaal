import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nightColor } from "@/lib/theme";

// A client's own install manifest, so "Add to Home Screen" shows their name, logo and colours.
// Linked from the dashboard of a signed-in client; browsers fetch manifests without cookies,
// so it's keyed by client id and holds only public branding.
export async function GET(_: Request, ctx: RouteContext<"/api/manifest/[clientId]">) {
  const { clientId } = await ctx.params;
  const c = await db.client.findUnique({
    where: { id: clientId },
    select: { name: true, logoUrl: true, tagline: true },
  });
  if (!c) return new NextResponse("Not found", { status: 404 });

  const icons = [
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
      background_color: "#f5f7fa", // --color-canvas: the same neutral page for every client
      theme_color: nightColor(),
      icons,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
