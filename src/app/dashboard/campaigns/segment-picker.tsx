"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useTr } from "@/lib/i18n/context";
import { cleanSegments, SEGMENT_LABEL as LABEL, SEGMENTS as ORDER, type Segment as Seg } from "@/lib/segment-labels";
import { liveSegmentSummary } from "../actions/campaigns";

// Campaign form › Send to › who to reach by how they respond (lib/engagement-segments.ts, the same groups and rule as
// the Chats filters). A business that has never sent a campaign sees what a first send reaches; after that it can send
// to All eligible, or keep the send to one or more groups (Engaged, Seen, Reached, Dormant, Not reached yet).

export type SegmentSummaryProps = {
  history: boolean;
  rules: { days: number; offers: number };
  segments: Record<Seg, { eligible: number; excluded: number; moved: number }>;
  totals: { customers: number; eligible: number; optedOut: number; unreachable: number; movedInactive: number; paused: number; invalidNumber: number };
};

export type Capacity = { known: boolean; limit: number | null; left: number | null } | null;

const n = (x: number) => x.toLocaleString("en-IN");

/**
 * The counts follow what customers do, through the same live check Chats uses (/api/chats-live: a fingerprint of the
 * business's messages, statuses, replies, orders and customers): looked at every few seconds while the tab is visible,
 * and the counts are read again only when it changed (and at least every minute, and when the tab comes back).
 */
