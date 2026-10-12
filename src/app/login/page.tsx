import type { Metadata } from "next";
import { IconSetLink } from "@/components/icon-set-link";
import { ThabaalSignIn } from "./thabaal-sign-in";

export const metadata: Metadata = {
  title: "Sign in · Thabaal (தபால்)",
  description: "A message with momentum. Sign in to Thabaal to launch campaigns, manage customer messaging and track orders.",
};

export default function LoginPage() {
  return (
    <div data-iconset="hugeicons-regular" className="contents">
      <IconSetLink set="hugeicons-regular" />
      <ThabaalSignIn />
    </div>
  );
}
