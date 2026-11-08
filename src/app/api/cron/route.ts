import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatch } from "@/lib/dispatcher";
import { keyId } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every few minutes by Vercel Cron or an external scheduler.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Only "Authorization: Bearer <CRON_SECRET>", compared in constant time. The old "?key=" form is no longer taken:
  // a secret in the web address ends up in logs, and no scheduler used it (security audit 8 Nov 2026).
  const auth = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || auth.length !== want.length || !timingSafeEqual(auth, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ?probe=key: only report which encryption key is loaded (a fingerprint), without running the scheduler.
  if (req.nextUrl.searchParams.get("probe") === "key") return NextResponse.json({ encryptionKey: keyId() });
  return NextResponse.json(await dispatch());
}

export const GET = handle;
export const POST = handle;
