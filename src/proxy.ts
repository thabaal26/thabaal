import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "wp_session";

/** Signature and expiry only; pages still check the user exists in the database. */
async function validSession(token?: string) {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const ok = await validSession(token);
  const { pathname } = request.nextUrl;

  // A button pressed after the session expired: let the server action answer. It checks the session itself
  // (requireUser) and sends the browser to /login in a way Next understands; a plain redirect here made the
  // action fail with "couldn't reach Thabaal" instead. Actions can be posted to any path, so this opens nothing.
  const app = pathname.startsWith("/dashboard") || pathname === "/admin" || pathname.startsWith("/admin/");
  if (app && !ok && request.method === "POST" && request.headers.has("next-action")) {
    return NextResponse.next();
  }
  if (app && !ok) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    if (token) res.cookies.delete(COOKIE); // expired or forged: clear it so /login doesn't bounce back
    return res;
  }
  if (pathname === "/login" && ok && !request.nextUrl.searchParams.has("preview")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (pathname === "/signup" && ok) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if ((pathname === "/login" || pathname === "/signup") && token) {
    const res = NextResponse.next();
    res.cookies.delete(COOKIE);
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/signup"] };
