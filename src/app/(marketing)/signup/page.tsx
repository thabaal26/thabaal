import type { Metadata } from "next";
import { IconSetLink } from "@/components/icon-set-link";
import { ThabaalSignIn } from "../login/thabaal-sign-in";

export const metadata: Metadata = {
  title: "Create your account · Thabaal (தபால்)",
  description: "Create your Thabaal account, pick a package and start sending WhatsApp campaigns and managing orders.",
  robots: { index: true, follow: true },
};

export default function SignupPage() {
  return (
    <div data-iconset="hugeicons-regular" className="contents">
      <IconSetLink set="hugeicons-regular" />
      <ThabaalSignIn mode="signup" />
    </div>
  );
}
