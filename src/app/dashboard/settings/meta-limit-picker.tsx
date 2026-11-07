"use client";

import { useState, useTransition } from "react";
import { safeAction } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { setMetaLimit } from "../actions/meta-limit";

const OPTIONS: { tier: string; en: string; ta: string }[] = [
  { tier: "TIER_250", en: "250 a day (new number)", ta: "ஒரு நாளைக்கு 250 (புதிய எண்)" },
  { tier: "TIER_2K", en: "2,000 a day", ta: "ஒரு நாளைக்கு 2,000" },
  { tier: "TIER_10K", en: "10,000 a day", ta: "ஒரு நாளைக்கு 10,000" },
  { tier: "TIER_100K", en: "100,000 a day", ta: "ஒரு நாளைக்கு 1,00,000" },
  { tier: "TIER_UNLIMITED", en: "Unlimited", ta: "வரம்பு இல்லை" },
];

/** Lets the business say what WhatsApp Manager shows as its limit; Meta's own answer still replaces it later. */
export function MetaLimitPicker({ clientId, current, canEdit }: { clientId: string; current: string | null; canEdit: boolean }) {
  const { isTamil } = useLanguage();
  const [tier, setTier] = useState(current && OPTIONS.some((o) => o.tier === current) ? current : "TIER_250");
  const [pending, start] = useTransition();
  return (
    <div className="mt-3" data-testid="meta-limit-picker">
      <label htmlFor="meta-limit" className="block text-sm font-medium text-ink-2">
        {isTamil ? "Meta வரம்பு (24 மணி நேரம்)" : "Meta limit (24 hours)"}
      </label>
      <select
        id="meta-limit"
        className="field mt-1 max-w-xs"
        value={tier}
        disabled={!canEdit || pending}
        onChange={(e) => {
          const next = e.target.value;
          const before = tier;
          setTier(next);
          start(async () => {
            const r = await safeAction(() => setMetaLimit(clientId, next));
            if (!r.ok) setTier(before);
          });
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.tier} value={o.tier}>
            {isTamil ? o.ta : o.en}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted">
        {isTamil
          ? "WhatsApp Manager → Account tools → Messaging limits-ல் உள்ளதைத் தேர்வு செய்யுங்கள். புதிய எண் 250-ல் தொடங்கும். Meta மாற்றினால் தானாகவே புதுப்பிக்கப்படும்."
          : "Pick what WhatsApp Manager shows under Account tools → Messaging limits. A new number starts at 250. It updates by itself when Meta raises it."}
      </p>
    </div>
  );
}
