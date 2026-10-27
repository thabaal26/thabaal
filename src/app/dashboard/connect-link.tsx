"use client";

// Opens Meta's hosted WhatsApp sign-up in a new tab, and tells Thabaal which business pressed it.

import { startMetaConnect } from "./actions/meta-signup";

export function ConnectLink({ url }: { url: string }) {
  return (
    <a
      className="btn primary"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        void startMetaConnect().catch(() => null);
      }}
    >
      Connect your WhatsApp
    </a>
  );
}
