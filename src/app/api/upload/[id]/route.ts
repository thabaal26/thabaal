import { NextResponse } from "next/server";
import { getStoredPublicImage } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";

const SAFE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const img = await getStoredPublicImage(id);
  if (!img) return new NextResponse("Not found", { status: 404 });

  const body = new Uint8Array(img.data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      // Only the types uploads accept are served as themselves; anything else downloads as plain bytes.
      "Content-Type": SAFE.includes(img.mimeType) ? img.mimeType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
