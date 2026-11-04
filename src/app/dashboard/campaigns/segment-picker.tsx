"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useTr } from "@/lib/i18n/context";
import { liveSegmentSummary } from "../actions/campaigns";

// Campaign form › Send to › who to reach by how they respond (lib/engagement-segments.ts). A business that has
// never sent a campaign sees what a first send reaches; after that, it can keep the send to one or more groups.

type Seg = "super" | "active" | "inactive" | "new";
const ORDER: Seg[] = ["super", "active", "inactive", "new"];
const LABEL: Record<Seg, { en: string; ta: string; hint: string; hintTa: string; tone: string }> = {
  super: { en: "Super active", ta: "மிக ஆர்வமானவர்கள்", hint: "Tapped a button, replied or ordered lately", hintTa: "சமீபத்தில் பட்டன் அழுத்தினார், பதில் அனுப்பினார் அல்லது ஆர்டர் செய்தார்", tone: "green" },
  active: { en: "Active", ta: "செயலில் உள்ளவர்கள்", hint: "Offers reach them; no tap or reply lately", hintTa: "சலுகைகள் சென்றடைகின்றன; சமீபத்தில் பதில் இல்லை", tone: "blue" },
  inactive: { en: "Inactive", ta: "ஆர்வம் குறைந்தவர்கள்", hint: "Several offers in a row with no response", hintTa: "தொடர்ந்து பல சலுகைகளுக்கு பதில் இல்லை", tone: "amber" },
  new: { en: "Not reached yet", ta: "இன்னும் சென்றடையாதவர்கள்", hint: "No offer has reached them yet", hintTa: "இன்னும் எந்தச் சலுகையும் சென்றடையவில்லை", tone: "violet" },
};

export type SegmentSummaryProps = {
  history: boolean;
  rules: { days: number; offers: number };
  segments: Record<Seg, { eligible: number; excluded: number; moved: number }>;
  activeRead: number;
  totals: { customers: number; eligible: number; optedOut: number; unreachable: number; movedInactive: number; paused: number; invalidNumber: number };
};

export type Capacity = { known: boolean; limit: number | null; left: number | null } | null;

const n = (x: number) => x.toLocaleString("en-IN");

/** The counts follow what customers do: read again every minute while the form is open, and when the tab comes back. */
const REFRESH_MS = 60_000;

