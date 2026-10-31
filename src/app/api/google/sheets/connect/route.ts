import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleReady, signState } from "@/lib/gsheet/google";
import { getScope, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// "Connect Google Sheets": sends the business owner to Google's sign-in, asking only for permission to create and
// edit the one sheet Thabaal makes. Who started it is signed into `state` and checked again on the way back.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/settings/sheet?google=${q}`, req.nextUrl.origin));
  const [user, scope] = await Promise.all([requireUser(), getScope()]);
  if (!scope.clientId || !scope.manager || scope.viewOnly) return back("not-allowed");
  if (!googleReady()) return back("not-configured");
  return NextResponse.redirect(authUrl(req.nextUrl.origin, signState({ clientId: scope.clientId, userId: user.id })));
}
