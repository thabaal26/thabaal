"use client";

import { useEffect, useState } from "react";
import { Gauge } from "@/components/icons";
import { Stat } from "@/components/ui";
import { useLanguage } from "@/lib/i18n/context";
import type { LimitSummary } from "@/lib/limit-summary";

const EVERY_MS = 60_000;

/** Today's Meta limit and what's left of it, kept live: it asks again every minute while the page is open. */
export function MetaLimitCard({ initial }: { initial: LimitSummary }) {
  const { isTamil } = useLanguage();
  const [s, setS] = useState(initial);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/limits", { cache: "no-store" });
        if (r.ok && !stop) setS(await r.json());
      } catch {
        // offline for a moment: the next minute tries again
      }
    };
    const t = window.setInterval(pull, EVERY_MS);
    const onVisible = () => !document.hidden && void pull();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!s) return null;
  const n = (x: number) => x.toLocaleString("en-IN");
  const time = s.checkedLabel;

  const value = s.limit === null ? (isTamil ? "வரம்பு இல்லை" : "Unlimited") : isTamil ? `${n(s.limit)} பேர்` : `${n(s.limit)} people`;
  const nextText = s.next
    ? isTamil
      ? `அடுத்த வரம்பு ${s.next.limit === null ? "வரம்பில்லை" : n(s.next.limit)}: ${s.next.days} நாளில் ${n(s.next.need)} பேர் தேவை (${n(s.next.have)} ஆனது)`
      : `next limit ${s.next.limit === null ? "unlimited" : n(s.next.limit)} at ${n(s.next.need)} people in ${s.next.days} days (${n(s.next.have)} so far)`
    : null;
  const parts = [
    s.limit === null ? null : isTamil ? `24 மணி நேரத்தில் ${n(s.used)} பேருக்கு · ${n(s.left ?? 0)} மீதம்` : `${n(s.used)} reached in 24 hours · ${n(s.left ?? 0)} left`,
    nextText,
    time && !s.stale ? (isTamil ? `${time}-க்கு Meta சரிபார்த்தது` : `Meta checked ${time}`) : null,
  ].filter(Boolean);

  return (
    <div style={{ marginBottom: 16 }} data-testid="meta-limit-card">
      <Stat
        label={isTamil ? "இன்றைய Meta வரம்பு (24 மணி நேரம்)" : "Today's Meta limit (24 hours)"}
        value={value}
        sub={parts.join(" · ")}
        icon={<Gauge className="size-4 shrink-0" />}
        tone="info"
      />
    </div>
  );
}
