import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { limitSummary } from "@/lib/limit-summary";
import { getScope, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Today's Meta limit for the login's own business, for the Campaigns page's live card. */
export async function GET() {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();
  return NextResponse.json(await limitSummary(scope.clientId), { headers: { "Cache-Control": "no-store" } });
}
