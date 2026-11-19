import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatch } from "@/lib/dispatcher";
import { keyId } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * SCH-01 Security Guard:
 * State-changing background execution must never be triggered via GET or HEAD (RFC 9110).
 * Prevents crawlers, prefetch engines, or browser address bar navigations from triggering dispatches.
 */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "METHOD_NOT_ALLOWED" },
    {
      status: 405,
      headers: {
        Allow: "POST",
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function HEAD() {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Executes scheduled jobs.
 * Enforces:
 * - Method: POST only
 * - Secret: Bearer <CRON_SECRET> compared via timingSafeEqual
 * - Safe probes: ?probe=key returns encryption key fingerprint without running jobs
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret ?? ""}`);

  if (!secret || auth.length !== want.length || !timingSafeEqual(auth, want)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?probe=key: only report which encryption key is loaded (a fingerprint), without running the scheduler.
  if (req.nextUrl.searchParams.get("probe") === "key") {
    return NextResponse.json({ encryptionKey: keyId() });
  }

  return NextResponse.json(await dispatch());
}
