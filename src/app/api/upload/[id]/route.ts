import { NextResponse } from "next/server";
import { getStoredPublicImage } from "@/lib/uploaded-image";
import { verifyMediaToken } from "@/lib/media-token";
import { getScope } from "@/lib/session";

export const dynamic = "force-dynamic";

const SAFE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const img = await getStoredPublicImage(id);
  if (!img) return new NextResponse("Not found", { status: 404 });

  // 1. If explicitly public (e.g. approved WhatsApp marketing template header), allow public access
  if (!img.isPublic) {
    // 2. For private assets: require either a valid capability token or an authenticated session for that tenant
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    const tokenVerification = await verifyMediaToken(token, id);
    let authorized = false;

    if (tokenVerification.valid) {
      // If image belongs to a specific client, token MUST match that clientId
      if (img.clientId) {
        if (tokenVerification.clientId === img.clientId) {
          authorized = true;
        }
      } else {
        authorized = true;
      }
    }

    if (!authorized) {
      // Check session
      try {
        const scope = await getScope();
        if (scope.isAdmin) {
          authorized = true;
        } else if (scope.clientId && img.clientId && scope.clientId === img.clientId) {
          authorized = true;
        } else if (scope.clientId && !img.clientId) {
          authorized = true;
        }
      } catch {
        // Session check failed or unauthenticated
      }
    }

    if (!authorized) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized media access", reason: tokenVerification.reason || "Missing or invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const body = new Uint8Array(img.data);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": SAFE.includes(img.mimeType) ? img.mimeType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Length": String(body.byteLength),
      "Cache-Control": img.isPublic ? "public, max-age=31536000, immutable" : "private, no-cache, no-store, must-revalidate",
    },
  });
}
