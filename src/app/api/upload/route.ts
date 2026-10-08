import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Lets the template editor upload a header image straight from the browser to Vercel Blob.
 * Only admins get an upload token; files are public because WhatsApp downloads them by link.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const res = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const s = await requireAdmin();
        if ("denied" in s) throw new Error(s.denied);
        // WhatsApp header images: JPG or PNG, at most 5 MB.
        return { allowedContentTypes: ["image/jpeg", "image/png"], maximumSizeInBytes: 5 * 1024 * 1024, addRandomSuffix: true };
      },
    });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
