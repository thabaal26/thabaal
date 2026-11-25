"use client";

import { resetMarketingConsent } from "@/lib/marketing/consent";

export function CookieSettingsButton() {
  return (
    <button
      type="button"
      onClick={() => resetMarketingConsent()}
      className="font-medium text-brand-deep underline underline-offset-2 cursor-pointer"
    >
      Cookie Settings
    </button>
  );
}
