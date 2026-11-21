"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "@/components/icons";
import { cn } from "@/lib/cn";
import { useTr } from "@/lib/i18n/context";
import { cleanSegments, SEGMENT_LABEL as LABEL, SEGMENTS as ORDER, type Segment as Seg } from "@/lib/segment-labels";
import { liveSegmentSummary, liveMultiTagSummaries, type MultiTagBreakdown } from "../actions/campaigns";
import { ClassificationInfoIcon } from "./classification-info";

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

const CHECK_MS = 8_000;
const REFRESH_MS = 60_000;

export function SegmentPicker({
  campaignId,
  audienceTag,
  summary: initial,
  value,
  onChange,
  capacity,
  mode = "all",
  tagsCount,
}: {
  campaignId: string | null;
  audienceTag?: string | null;
  summary: SegmentSummaryProps;
  value: string[];
  onChange: (v: string[]) => void;
  capacity: Capacity;
  mode?: "all" | "tags" | "saved";
  tagsCount?: number;
}) {
  const { isTa } = useTr();
  const audKey = audienceTag ?? "";
  const isTagMode = mode === "tags";
  const isEmptyTags = isTagMode && tagsCount === 0;

  // State: start with initial only if in Everyone mode. Tag mode must fetch its tag-scoped summary.
  const [summary, setSummary] = useState<SegmentSummaryProps | null>(isTagMode ? null : initial);
  const [multiTagBreakdowns, setMultiTagBreakdowns] = useState<MultiTagBreakdown[] | null>(null);
  const [loadedAudienceKey, setLoadedAudienceKey] = useState<string | null>(isTagMode ? null : "");
  const [loading, setLoading] = useState<boolean>(isTagMode && !isEmptyTags);
  const [error, setError] = useState<boolean>(false);
  const reqIdRef = useRef(0);

  const pull = async () => {
    if (isEmptyTags) {
      setLoading(false);
      setError(false);
      setSummary(null);
      setMultiTagBreakdowns(null);
      setLoadedAudienceKey(null);
      return;
    }
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const [s, m] = await Promise.all([
        liveSegmentSummary(campaignId, audienceTag),
        isTagMode && tagsCount && tagsCount > 1 ? liveMultiTagSummaries(campaignId, audienceTag) : Promise.resolve(null),
      ]);
      if (reqId !== reqIdRef.current) return;
      if (s) {
        setSummary(s);
        setMultiTagBreakdowns(m);
        setLoadedAudienceKey(audKey);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      if (reqId === reqIdRef.current) {
        setError(true);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let stop = false;
    let stamp: string | null = null;

    if (isEmptyTags) {
      setLoading(false);
      setError(false);
      setSummary(null);
      setLoadedAudienceKey(null);
      return;
    }

    // If audience changed or not yet loaded:
    if (loadedAudienceKey !== audKey) {
      void pull();
    }

    const check = async () => {
      if (document.visibilityState !== "visible" || stop) return;
      try {
        const res = await fetch("/api/chats-live", { cache: "no-store" });
        if (!res.ok || stop) return;
        const { v } = (await res.json()) as { v: string };
        if (stamp !== null && v !== stamp) void pull();
        stamp = v;
      } catch {
        // offline for a moment: the next tick tries again
      }
    };

    void check();
    const c = setInterval(check, CHECK_MS);
    const t = setInterval(pull, REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop = true;
      clearInterval(c);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, audKey, isTagMode, isEmptyTags]);

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

  // Render Empty State for Tags mode with 0 tags selected
  if (isEmptyTags) {
    return (
      <div className="rounded-control border border-dashed border-line p-4 text-center text-sm text-muted" data-testid="segment-tags-empty">
        <p>{isTa ? "வாடிக்கையாளர் தகுதியைக் காண மேலே குறைந்தது ஒரு குறிச்சொல்லைத் தேர்வு செய்யவும்." : "Select at least one tag above to view audience eligibility and options."}</p>
      </div>
    );
  }

  // Render Loading State
  if (loading && (!summary || loadedAudienceKey !== audKey)) {
    return (
      <div className="rounded-control border border-line p-4 text-center text-sm text-muted animate-pulse bg-panel" data-testid="segment-loading">
        <div className="flex items-center justify-center gap-2">
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span>{isTa ? "தேர்ந்தெடுக்கப்பட்ட குறிச்சொல்லுக்கான வாடிக்கையாளர்கள் கணக்கிடப்படுகிறார்கள்…" : "Calculating audience for selected tag…"}</span>
        </div>
      </div>
    );
  }

  // Render Error State
  if (error || !summary) {
    return (
      <div className="rounded-control border border-danger/30 bg-danger-soft/20 p-4 text-sm text-danger" data-testid="segment-error">
        <p className="font-medium">{isTa ? "குறிச்சொல் விவரங்களைக் கணக்கிட முடியவில்லை." : "Could not calculate audience summary."}</p>
        <button type="button" onClick={() => void pull()} className="mt-2 text-xs font-semibold underline hover:text-danger-deep">
          {isTa ? "மீண்டும் முயற்சி செய்" : "Try again"}
        </button>
      </div>
    );
  }

  const t = summary.totals;
  const leftOut = isTa
    ? `எப்போதும் விலக்கப்படுபவர்கள்: ${n(t.optedOut)} விலகியவர்கள், ${n(t.unreachable)} வாட்ஸ்அப் பெற முடியாதவர்கள், ${n(t.movedInactive)} நீங்கள் Dormant-க்கு மாற்றியவர்கள். ${n(t.paused)} பேருக்கு Meta தற்காலிகமாகச் சலுகைகளை நிறுத்தியுள்ளது; பின்னர் அனுப்பலாம்.`
    : `Always left out: ${n(t.optedOut)} opted out, ${n(t.unreachable)} can't receive WhatsApp, ${n(t.movedInactive)} you moved to Dormant. Meta is holding offers back from ${n(t.paused)} for now; they can be sent again later.`;

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

  // TAGS MODE: Clean Eligibility Overview + Collapsed Refinement
  if (isTagMode) {
    return (
      <div className="space-y-3" data-testid="tag-audience-view">
        {/* Layer 3: Audience Eligibility Overview */}
        <div className="space-y-2.5 rounded-control border border-line p-3 bg-panel" data-testid="tag-audience-eligibility">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{isTa ? "தற்போதைய வாடிக்கையாளர் தகுதி" : "Current audience eligibility"}</span>
            <span className="tabular text-xs font-semibold text-brand-deep bg-brand-soft px-2.5 py-0.5 rounded-full" data-testid="tag-total-count">
              {n(t.customers)} {isTa ? "மொத்த குறிச்சொல்லிடப்பட்டவர்கள்" : "total tagged"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted flex items-center justify-between">
                <span>{isTa ? "இப்போது அனுப்பக்கூடியவர்கள்" : "Eligible now"}</span>
                <ClassificationInfoIcon statusKey="ELIGIBLE_NOW" />
              </dt>
              <dd className="tabular font-semibold text-ink" data-testid="tag-eligible-count">{n(t.eligible)}</dd>
            </div>
            <div className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted flex items-center justify-between">
                <span>{isTa ? "பெற முடியாதவர்கள்" : "Can't receive"}</span>
                <ClassificationInfoIcon statusKey="UNREACHABLE" />
              </dt>
              <dd className="tabular font-semibold text-ink" data-testid="tag-unreachable-count">{n(t.unreachable + t.invalidNumber)}</dd>
            </div>
            <div className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted flex items-center justify-between">
                <span>{isTa ? "தற்காலிக நிறுத்தம் (Meta)" : "Temporarily held"}</span>
                <ClassificationInfoIcon statusKey="TEMPORARY_HOLD" />
              </dt>
              <dd className="tabular font-semibold text-ink" data-testid="tag-paused-count">{n(t.paused)}</dd>
            </div>
            <div className="rounded-control bg-sunken px-2.5 py-2">
              <dt className="text-xs text-muted flex items-center justify-between">
                <span>{isTa ? "விலகியவர்கள்" : "Opted out"}</span>
                <ClassificationInfoIcon statusKey="OPTED_OUT" />
              </dt>
              <dd className="tabular font-semibold text-ink" data-testid="tag-opted-out-count">{n(t.optedOut)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted">{leftOut}</p>
          {capacityText && <p className="text-xs text-muted" data-testid="capacity">{capacityText}</p>}

          {/* Individual Tag Breakdown when multiple tags are selected */}
          {multiTagBreakdowns && multiTagBreakdowns.length > 1 && (
            <div className="space-y-2 pt-2 border-t border-line/60" data-testid="multi-tag-individual-cards">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-2">
                  {isTa ? "தனித்தனி குறிச்சொல் விவரங்கள் (Individual Tag Breakdown)" : "Individual Tag Breakdown"}
                </span>
                <span className="text-2xs text-muted">
                  {isTa ? "மேலே உள்ள மொத்தத்தில் நகல் நீக்கப்பட்டுள்ளது" : "Deduplicated in combined audience above"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {multiTagBreakdowns.map((mt) => (
                  <div key={mt.tag} className="rounded-control bg-sunken p-2.5 border border-line/60 space-y-1.5" data-testid={`tag-card-${mt.tag}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-ink flex items-center gap-1">
                        <span className="text-muted">🏷️</span> {mt.tag}
                      </span>
                      <span className="tabular text-2xs font-semibold text-ink-2 bg-panel px-1.5 py-0.5 rounded border border-line">
                        {n(mt.customers)} {isTa ? "நபர்கள்" : "customers"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-2xs">
                      <div className="bg-panel p-1 rounded border border-line/40">
                        <span className="text-muted block text-3xs">{isTa ? "தகுதியானவர்கள்" : "Eligible"}</span>
                        <span className="font-semibold text-ink">{n(mt.eligible)}</span>
                      </div>
                      <div className="bg-panel p-1 rounded border border-line/40">
                        <span className="text-muted block text-3xs">{isTa ? "தற்காலிக நிறுத்தம்" : "Held (Meta)"}</span>
                        <span className="font-semibold text-amber-600">{n(mt.paused)}</span>
                      </div>
                      <div className="bg-panel p-1 rounded border border-line/40">
                        <span className="text-muted block text-3xs">{isTa ? "விலக்கப்பட்டவர்கள்" : "Excluded"}</span>
                        <span className="font-semibold text-danger">{n(mt.unreachable + mt.optedOut)}</span>
                      </div>
                    </div>
                    <div className="text-3xs text-muted flex items-center justify-between pt-0.5 border-t border-line/30">
                      <span>{isTa ? `முதல் முறை: ${n(mt.segments.firstTime)}` : `First-time: ${n(mt.segments.firstTime)}`}</span>
                      <span>{isTa ? `சென்றடைந்தது: ${n(mt.segments.reached + mt.segments.seen)}` : `Attempted: ${n(mt.segments.reached + mt.segments.seen)}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Layer 2: Optional Collapsed Refinement */}
        <details className="group rounded-control border border-line bg-panel p-3 transition" data-testid="tag-engagement-refinement">
          <summary className="cursor-pointer font-medium text-sm text-ink-2 select-none flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" />
              <span>{isTa ? "பதிலளிப்பதைப் பொறுத்து வடிகட்டு (விருப்பத்தேர்வு)" : "Refine by engagement (Optional)"}</span>
            </span>
            {picked.length > 0 ? (
              <span className="text-xs font-semibold text-brand-deep bg-brand-soft px-2 py-0.5 rounded-full" data-testid="tag-refinement-active">
                {picked.length} {isTa ? "தேர்வு" : "picked"}
              </span>
            ) : (
              <span className="text-xs text-muted">{isTa ? "வடிகட்டல் இல்லை (அனைவருக்கும்)" : "No filter (all eligible)"}</span>
            )}
          </summary>
          <div className="mt-3 pt-3 border-t border-line space-y-2.5">
            <p className="text-xs text-muted">
              {isTa
                ? "இந்தக் குறிச்சொல்லில் உள்ள வாடிக்கையாளர்களை மட்டும் அவர்களின் முந்தைய செயல்பாட்டின்படி பிரிக்கவும். வடிகட்டல் இல்லை என்றால் குறிச்சொல்லில் உள்ள தகுதியுள்ள அனைவருக்கும் அனுப்பப்படும்."
                : "Optionally narrow this tag's customers by how they responded to your previous campaigns. Defaults to all eligible in this tag."}
            </p>
            <div role="group" aria-label={isTa ? "குழுக்கள்" : "Groups"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={!picked.length}
                data-segment="all"
                onClick={() => onChange([])}
                className={cn(card(!picked.length), "sm:col-span-2")}
              >
                {box(!picked.length)}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{isTa ? "குறிச்சொல்லில் உள்ள தகுதியுள்ள அனைவரும்" : "All eligible in this tag"}</span>
                    <span className="tabular text-sm font-semibold" data-testid="segment-total-all">{n(t.eligible)}</span>
                  </span>
                  <span className="block text-xs text-muted">
                    {isTa ? "கூடுதல் குழு வடிகட்டல் இல்லை; குறிச்சொல்லில் உள்ள தகுதியுள்ள அனைவருக்கும் அனுப்பப்படும்" : "No engagement filter; send to all eligible in this tag"}
                  </span>
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
                        <span className="font-semibold flex items-center gap-1.5">
                          <span>{isTa ? LABEL[s].ta : LABEL[s].en}</span>
                          <ClassificationInfoIcon statusKey={s === "engaged" ? "ENGAGED" : s === "seen" ? "READ_SEEN" : s === "reached" ? "DELIVERED_NO_ENGAGEMENT" : s === "dormant" ? "DORMANT" : "FIRST_TIME_NEVER_SENT"} />
                        </span>
                        <span className="tabular text-sm font-semibold" data-testid={`segment-total-${s}`}>{n(seg.eligible + seg.excluded)}</span>
                      </span>
                      <span className="block text-xs text-muted">{isTa ? LABEL[s].hintTa : LABEL[s].hint}</span>
                      {seg.excluded > 0 && (
                        <span className="block text-xs text-muted" data-testid={`segment-sendable-${s}`}>
                          {isTa ? `இப்போது ${n(seg.eligible)} பேருக்கு அனுப்பலாம்` : `${n(seg.eligible)} can be sent now`}
                        </span>
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
          </div>
        </details>
      </div>
    );
  }

  // EVERYONE MODE / FIRST CAMPAIGN
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

  // EVERYONE MODE (Normal Fieldset View)
  return (
    <fieldset className="space-y-2.5 rounded-control border border-line p-3" data-testid="segment-picker">
      <legend className="px-1 text-sm font-medium text-ink-2">{isTa ? "பதிலளிப்பதைப் பொறுத்து யாருக்கு" : "Who to reach, by how they respond"}</legend>
      <p className="text-xs text-muted">
        {isTa
          ? "உங்கள் எல்லாப் பிரச்சாரங்களிலிருந்தும் இப்போதைய நிலை, Chats வடிகட்டிகளின் அதே குழுக்கள்."
          : "Worked out live from all your campaigns so far: the same groups as the Chats filters."}
      </p>
      <div role="group" aria-label={isTa ? "குழுக்கள்" : "Groups"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
                  <span className="font-semibold flex items-center gap-1.5">
                    <span>{isTa ? LABEL[s].ta : LABEL[s].en}</span>
                    <ClassificationInfoIcon statusKey={s === "engaged" ? "ENGAGED" : s === "seen" ? "READ_SEEN" : s === "reached" ? "DELIVERED_NO_ENGAGEMENT" : s === "dormant" ? "DORMANT" : "FIRST_TIME_NEVER_SENT"} />
                  </span>
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
