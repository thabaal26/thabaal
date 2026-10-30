import type { Metadata } from "next";
import { IconSetLink } from "@/components/icon-set-link";
import { readResetToken } from "@/lib/password-reset";
import { ThabaalSignIn } from "../login/thabaal-sign-in";

export const metadata: Metadata = {
  title: "Set a new password · Thabaal (தபால்)",
  robots: { index: false, follow: false },
  // The token is in this page's address: don't pass it on to other sites.
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = !!(await readResetToken(token));
  return (
    <div data-iconset="hugeicons-regular" className="contents">
      <IconSetLink set="hugeicons-regular" />
      <ThabaalSignIn mode="reset" resetToken={valid ? token : ""} resetValid={valid} />
    </div>
  );
}
