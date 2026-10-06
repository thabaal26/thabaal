import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Where pages send a session whose user no longer exists (e.g. a removed client login).
// The cookie is still validly signed, so it must be cleared or /login would bounce back.
export function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
