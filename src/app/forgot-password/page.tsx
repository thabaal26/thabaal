import type { Metadata } from "next";
import { IconSetLink } from "@/components/icon-set-link";
import { ThabaalSignIn } from "../login/thabaal-sign-in";

export const metadata: Metadata = {
  title: "Forgot password · Thabaal (தபால்)",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div data-iconset="hugeicons-regular" className="contents">
      <IconSetLink set="hugeicons-regular" />
      <ThabaalSignIn mode="forgot" />
    </div>
  );
}
