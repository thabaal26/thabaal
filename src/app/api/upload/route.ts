import { NextResponse, type NextRequest } from "next/server";
import { requireManager } from "@/lib/session";
import { storePublicImage } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";

// Vercel caps a request body at 4.5 MB, so media uploads go up to 4 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The file's first bytes must match its declared type, so a renamed HTML or script file is refused. */
function looksLike(type: string, b: Uint8Array) {
  const at = (sig: number[], off = 0) => sig.every((v, i) => b[off + i] === v);
  if (type === "image/jpeg") return at([0xff, 0xd8, 0xff]);
  if (type === "image/png") return at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (type === "image/webp") return at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8);
  if (type === "application/pdf") return at([0x25, 0x50, 0x44, 0x46]);
  return false;
}

/**
 * Stores a template header image or reply attachment in Vercel Blob (or built-in PostgreSQL fallback) and returns its public link.
 * Public because WhatsApp downloads the file by that link; only admins/managers can upload.
 */
export async function POST(req: NextRequest) {
  const s = await requireManager();
  if ("denied" in s) return NextResponse.json({ error: s.denied }, { status: 403 });

  const type = req.headers.get("content-type") ?? "";
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Only JPG, PNG, WebP images or PDF files can be used." }, { status: 400 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB." }, { status: 400 });

  const name = (req.nextUrl.searchParams.get("filename") ?? "image").replace(/[^\w.-]+/g, "-").slice(-80);
  try {
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength) return NextResponse.json({ error: "No file received." }, { status: 400 });
    if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: "That file is over 4 MB." }, { status: 400 });
    if (!looksLike(type, new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)))) {
      return NextResponse.json({ error: "That file isn't really a JPG, PNG, WebP or PDF." }, { status: 400 });
    }
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
