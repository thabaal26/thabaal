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
  // Two different counts, said plainly: the daily one (what's left now) and the weekly one (what raises the limit).
  const today = s.limit === null
    ? null
    : isTamil
      ? `கடந்த 24 மணி நேரத்தில் ${n(s.used)} பேர் · இன்று ${n(s.left ?? 0)} மீதம்`
      : `Last 24 hours: ${n(s.used)} used, ${n(s.left ?? 0)} left`;
  const nextText = s.next
    ? isTamil
      ? `${s.next.limit === null ? "வரம்பில்லாமல்" : n(s.next.limit)} ஆக: ${s.next.days} நாளில் ${n(s.next.have)} / ${n(s.next.need)} பேர்`
      : `To reach ${s.next.limit === null ? "unlimited" : n(s.next.limit)}: ${n(s.next.have)} of ${n(s.next.need)} people in ${s.next.days} days`
    : null;
  const parts = [
    today,
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
