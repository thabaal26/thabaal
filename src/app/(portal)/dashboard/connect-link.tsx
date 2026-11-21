"use client";

// Opens Meta's hosted WhatsApp sign-up in a new tab, and tells Thabaal which business pressed it.

import { useRouter } from "next/navigation";
import { startMetaConnect } from "./actions/meta-signup";

export function ConnectLink({ url, label = "Connect your WhatsApp" }: { url: string; label?: string }) {
  const router = useRouter();
  return (
    <a
      className="btn primary"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        // Remember the press, then refresh so the card switches to "Finish on Meta's page".
        void startMetaConnect()
          .then(() => router.refresh())
          .catch(() => null);
      }}
    >
      {label}
    </a>
  );
}