const CHECK_MS = 8_000;
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
    let stamp: string | null = null;
    let busy = false;
    const pull = () => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      liveSegmentSummary(campaignId)
        .then((s) => {
          if (s && !stop) setSummary(s);
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    };
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/chats-live", { cache: "no-store" });
        if (!res.ok || stop) return;
        const { v } = (await res.json()) as { v: string };
        if (stamp !== null && v !== stamp) pull();
        stamp = v;
      } catch {
        // offline for a moment: the next tick tries again
      }
    };
    void check();
    const c = setInterval(check, CHECK_MS);
    const t = setInterval(pull, REFRESH_MS);
    document.addEventListener("visibilitychange", pull);
    return () => {
      stop = true;
      clearInterval(c);
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
        : "Meta limit: 250 people per 24 hours to start, worked out from your sends."
      : capacity.limit === null
        ? isTa
          ? "Meta வரம்பு: வரம்பில்லை."
          : "Meta limit: unlimited."
        : isTa
          ? `Meta வரம்பு: 24 மணி நேரத்தில் ${n(capacity.limit)} பேர் · இப்போது ${n(capacity.left ?? 0)} மீதம். அனுப்புவது நிறுத்தப்படாது; வரம்புக்கு மேல் உள்ளவற்றை Meta நிறுத்தி வைக்கும்.`
          : `Meta limit: ${n(capacity.limit)} people per 24 hours · ${n(capacity.left ?? 0)} left now. Sending isn't stopped; Meta holds back what goes over its limit.`;
  const leftOut = isTa
    ? `எப்போதும் விலக்கப்படுபவர்கள்: ${n(t.optedOut)} விலகியவர்கள், ${n(t.unreachable)} வாட்ஸ்அப் பெற முடியாதவர்கள், ${n(t.movedInactive)} நீங்கள் Dormant-க்கு மாற்றியவர்கள். ${n(t.paused)} பேருக்கு Meta தற்காலிகமாகச் சலுகைகளை நிறுத்தியுள்ளது; பின்னர் அனுப்பலாம்.`
    : `Always left out: ${n(t.optedOut)} opted out, ${n(t.unreachable)} can't receive WhatsApp, ${n(t.movedInactive)} you moved to Dormant. Meta is holding offers back from ${n(t.paused)} for now; they can be sent again later.`;

  if (!summary.history)
    return (
      <div className="space-y-2.5 rounded-control border border-line p-3" data-testid="first-campaign">
        <p className="text-sm font-medium text-ink-2">{isTa ? "முதல் பிரச்சாரம்: தகுதியுள்ள அனைத்து வாடிக்கையாளர்களும்" : "First campaign: all eligible customers"}</p>
        <p className="text-xs text-muted">
          {isTa
            ? "இன்னும் பிரச்சாரம் அனுப்பவில்லை, அதனால் யார் ஆர்வமாக உள்ளார்கள் என்று இப்போது சொல்ல முடியாது. முதல் பிரச்சாரத்துக்குப் பின் Engaged, Seen, Reached, Dormant குழுக்கள் தெரியும்."
            : "No campaign has gone out yet, so there's no history to group customers by. After this first send you can pick Engaged, Seen, Reached and Dormant customers."}
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

  // Saved campaigns may still say super / active / inactive: shown (and saved again) as today's groups.
  const picked = cleanSegments(value);
  const toggle = (s: Seg) => onChange(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s]);
  const chosen = picked.reduce((a, s) => a + summary.segments[s].eligible, 0);
  const card = (on: boolean) =>
    cn(
      "flex min-h-14 items-start gap-2.5 rounded-control border p-2.5 text-left transition active:scale-[0.99]",
      on ? "border-brand bg-brand-soft text-brand-deep shadow-xs ring-1 ring-brand/30" : "border-line-strong/40 bg-panel text-ink hover:border-line-strong hover:bg-sunken/40",
    );
  const box = (on: boolean) => (
    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-brand-deep bg-brand-deep text-white" : "border-line-strong")}>
      {on && <Check aria-hidden className="size-3.5" />}
    </span>
  );
  return (
    <fieldset className="space-y-2.5 rounded-control border border-line p-3" data-testid="segment-picker">
      <legend className="px-1 text-sm font-medium text-ink-2">{isTa ? "பதிலளிப்பதைப் பொறுத்து யாருக்கு" : "Who to reach, by how they respond"}</legend>
      <p className="text-xs text-muted">
        {isTa
          ? "உங்கள் எல்லாப் பிரச்சாரங்களிலிருந்தும் இப்போதைய நிலை, Chats வடிகட்டிகளின் அதே குழுக்கள்."
          : "Worked out live from all your campaigns so far: the same groups as the Chats filters."}
      </p>
      <div role="group" aria-label={isTa ? "குழுக்கள்" : "Groups"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* All eligible: no group filter, everyone in "Send to" a campaign can reach now. */}
        <button type="button" role="checkbox" aria-checked={!picked.length} data-segment="all" onClick={() => onChange([])} className={cn(card(!picked.length), "sm:col-span-2")}>
          {box(!picked.length)}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{isTa ? "தகுதியுள்ள அனைவரும்" : "All eligible"}</span>
              <span className="tabular text-sm font-semibold" data-testid="segment-total-all">{n(t.eligible)}</span>
            </span>
            <span className="block text-xs text-muted">{isTa ? "“Send to”-வில் உள்ள, இப்போது அனுப்பக்கூடிய அனைவரும்" : "Everyone in “Send to” a campaign can reach now"}</span>
          </span>
        </button>
        {ORDER.map((s) => {
          const on = picked.includes(s);
          const seg = summary.segments[s];
          return (
            <button key={s} type="button" role="checkbox" aria-checked={on} data-segment={s} onClick={() => toggle(s)} className={card(on)}>
              {box(on)}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{isTa ? LABEL[s].ta : LABEL[s].en}</span>
                  <span className="tabular text-sm font-semibold" data-testid={`segment-total-${s}`}>{n(seg.eligible + seg.excluded)}</span>
                </span>
                <span className="block text-xs text-muted">{isTa ? LABEL[s].hintTa : LABEL[s].hint}</span>
                {s === "dormant" && seg.moved > 0 ? (
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
      {picked.length > 0 && (
        <p className="text-xs font-medium text-ink-2" data-testid="segment-chosen">
          {isTa ? `தேர்ந்தெடுத்த குழுக்களில் இப்போது அனுப்பக்கூடியவர்கள்: ${n(chosen)}` : `Picked groups: ${n(chosen)} can be sent now`}
        </p>
      )}
      {picked.includes("dormant") && (
        <p className="text-xs text-warning" role="note">
          {isTa
            ? "Dormant வாடிக்கையாளர்களுக்கு வேறு, சிறப்பான சலுகையை அனுப்புங்கள். பதில் இல்லாமல் தொடர்ந்து அனுப்புவது உங்கள் எண்ணின் தரத்தைக் குறைக்கும்."
            : "Win-back send: give Dormant customers a different, stronger offer. Repeating offers that get no response lowers your number's quality with Meta."}
        </p>
      )}
      <p className="text-xs text-muted">
        {isTa
          ? `Engaged: கடைசி ${summary.rules.days} நாளில் பட்டன், பதில் அல்லது ஆர்டர். Seen: சலுகையைப் படித்தார்கள் (Meta படித்த குறி), பதில் இல்லை. Reached: சேர்ந்தது, படித்த குறி வரவில்லை. Dormant: தொடர்ந்து ${summary.rules.offers} சலுகைகள் சேர்ந்தும் பதில் இல்லை. தோல்வியடைந்த செய்திகள் கணக்கில் இல்லை.`
          : `Engaged: a tap, reply or order in the last ${summary.rules.days} days. Seen: Meta reported an offer read, no response. Reached: delivered, never reported read (some people turn read receipts off). Dormant: ${summary.rules.offers} offers in a row reached them with no response. Failed messages never count against anyone.`}
      </p>
      <p className="text-xs text-muted">{leftOut}</p>
      {capacityText && <p className="text-xs text-muted" data-testid="capacity">{capacityText}</p>}
    </fieldset>
  );
}
