import type { Metadata } from "next";
import { ThabaalSignIn } from "./thabaal-sign-in";

export const metadata: Metadata = {
  title: "Sign in · Thabaal (தபால்)",
  description: "A message with momentum. Sign in to Thabaal to launch campaigns, manage customer messaging and track orders.",
};

export default function LoginPage() {
  return <ThabaalSignIn />;
}
