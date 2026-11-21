import { NextRequest, NextResponse } from "next/server";
import { APP_ORIGIN, APP_HOST } from "./app-host";

const SESSION_COOKIE = "wp_session";

/**
 * Validates that a browser state-changing request (POST, PUT, PATCH, DELETE)
 * originates from the trusted application itself.
 *
 * Defense against Cross-Site Request Forgery (CSRF) for Route Handlers.
 */
export function verifySameOrigin(req: NextRequest | Request): { ok: boolean; reason?: string } {
  const headers = req.headers;

  // 1. Sec-Fetch-Site: if a modern browser marks the request explicitly cross-site, reject.
  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite === "cross-site") {
    return { ok: false, reason: "Cross-site request blocked by Sec-Fetch-Site" };
  }

  // 2. Origin header check (standard browser behavior for POST/PUT/DELETE)
  const origin = headers.get("origin");
  if (origin) {
    if (origin === "null" || origin.trim() === "") {
      return { ok: false, reason: "Origin header is null or opaque" };
    }
    try {
      const u = new URL(origin);
      // Require exact protocol and host match against canonical APP_ORIGIN or Host
      const host = headers.get("host") || headers.get("x-forwarded-host") || APP_HOST;
      const hostName = host.split(":")[0].toLowerCase();
      const originHost = u.hostname.toLowerCase();

      // In production: must match canonical APP_HOST (www.thabaal.in)
      if (originHost === APP_HOST.toLowerCase() || origin === APP_ORIGIN) {
        return { ok: true };
      }
      if (process.env.NODE_ENV !== "production" && (originHost === "localhost" || originHost === "127.0.0.1")) {
        return { ok: true };
      }
      // If deployed on another authorized host matching Host header
      if (originHost === hostName) {
        return { ok: true };
      }
      return { ok: false, reason: `Origin ${origin} does not match host ${hostName}` };
    } catch {
      return { ok: false, reason: "Invalid Origin header format" };
    }
  }

  // 3. Referer fallback (if Origin is omitted by older browser or proxy)
  const referer = headers.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      const host = headers.get("host") || headers.get("x-forwarded-host") || APP_HOST;
      const hostName = host.split(":")[0].toLowerCase();
      const refererHost = u.hostname.toLowerCase();

      if (refererHost === APP_HOST.toLowerCase() || refererHost === hostName) {
        return { ok: true };
      }
      if (process.env.NODE_ENV !== "production" && (refererHost === "localhost" || refererHost === "127.0.0.1")) {
        return { ok: true };
      }
      return { ok: false, reason: `Referer ${referer} does not match host ${hostName}` };
    } catch {
      return { ok: false, reason: "Invalid Referer header format" };
    }
  }

  // 4. If neither Origin nor Referer is present:
  // If the request carries user session cookies, reject because browser fetch() with credentials
  // always attaches Origin in modern browsers. Missing both suggests stripped/spoofed CSRF vector.
  const cookieHeader = headers.get("cookie") || "";
  if (cookieHeader.includes(SESSION_COOKIE)) {
    return { ok: false, reason: "Cookie-authenticated mutation requires Origin or Referer header" };
  }

  // For non-browser automated machine requests without session cookies (e.g. webhooks with signatures), allow.
  return { ok: true };
}

/**
 * Standard HTTP 403 response for cross-site mutation rejection.
 */
export function rejectCrossSite(reason?: string) {
  return NextResponse.json(
    { ok: false, error: "CSRF_ORIGIN_VERIFICATION_FAILED", message: reason || "Cross-site mutation rejected" },
    { status: 403 }
  );
}
