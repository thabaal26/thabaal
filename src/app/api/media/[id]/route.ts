import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { numberConfig } from "@/lib/senders";
import { getScope, owned } from "@/lib/session";

export const dynamic = "force-dynamic";

const VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";

/**
 * A photo, voice note or file a customer sent, streamed from Meta. Meta's download links
 * need the number's token and expire, so the portal fetches them only when someone views one.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getScope();
  // Unpaid business: closed until the plan payment is verified (lib/plan-access.ts).
  if (scope.planLocked) return new NextResponse("thabaal is paused until your plan payment is verified.", { status: 403 });
  const reply = await db.reply.findFirst({
    where: { id, mediaId: { not: null }, customer: owned(scope) },
    select: { mediaId: true, sender: true, customer: { select: { client: { select: { waToken: true } } } } },
  });
  if (!reply?.mediaId) return new NextResponse("Not found", { status: 404 });

  const { token, live } = numberConfig(reply.sender, reply.customer.client.waToken);
  if (!live || !token) return new NextResponse("WhatsApp is not connected", { status: 503 });
  const auth = { Authorization: `Bearer ${token}` };

  const meta = await fetch(`https://graph.facebook.com/${VERSION}/${reply.mediaId}`, { headers: auth, cache: "no-store" });
  if (!meta.ok) return new NextResponse("Meta no longer has this file (media is kept for about 30 days)", { status: 410 });
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type?: string };

  const file = await fetch(url, { headers: auth, cache: "no-store" });
  if (!file.ok || !file.body) return new NextResponse("Could not download the file from Meta", { status: 502 });
  return new NextResponse(file.body, {
    headers: { "Content-Type": mime_type ?? file.headers.get("content-type") ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
