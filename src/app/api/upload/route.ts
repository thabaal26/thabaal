import { put } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { requireManager } from "@/lib/session";

export const dynamic = "force-dynamic";

// Vercel caps a request body at 4.5 MB, so header images go up to 4 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png"];

/**
 * Stores a template header image in Vercel Blob and returns its public link.
 * Public because WhatsApp downloads the image by that link; only admins can upload.
 */
export async function POST(req: NextRequest) {
  const s = await requireManager();
  if ("denied" in s) return NextResponse.json({ error: s.denied }, { status: 403 });

  const type = req.headers.get("content-type") ?? "";
  if (!TYPES.includes(type)) return NextResponse.json({ error: "Only JPG or PNG images can be used." }, { status: 400 });
  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_BYTES) return NextResponse.json({ error: "That image is over 4 MB." }, { status: 400 });
  if (!req.body) return NextResponse.json({ error: "No file received." }, { status: 400 });

  const name = (req.nextUrl.searchParams.get("filename") ?? "image").replace(/[^\w.-]+/g, "-").slice(-80);
  try {
    const blob = await put(`templates/${name}`, req.body, { access: "public", contentType: type, addRandomSuffix: true });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error("Blob upload failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 500 });
  }
}
