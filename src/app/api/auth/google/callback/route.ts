import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";

function getOrigin(request: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const origin = getOrigin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    console.warn("[Google OAuth] Access denied or error:", oauthError);
    return NextResponse.redirect(new URL("/login?error=google_denied", origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get("wp_oauth_state")?.value;
  cookieStore.delete("wp_oauth_state");

  if (!savedState || savedState !== state) {
    console.warn("[Google OAuth] State mismatch or missing");
    return NextResponse.redirect(new URL("/login?error=state_mismatch", origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
    return NextResponse.redirect(new URL("/login?error=google_not_configured", origin));
  }

  const redirectUri = `${origin}/api/auth/google/callback`;

  try {
    // 1. Exchange authorization code for access tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[Google OAuth] Token exchange failed:", tokenRes.status, errText);
      return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error("[Google OAuth] No access token in response");
      return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
    }

    // 2. Fetch user profile from Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      console.error("[Google OAuth] Fetch profile failed:", profileRes.status);
      return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
    }

    const profile = await profileRes.json();
    const email = (profile.email as string | undefined)?.toLowerCase().trim();

    if (!email) {
      console.error("[Google OAuth] Profile missing email");
      return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
    }

    // Only an address Google has confirmed belongs to this person may sign in as that user.
    if (profile.email_verified !== true && profile.email_verified !== "true") {
      console.warn("[Google OAuth] Unverified Google email refused");
      return NextResponse.redirect(new URL("/login?error=google_unverified", origin));
    }

    // 3. Find registered user in portal database
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user) {
      // User is not authorized in this portal
      console.warn(`[Google OAuth] Unregistered Google account tried to sign in: ${email}`);
      // The address goes in a 2-minute cookie for the login page to show, never in the URL
      // (URLs end up in browser history, logs and analytics).
      cookieStore.set("wp_oauth_email", email, { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/login", maxAge: 120 });
      return NextResponse.redirect(new URL("/login?error=unauthorized_email", origin));
    }

    // Update name from Google profile if user's name is currently blank
    if (!user.name && profile.name) {
      await db.user.update({
        where: { id: user.id },
        data: { name: profile.name },
      }).catch(() => null);
    }

    // 4. Create portal session cookie and redirect to dashboard
    await createSession(user.id);
    return NextResponse.redirect(new URL("/dashboard", origin));
  } catch (err) {
    console.error("[Google OAuth] Callback exception:", err);
    return NextResponse.redirect(new URL("/login?error=google_auth_failed", origin));
  }
}
