import { after, NextResponse } from "next/server";
import { sessionUser } from "@/lib/session";
import { recordUsage, sectionOf } from "@/lib/usage-record";

// The business portal reports each section it opens (components/usage-beacon.tsx), for the admin panel's
// Usage page. Only a signed-in business login is counted; the answer is always empty.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  const section = typeof body?.path === "string" ? sectionOf(body.path.slice(0, 200)) : null;
  if (section !== null) after(async () => void (await recordUsage(await sessionUser().catch(() => null), "open", section)));
  return new NextResponse(null, { status: 204 });
}
