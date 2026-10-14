import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatch } from "@/lib/dispatcher";
import { keyId } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called every few minutes by Vercel Cron or an external scheduler.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  if (!secret || (auth !== `Bearer ${secret}` && key !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The secret in the web address ends up in logs; it still works for now, but Settings shows a warning
  // until the scheduler sends it as "Authorization: Bearer …" instead.
  if (auth !== `Bearer ${secret}`) {
    console.warn("[cron] CRON_SECRET arrived in the URL (?key=); switch the scheduler to the Authorization header.");
    await db.setting.update({ where: { id: 1 }, data: { cronKeyInUrlAt: new Date() } }).catch(() => {});
  }
  // ?probe=key: only report which encryption key is loaded (a fingerprint), without running the scheduler.
  if (req.nextUrl.searchParams.get("probe") === "key") return NextResponse.json({ encryptionKey: keyId() });
  return NextResponse.json(await dispatch());
}

export const GET = handle;
export const POST = handle;