export function SegmentPicker({
  campaignId,
  summary: initial,
  value,
  onChange,
  capacity,
}: {
  campaignId: string | null;
  summary: SegmentSummaryProps;
  value: string[];
  onChange: (v: string[]) => void;
  capacity: Capacity;
}) {
  const { isTa } = useTr();
  const [summary, setSummary] = useState(initial);
  useEffect(() => {
    let stop = false;
    const pull = () => {
      if (document.visibilityState !== "visible") return;
      liveSegmentSummary(campaignId)
        .then((s) => {
          if (s && !stop) setSummary(s);
        })
        .catch(() => {});
    };
    const t = setInterval(pull, REFRESH_MS);
    document.addEventListener("visibilitychange", pull);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [campaignId]);
  const t = summary.totals;
  const capacityText = !capacity
    ? null
    : !capacity.known
      ? isTa
        ? "Meta இன்னும் உங்கள் வணிகத்தின் தினசரி வரம்பைச் சொல்லவில்லை; பாதுகாப்புக்காக 24 மணி நேரத்தில் 250 பேர் என அனுப்பப்படும்."
        : "Meta hasn't told us your business's daily limit yet; sending assumes 250 people per 24 hours to stay safe."
      : capacity.limit === null
        ? isTa
          ? "Meta வரம்பு: வரம்பில்லை."
          : "Meta limit: unlimited."
        : isTa
          ? `Meta வரம்பு: 24 மணி நேரத்தில் ${n(capacity.limit)} பேர் · இப்போது ${n(capacity.left ?? 0)} மீதம். மீதி அடுத்த நாட்களில் தானாகச் செல்லும்.`
          : `Meta limit: ${n(capacity.limit)} people per 24 hours · ${n(capacity.left ?? 0)} left now. The rest go out by themselves on the next days.`;
  const leftOut = isTa
    ? `எப்போதும் விலக்கப்படுபவர்கள்: ${n(t.optedOut)} விலகியவர்கள், ${n(t.unreachable)} வாட்ஸ்அப் பெற முடியாதவர்கள், ${n(t.movedInactive)} நீங்கள் Inactive-க்கு மாற்றியவர்கள். ${n(t.paused)} பேருக்கு Meta தற்காலிகமாகச் சலுகைகளை நிறுத்தியுள்ளது; பின்னர் அனுப்பலாம்.`
    : `Always left out: ${n(t.optedOut)} opted out, ${n(t.unreachable)} can't receive WhatsApp, ${n(t.movedInactive)} you moved to Inactive. Meta is holding offers back from ${n(t.paused)} for now; they can be sent again later.`;

  if (!summary.history)
    return (
      <div className="space-y-2.5 rounded-control border border-line p-3" data-testid="first-campaign">
        <p className="text-sm font-medium text-ink-2">{isTa ? "முதல் பிரச்சாரம்: தகுதியுள்ள அனைத்து வாடிக்கையாளர்களும்" : "First campaign: all eligible customers"}</p>
        <p className="text-xs text-muted">
          {isTa
            ? "இன்னும் பிரச்சாரம் அனுப்பவில்லை, அதனால் யார் ஆர்வமாக உள்ளார்கள் என்று இப்போது சொல்ல முடியாது. முதல் பிரச்சாரத்துக்குப் பின் Super active, Active, Inactive குழுக்கள் தெரியும்."
            : "No campaign has gone out yet, so there's no history to group customers by. After this first send you can pick Super active, Active and Inactive customers."}
        </p>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            [isTa ? "மொத்த வாடிக்கையாளர்கள்" : "Total customers", t.customers],
            [isTa ? "தகுதியுள்ளவர்கள்" : "Eligible", t.eligible],
            [isTa ? "விலகியவர்கள்" : "Opted out", t.optedOut],
            [isTa ? "பெற முடியாதவர்கள்" : "Can't receive", t.unreachable + t.invalidNumber],
          ].map(([label, v]) => (
            <div key={String(label)} className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="tabular font-semibold text-ink">{n(Number(v))}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">{leftOut}</p>
        {capacityText && <p className="text-xs text-muted" data-testid="capacity">{capacityText}</p>}
      </div>
    );

  const toggle = (s: Seg) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <fieldset className="space-y-2.5 rounded-control border border-line p-3" data-testid="segment-picker">
      <legend className="px-1 text-sm font-medium text-ink-2">{isTa ? "பதிலளிப்பதைப் பொறுத்து யாருக்கு (விருப்பம்)" : "Who to reach, by how they respond (optional)"}</legend>
      <p className="text-xs text-muted">
        {isTa
          ? `உங்கள் எல்லாப் பிரச்சாரங்களிலிருந்தும் இப்போதைய நிலை. எதையும் தேர்வு செய்யாவிட்டால் "Send to" அனைவருக்கும் போகும்.`
          : `Worked out live from all your campaigns so far. Pick none to send to everyone in "Send to".`}
      </p>
      <div role="group" aria-label={isTa ? "குழுக்கள்" : "Groups"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ORDER.map((s) => {
          const on = value.includes(s);
          const seg = summary.segments[s];
          const sub =
            s === "active" && seg.eligible
              ? isTa
                ? `${n(summary.activeRead)} படித்தார்கள் · ${n(seg.eligible - summary.activeRead)} சேர்ந்தது, படிக்கவில்லை`
                : `${n(summary.activeRead)} read · ${n(seg.eligible - summary.activeRead)} delivered, not read`
              : isTa
                ? LABEL[s].hintTa
                : LABEL[s].hint;
          return (
            <button
              key={s}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-segment={s}
              onClick={() => toggle(s)}
              className={cn(
                "flex min-h-14 items-start gap-2.5 rounded-control border p-2.5 text-left transition active:scale-[0.99]",
                on ? "border-brand bg-brand-soft text-brand-deep shadow-xs ring-1 ring-brand/30" : "border-line-strong/40 bg-panel text-ink hover:border-line-strong hover:bg-sunken/40",
              )}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-brand-deep bg-brand-deep text-white" : "border-line-strong")}>
                {on && <Check aria-hidden className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{isTa ? LABEL[s].ta : LABEL[s].en}</span>
                  <span className="tabular text-sm font-semibold" data-testid={`segment-total-${s}`}>{n(seg.eligible + seg.excluded)}</span>
                </span>
                <span className="block text-xs text-muted">{sub}</span>
                {s === "inactive" && seg.moved > 0 ? (
                  <span className="block text-xs text-warning" data-testid="moved-inactive-count">
                    {isTa
                      ? `${n(seg.eligible)} பேருக்கு மீண்டும் சலுகை அனுப்பலாம் · நீங்கள் மாற்றிய ${n(seg.moved)} பேர் விலக்கு`
                      : `${n(seg.eligible)} can get a win-back offer · ${n(seg.moved)} you moved here are left out`}
                  </span>
                ) : (
                  seg.excluded > 0 && (
                    <span className="block text-xs text-muted" data-testid={`segment-sendable-${s}`}>
                      {isTa ? `இப்போது ${n(seg.eligible)} பேருக்கு அனுப்பலாம்` : `${n(seg.eligible)} can be sent now`}
                    </span>
                  )
                )}
              </span>
            </button>
          );
        })}
      </div>
      {value.includes("inactive") && (
        <p className="text-xs text-warning" role="note">
          {isTa
            ? "Inactive வாடிக்கையாளர்களுக்கு வேறு, சிறப்பான சலுகையை அனுப்புங்கள். பதில் இல்லாமல் தொடர்ந்து அனுப்புவது உங்கள் எண்ணின் தரத்தைக் குறைக்கும்."
            : "Win-back send: give Inactive customers a different, stronger offer. Repeating offers that get no response lowers your number's quality with Meta."}
        </p>
      )}
      <p className="text-xs text-muted">
        {isTa
          ? `Super active: கடைசி ${summary.rules.days} நாளில் பட்டன், பதில் அல்லது ஆர்டர். Inactive: தொடர்ந்து ${summary.rules.offers} சலுகைகள் சேர்ந்தும் பதில் இல்லை. தோல்வியடைந்த செய்திகள் கணக்கில் இல்லை.`
          : `Super active: a tap, reply or order in the last ${summary.rules.days} days. Inactive: ${summary.rules.offers} offers in a row reached them with no response. Failed messages never count against anyone.`}
      </p>
      <p className="text-xs text-muted">{leftOut}</p>
      {capacityText && <p className="text-xs text-muted" data-testid="capacity">{capacityText}</p>}
    </fieldset>
  );
}
