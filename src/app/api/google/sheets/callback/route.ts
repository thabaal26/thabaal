import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, GoogleError, readState } from "@/lib/gsheet/google";
import { connectSheet, kickSheetSync, logSheetActivity } from "@/lib/gsheet/sync";
import { getScope, requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Google sends the owner back here. The sign-in must be the one this same login started, for the business it is
// looking at now; then Thabaal keeps the (encrypted) access, makes the sheet and starts filling it.
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/dashboard/settings/sheet?google=${q}`, req.nextUrl.origin));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back("cancelled");
  const [user, scope] = await Promise.all([requireUser(), getScope()]);
  const st = readState(p.get("state"));
  const code = p.get("code");
  if (!st || !code || st.userId !== user.id) return back("expired");
  if (scope.clientId !== st.clientId || !scope.manager || scope.viewOnly) return back("not-allowed");
  try {
    const t = await exchangeCode(code, req.nextUrl.origin);
    const r = await connectSheet({ clientId: st.clientId, refreshToken: t.refreshToken, accessToken: t.accessToken, expiresIn: t.expiresIn, email: t.email, by: user.name || user.email });
    await logSheetActivity(st.clientId, { event: r.fresh ? "Google Sheet connected" : "Google Sheet reconnected", details: t.email ? `Google account ${t.email}` : null, by: user.name || user.email });
    kickSheetSync(st.clientId);
    return back("connected");
  } catch (e) {
    console.error("[gsheet] connect failed", e);
    return back(e instanceof GoogleError && /permission/i.test(e.message) ? "no-permission" : "failed");
  }
}
