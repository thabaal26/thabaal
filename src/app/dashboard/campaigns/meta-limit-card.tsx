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
  const parts = [
    s.limit === null ? null : isTamil ? `இப்போது ${n(s.left ?? 0)} மீதம்` : `${n(s.left ?? 0)} left now`,
    !s.known ? (isTamil ? "Meta இன்னும் சொல்லவில்லை; 250 என்று கொள்கிறோம்" : "Meta hasn't said yet; 250 assumed") : null,
    // Only a recent answer from Meta gets a time; a limit set by hand or an old answer just shows the count.
    time && !s.stale ? (isTamil ? `${time}-க்கு சரிபார்த்தது` : `checked ${time}`) : null,
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
