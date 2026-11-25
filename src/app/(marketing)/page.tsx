import { jwtVerify } from "jose";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginPage from "./login/page";

/*
 * www.thabaal.in opens straight on sign-in. Below the form the page says what Thabaal does, and its footer links
 * About Thabaal (with how Google sign-in is used), the Privacy Policy and Terms, which Google's OAuth review needs
 * to reach without signing in. Someone already signed in goes straight to the dashboard.
 */

export const metadata: Metadata = {
  title: { absolute: "Thabaal · Sign in" },
  description:
    "Thabaal is a web portal for businesses to send WhatsApp campaigns, answer customers, take orders and request payments, and see reports, through Meta's official WhatsApp Business Platform.",
  alternates: { canonical: "https://www.thabaal.in/" },
  robots: { index: true, follow: true },
};

async function signedIn() {
  const token = (await cookies()).get("wp_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export default async function Home() {
  if (await signedIn()) redirect("/dashboard");
  return <LoginPage />;
}
