import { NextResponse } from "next/server";
import { getStoredPublicImage } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";

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
      "Content-Type": img.mimeType || "image/jpeg",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
