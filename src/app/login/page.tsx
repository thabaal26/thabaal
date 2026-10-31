import type { Metadata } from "next";
import { IconSetLink } from "@/components/icon-set-link";
import { displayPlanPrices } from "@/lib/plan-prices-server";
import { ThabaalSignIn } from "./thabaal-sign-in";

export const metadata: Metadata = {
  title: "Sign in · Thabaal (தபால்)",
  description: "A message with momentum. Sign in to Thabaal to launch campaigns, manage customer messaging and track orders.",
  robots: { index: true, follow: true },
};

// The pricing section shows the prices set in the admin panel, read on each visit (never at build time).
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  return (
    <div data-iconset="hugeicons-regular" className="contents">
      <IconSetLink set="hugeicons-regular" />
      <ThabaalSignIn prices={await displayPlanPrices()} />
    </div>
  );
}
