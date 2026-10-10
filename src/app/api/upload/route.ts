import { NextResponse, type NextRequest } from "next/server";
import { requireManager } from "@/lib/session";
import { storePublicImage } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";

// Vercel caps a request body at 4.5 MB, so header images go up to 4 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png"];

/**
 * Stores a template header image in Vercel Blob (or built-in PostgreSQL fallback) and returns its public link.
 * Public because WhatsApp downloads the image by that link; only admins/managers can upload.
 */
export async function POST(req: NextRequest) {
  const s = await requireManager();
  if ("denied" in s) return NextResponse.json({ error: s.denied }, { status: 403 });

  const type = req.headers.get("content-type") ?? "";
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Only JPG or PNG images can be used." }, { status: 400 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return NextResponse.json({ error: "That image is over 4 MB." }, { status: 400 });

  const name = (req.nextUrl.searchParams.get("filename") ?? "image").replace(/[^\w.-]+/g, "-").slice(-80);
  try {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength) return NextResponse.json({ error: "No file received." }, { status: 400 });
    const url = await storePublicImage({
      bytes,
      contentType: type,
      filename: name,
      origin: req.nextUrl.origin,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("Image upload failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
