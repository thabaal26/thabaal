"use client";

import { Calendar as CalendarIcon, CalendarDays, CalendarRange, Clock, Gauge, Repeat, Users, X } from "@/components/icons";
import { Calendar3D, Gauge3D, Send3D } from "@/components/icons-3d";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarPicker, getTodayStr } from "@/components/calendar-picker";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { MultiPicker } from "@/components/multi-picker";
import { Picker } from "@/components/picker";
import { safeAction, toastResult } from "@/components/toast";
import { Button, Callout, Card, CardHeader, CheckRow, Field, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { templateLabel } from "@/lib/plain-error";
import { useTr } from "@/lib/i18n/context";
import { dayName, DAYS, describeScheduleSummary, effectiveInterval, estimateDuration, formatMinutes, SCHEDULER_TICK_MINUTES, TIME_PRESETS, WEEKLY_PAIRS } from "@/lib/schedule";
import { AUDIENCE_PREFIX, decodeTags, describeTags, encodeTags, TAGS_PREFIX, type TagPick } from "@/lib/audience-tags";
import { countCampaignAudience, saveCampaign, type CampaignInput } from "../actions/campaigns";

type SendTo = "all" | "tags" | "saved";
type ScheduleMode = "DATE" | "WEEKLY_1" | "WEEKLY_2" | "WEEKDAYS" | "DAILY" | "CUSTOM";

function getInitialScheduleMode(input: CampaignInput): ScheduleMode {
  if (input.scheduleType === "ONCE") return "DATE";
  const days = input.daysOfWeek ?? [];
  if (days.length === 7) return "DAILY";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "WEEKDAYS";
  if (days.length === 2) return "WEEKLY_2";
  if (days.length === 1) return "WEEKLY_1";
  return "CUSTOM";
}

const PRESETS = [
  { label: "Gentle", batch: 50, interval: 15 },
  { label: "Balanced", batch: 100, interval: 10 },
  { label: "Fast", batch: 250, interval: 5 },
];

export function CampaignForm({
  id,
  initial,
  templates,
  audience,
  numbers,
}: {
  id: string | null;
  initial: CampaignInput;
  templates: { id: string; name: string; category: string; status: string; businessAccountId: string | null }[];
  audience: { all: number; tags: { tag: string; label: string; hint?: string; n: number }[] };
  numbers: { id: string; label: string; businessAccountId: string; isDefault: boolean; dailyLimit: number | null; quality: string | null }[];
}) {
  const { tr, isTa } = useTr();
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<CampaignInput>) => setC((s) => ({ ...s, ...patch }));

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>(() => getInitialScheduleMode(initial));

  const todayStr = useMemo(() => getTodayStr(), []);

  function chooseScheduleMode(next: ScheduleMode) {
    setScheduleMode(next);
    if (next === "DATE") {
      set({ scheduleType: "ONCE", runDate: c.runDate || todayStr });
    } else if (next === "WEEKLY_1") {
      const day = c.daysOfWeek.length === 1 ? c.daysOfWeek[0] : 1;
      set({ scheduleType: "WEEKLY", daysOfWeek: [day] });
    } else if (next === "WEEKLY_2") {
      const days = c.daysOfWeek.length === 2 ? c.daysOfWeek : [2, 5];
      set({ scheduleType: "WEEKLY", daysOfWeek: days });
    } else if (next === "WEEKDAYS") {
      set({ scheduleType: "WEEKLY", daysOfWeek: [1, 2, 3, 4, 5] });
    } else if (next === "DAILY") {
      set({ scheduleType: "WEEKLY", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    } else if (next === "CUSTOM") {
      set({ scheduleType: "WEEKLY", daysOfWeek: c.daysOfWeek.length ? c.daysOfWeek : [1, 3, 5] });
    }
  }

  const isPastTimeToday = useMemo(() => {
    if (c.scheduleType !== "ONCE" || c.runDate !== todayStr) return false;
    try {
      const nowTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      return c.sendTime <= nowTime;
    } catch {
      return false;
    }
  }, [c.scheduleType, c.runDate, c.sendTime, todayStr]);

  // "Send to": everyone, one or more tags (any or all of them), or a saved audience.
  const savedOptions = audience.tags.filter((t) => t.tag.startsWith(AUDIENCE_PREFIX));
  const tagOptions = audience.tags.filter((t) => !t.tag.startsWith(AUDIENCE_PREFIX));
  const [sendTo, setSendTo] = useState<SendTo>(!initial.audienceTag ? "all" : initial.audienceTag.startsWith(AUDIENCE_PREFIX) ? "saved" : "tags");
  const [pick, setPick] = useState<TagPick>(decodeTags(initial.audienceTag) ?? { match: "any", tags: [] });
  // No tags picked yet stays a (rejected) tag list, never quietly "everyone".
  const tagValue = (p: TagPick) => encodeTags(p) || `${TAGS_PREFIX}${JSON.stringify({ match: p.match, tags: [] })}`;
  const chooseSendTo = (v: SendTo) => {
    setSendTo(v);
    set({ audienceTag: v === "all" ? "" : v === "tags" ? tagValue(pick) : (savedOptions.find((o) => o.tag === c.audienceTag)?.tag ?? savedOptions[0]?.tag ?? "") });
  };
  const choosePick = (next: TagPick) => {
    setPick(next);
    set({ audienceTag: tagValue(next) });
  };

  // Several tags can overlap, so their reach is counted on the server.
  const multi = sendTo === "tags" && pick.tags.length > 1;
  const [counted, setCounted] = useState<{ key: string; n: number } | null>(null);
  useEffect(() => {
    if (!multi) return;
    const key = c.audienceTag;
    const t = setTimeout(async () => {
      const r = await countCampaignAudience(id, key).catch(() => ({ ok: false, n: 0 }));
      setCounted({ key, n: r.ok ? r.n : -1 }); // -1: couldn't count
    }, 300);
    return () => clearTimeout(t);
  }, [multi, c.audienceTag, id]);
  const counting = multi && counted?.key !== c.audienceTag;

  const size =
    sendTo === "all" || !c.audienceTag
      ? audience.all
      : multi
        ? Math.max(0, counted?.n ?? 0)
        : sendTo === "tags" && !pick.tags.length
          ? 0
          : (audience.tags.find((t) => t.tag === (sendTo === "tags" ? pick.tags[0] : c.audienceTag))?.n ?? 0);
  const tagLabel = (tag: string) => tagOptions.find((t) => t.tag === tag)?.label ?? tag;
  // While several tags are being counted (or couldn't be), the summary shows that instead of 0.
  const sizeKnown = !multi || (!counting && (counted?.n ?? -1) >= 0);
  const batches = c.batchSize > 0 ? Math.ceil(size / c.batchSize) : 0;
  const mins = estimateDuration(size, c.batchSize, c.intervalMinutes);
  const [h, m] = c.sendTime.split(":").map(Number);
  const end = new Date(2000, 0, 1, h || 0, (m || 0) + mins);
  const perWeek = c.scheduleType === "WEEKLY" ? c.daysOfWeek.length : 0;
  // Meta only sends a template from numbers in the account that approved it.
  const sender = numbers.find((n) => n.id === c.senderId) ?? numbers[0];
  // Meta's 24-hour limit can stretch a big send over several days.
  const days = sender?.dailyLimit ? Math.ceil(size / sender.dailyLimit) : 1;
  const usable = sender ? templates.filter((t) => !t.businessAccountId || t.businessAccountId === sender.businessAccountId) : templates;
  const chosen = usable.find((t) => t.id === c.templateId);

  function save() {
    if (pending) return;
    start(async () => {
      const r = await safeAction(() => saveCampaign(id, c));
      toastResult(r);
      if (r.ok) {
        router.push(`/dashboard/campaigns/${r.id}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="min-w-0 grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-4 sm:space-y-6">
        <Card className="card-3d">
          <CardHeader tone="brand" icon={<Send3D />} title="Message" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field id="cname" label="Campaign name" className="sm:col-span-2">
              <input className="field" placeholder="Weekly offers" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            {numbers.length > 1 && (
              <div className="sm:col-span-2">
                <label htmlFor="sender" className="mb-1.5 block text-sm font-medium text-ink-2">{tr("Send from")}</label>
                <Picker
                  id="sender"
                  title="Send from"
                  value={c.senderId}
                  onChange={(id) => {
                    const next = numbers.find((n) => n.id === id) ?? numbers[0];
                    const keep = templates.find((t) => t.id === c.templateId && (!t.businessAccountId || t.businessAccountId === next.businessAccountId));
                    set({ senderId: id, templateId: keep ? c.templateId : "" });
                  }}
                  options={[
                    { value: "", label: "Default number", hint: numbers.find((n) => n.isDefault)?.label ?? numbers[0].label },
                    ...numbers.map((n) => ({ value: n.id, label: n.label, hint: n.dailyLimit ? (isTa ? `நாளுக்கு ${n.dailyLimit.toLocaleString("en-IN")} பேர் வரை` : `Up to ${n.dailyLimit.toLocaleString("en-IN")} people a day`) : "No daily limit" })),
                  ]}
                />
                <p className="mt-1.5 text-xs text-muted">{tr("Templates below are the ones approved for this number.")}</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="tpl" className="mb-1.5 block text-sm font-medium text-ink-2">{tr("Template")}</label>
              <Picker
                id="tpl"
                title="Template"
                value={chosen ? c.templateId : ""}
                onChange={(templateId) => set({ templateId })}
                placeholder={usable.length ? "Choose a template…" : "No templates for this number yet"}
                options={[...usable].sort((a, b) => Number(b.category === "MARKETING") - Number(a.category === "MARKETING")).map((t) => ({
                  value: t.id,
                  label: templateLabel(t.name),
                  hint: `${tr(`${t.category.charAt(0)}${t.category.slice(1).toLowerCase()}`)}${t.status !== "APPROVED" ? (isTa ? " · இன்னும் அனுமதிக்கப்படவில்லை" : " · not approved yet") : isTa ? " · அனுமதிக்கப்பட்டது" : " · approved"}`,
                }))}
              />
              {chosen && chosen.status !== "APPROVED" && <p className="mt-1.5 text-xs text-warning">{tr("Sending waits until Meta approves this template.")}</p>}
            </div>
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-2">{tr("Send to")}</legend>
              <Segmented
                label="Send to"
                value={sendTo}
                onChange={chooseSendTo}
                options={[
                  { value: "all", label: "Everyone" },
                  { value: "tags", label: "Tags" },
                  ...(savedOptions.length ? [{ value: "saved" as const, label: "Audience" }] : []),
                ]}
                className="w-full sm:w-auto"
              />

              {sendTo === "tags" && (
                <div className="space-y-3">
                  <MultiPicker
                    id="aud-tags"
                    title="Customers tagged"
                    placeholder={tagOptions.length ? "Choose one or more tags…" : "No tags yet"}
                    value={pick.tags}
                    onChange={(tags) => choosePick({ ...pick, tags })}
                    options={tagOptions.map((t) => ({ value: t.tag, label: t.label, hint: `${t.n.toLocaleString("en-IN")} ${tr(t.n === 1 ? "customer" : "customers")}` }))}
                  />
                  {pick.tags.length > 0 && (
                    <ul aria-label="Chosen tags" className="flex flex-wrap gap-1.5">
                      {pick.tags.map((tag) => (
                        <li key={tag}>
                          <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-3 pr-1 text-sm font-medium text-brand-deep">
                            {tagLabel(tag)}
                            <button
                              type="button"
                              aria-label={isTa ? `${tagLabel(tag)} நீக்கு` : `Remove ${tagLabel(tag)}`}
                              onClick={() => choosePick({ ...pick, tags: pick.tags.filter((x) => x !== tag) })}
                              className="grid size-7 place-items-center rounded-full transition hover:bg-brand/15 active:bg-brand/20 pointer-coarse:size-9"
                            >
                              <X aria-hidden className="size-3.5" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {pick.tags.length > 1 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="text-sm text-ink-2">{tr("Customers with")}</span>
                      <Segmented
                        label="Customers with"
                        value={pick.match}
                        onChange={(match) => choosePick({ ...pick, match })}
                        options={[
                          { value: "any", label: "any of these" },
                          { value: "all", label: "all of these" },
                        ]}
                      />
                    </div>
                  )}
                </div>
              )}

              {sendTo === "saved" && (
                <Picker
                  id="aud"
                  title="Saved audience"
                  value={c.audienceTag}
                  onChange={(audienceTag) => set({ audienceTag })}
                  options={savedOptions.map((t) => ({ value: t.tag, label: t.label.replace(/^★\s*/, ""), hint: `${t.n.toLocaleString("en-IN")} ${tr(t.n === 1 ? "customer" : "customers")}${t.hint ? ` · ${t.hint}` : ""}` }))}
                />
              )}

              <p className="tabular text-sm text-muted" aria-live="polite">
                {isTa
                  ? sendTo === "all"
                    ? `ஒப்புதல் அளித்த அனைத்து ${audience.all.toLocaleString("en-IN")} வாடிக்கையாளர்களும்.`
                    : sendTo === "tags" && !pick.tags.length
                      ? tr("Pick at least one tag.")
                      : counting
                        ? tr("Counting customers…")
                        : multi && counted?.n === -1
                          ? `${describeTags(pick, tagLabel)} குறிச்சொல் உள்ளவர்கள். இப்போது எண்ண முடியவில்லை; பொருந்தும் அனைவருக்கும் பிரச்சாரம் சென்றடையும்.`
                          : `${size.toLocaleString("en-IN")} வாடிக்கையாளர்கள்${sendTo === "tags" ? ` (${describeTags(pick, tagLabel)})` : ""}.`
                  : sendTo === "all"
                  ? `All ${audience.all.toLocaleString("en-IN")} opted-in customers.`
                  : sendTo === "tags" && !pick.tags.length
                    ? "Pick at least one tag."
                    : counting
                      ? "Counting customers…"
                      : multi && counted?.n === -1
                        ? `Customers tagged ${describeTags(pick, tagLabel)}. Couldn't count them right now; the campaign still reaches everyone who matches.`
                      : `${size.toLocaleString("en-IN")} customer${size === 1 ? "" : "s"}${sendTo === "tags" ? ` tagged ${describeTags(pick, tagLabel)}` : ""}.`}
              </p>
            </fieldset>
          </div>
        </Card>

        <Card className="card-3d">
          <CardHeader tone="info" icon={<Calendar3D />} title="Schedule" description="Times are in India Standard Time." />
          <div className="space-y-5 p-4 sm:p-5">
            {/* Mode selection buttons */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-ink-2">{tr("Schedule type")}</legend>
              <div role="radiogroup" aria-label={tr("Schedule type")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { key: "DATE" as const, title: "Calendar date", hint: "Send once on a date", icon: CalendarIcon },
                  { key: "WEEKLY_1" as const, title: "Weekly once", hint: "1 day every week", icon: Repeat },
                  { key: "WEEKLY_2" as const, title: "Weekly twice", hint: "2 days every week", icon: Repeat },
                  { key: "WEEKDAYS" as const, title: "Weekdays", hint: "Mon–Fri (5×/wk)", icon: CalendarDays },
                  { key: "DAILY" as const, title: "Every day", hint: "Daily (7 days/wk)", icon: Clock },
                  { key: "CUSTOM" as const, title: "Custom days", hint: "Pick any days", icon: CalendarRange },
                ].map((m) => {
                  const on = scheduleMode === m.key;
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => chooseScheduleMode(m.key)}
                      className={cn(
                        "flex min-h-12 flex-col justify-center rounded-control border p-2.5 text-left transition active:scale-[0.98] sm:min-h-14 sm:p-3 pointer-coarse:min-h-14",
                        on
                          ? "border-brand bg-brand-soft text-brand-deep shadow-xs ring-1 ring-brand/30"
                          : "border-line-strong/40 bg-panel text-ink hover:border-line-strong hover:bg-sunken/40",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-semibold sm:text-sm">
                        <Icon aria-hidden className="size-3.5 sm:size-4 shrink-0" />
                        <span className="truncate">{tr(m.title)}</span>
                      </span>
                      <span className={cn("mt-0.5 text-2xs leading-tight sm:text-xs", on ? "text-brand-deep" : "text-muted")}>
                        {tr(m.hint)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* If DATE: Show interactive calendar */}
            {scheduleMode === "DATE" && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink-2">{tr("Pick date from calendar")}</label>
                <CalendarPicker
                  value={c.runDate}
                  onChange={(runDate) => set({ runDate })}
                />
              </div>
            )}

            {/* If WEEKLY_1: Pick 1 day */}
            {scheduleMode === "WEEKLY_1" && (
              <fieldset className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink-2">
                  <span>{tr("Day to send each week")}</span>
                  <span className="text-xs font-normal text-muted">{tr("Pick 1 day")}</span>
                </legend>
                <div className="grid grid-cols-7 gap-0.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.daysOfWeek.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ daysOfWeek: [i] })}
                        className={cn(
                          "flex h-11 min-w-0 items-center justify-center rounded-control border px-0.5 text-xs font-medium transition active:scale-95 sm:w-12 sm:flex-none pointer-coarse:min-h-11",
                          on ? "border-brand bg-brand text-on-brand shadow-xs font-semibold" : "border-line-strong/50 bg-panel text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {dayName(i, isTa)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">
                  {isTa ? (
                    <>ஒவ்வொரு வாரமும் <b>{c.daysOfWeek.length ? dayName(c.daysOfWeek[0], true) : "தேர்வு செய்த நாள்"}</b> அன்று ஒருமுறை அனுப்பும்.</>
                  ) : (
                    <>Sends once every week on <b>{c.daysOfWeek.length ? DAYS[c.daysOfWeek[0]] : "selected day"}</b>.</>
                  )}
                </p>
              </fieldset>
            )}

            {/* If WEEKLY_2: Pick 2 days */}
            {scheduleMode === "WEEKLY_2" && (
              <fieldset className="space-y-3">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink-2">
                  <span>{tr("Days to send each week")}</span>
                  <span className="text-xs font-normal text-muted">{isTa ? `2-ல் ${c.daysOfWeek.length} தேர்வு` : `${c.daysOfWeek.length} of 2 selected`}</span>
                </legend>
                {/* Quick pair presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted mr-1">{tr("Popular pairs:")}</span>
                  {WEEKLY_PAIRS.map((p) => {
                    const activePair = c.daysOfWeek.length === 2 && c.daysOfWeek.includes(p.days[0]) && c.daysOfWeek.includes(p.days[1]);
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => set({ daysOfWeek: [...p.days] })}
                        className={cn(
                          "min-h-10 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 sm:min-h-8 sm:px-2.5 sm:pointer-coarse:min-h-10",
                          activePair
                            ? "border-brand bg-brand text-on-brand shadow-xs"
                            : "border-line bg-sunken/60 text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {tr(p.label)}
                      </button>
                    );
                  })}
                </div>
                {/* 7 day buttons */}
                <div className="grid grid-cols-7 gap-0.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.daysOfWeek.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          if (on) {
                            set({ daysOfWeek: c.daysOfWeek.filter((x) => x !== i) });
                          } else if (c.daysOfWeek.length < 2) {
                            set({ daysOfWeek: [...c.daysOfWeek, i].sort() });
                          } else {
                            // Replace first day with new day
                            set({ daysOfWeek: [c.daysOfWeek[1], i].sort() });
                          }
                        }}
                        className={cn(
                          "flex h-11 min-w-0 items-center justify-center rounded-control border px-0.5 text-xs font-medium transition active:scale-95 sm:w-12 sm:flex-none pointer-coarse:min-h-11",
                          on ? "border-brand bg-brand text-on-brand shadow-xs font-semibold" : "border-line-strong/50 bg-panel text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {dayName(i, isTa)}
                      </button>
                    );
                  })}
                </div>
                {c.daysOfWeek.length < 2 ? (
                  <p className="text-xs text-warning">{tr("Pick 1 more day to make 2 days per week.")}</p>
                ) : (
                  <p className="text-xs text-muted">
                    {isTa ? (
                      <>வாரம் இருமுறை <b>{dayName(c.daysOfWeek[0], true)}</b> மற்றும் <b>{dayName(c.daysOfWeek[1], true)}</b> அன்று அனுப்பும்.</>
                    ) : (
                      <>Sends twice a week on <b>{DAYS[c.daysOfWeek[0]]}</b> and <b>{DAYS[c.daysOfWeek[1]]}</b>.</>
                    )}
                  </p>
                )}
              </fieldset>
            )}

            {/* If WEEKDAYS: Mon-Fri */}
            {scheduleMode === "WEEKDAYS" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium text-ink-2">
                  <span>{tr("Every weekday")}</span>
                  <span className="text-xs font-normal text-muted">{tr("5 days per week")}</span>
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = i >= 1 && i <= 5;
                    return (
                      <div
                        key={d}
                        className={cn(
                          "flex h-11 min-w-0 items-center justify-center rounded-control border px-0.5 text-xs font-medium sm:w-12 sm:flex-none",
                          on ? "border-brand bg-brand text-on-brand shadow-xs font-semibold" : "border-line bg-sunken text-muted/50 opacity-60",
                        )}
                      >
                        {dayName(i, isTa)}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">{tr("Sends Monday through Friday (skips weekends).")}</p>
              </div>
            )}

            {/* If DAILY: All 7 days */}
            {scheduleMode === "DAILY" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-medium text-ink-2">
                  <span>{tr("Every day")}</span>
                  <span className="text-xs font-normal text-muted">{tr("7 days per week")}</span>
                </div>
                <div className="grid grid-cols-7 gap-0.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => (
                    <div
                      key={d}
                      className="flex h-11 min-w-0 items-center justify-center rounded-control border border-brand bg-brand text-on-brand shadow-xs px-0.5 text-xs font-semibold sm:w-12 sm:flex-none"
                    >
                      {dayName(i, isTa)}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted">{tr("Sends every day, Sunday through Saturday.")}</p>
              </div>
            )}

            {/* If CUSTOM: Toggle any days */}
            {scheduleMode === "CUSTOM" && (
              <fieldset className="space-y-2">
                <legend className="flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink-2">
                  <span>{tr("Custom days")}</span>
                  <span className="text-xs font-normal text-muted">{isTa ? `வாரம் ${c.daysOfWeek.length}` : `${c.daysOfWeek.length} per week`}</span>
                </legend>
                <div className="grid grid-cols-7 gap-0.5 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.daysOfWeek.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ daysOfWeek: on ? c.daysOfWeek.filter((x) => x !== i) : [...c.daysOfWeek, i].sort() })}
                        className={cn(
                          "flex h-11 min-w-0 items-center justify-center rounded-control border px-0.5 text-xs font-medium transition active:scale-95 sm:w-12 sm:flex-none pointer-coarse:min-h-11",
                          on ? "border-brand bg-brand text-on-brand shadow-xs font-semibold" : "border-line-strong/50 bg-panel text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {dayName(i, isTa)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted">
                  {c.daysOfWeek.length === 0
                    ? tr("Pick at least one day.")
                    : isTa
                      ? `${c.daysOfWeek.map((d) => dayName(d, true)).join(", ")} அன்று அனுப்பும் (வாரம் ${c.daysOfWeek.length} முறை).`
                      : `Sends on ${c.daysOfWeek.map((d) => DAYS[d]).join(", ")} (${c.daysOfWeek.length}× per week).`}
                </p>
              </fieldset>
            )}

            {/* Start Time section */}
            <div className="space-y-2.5 border-t border-line/60 pt-4">
              <div className="flex items-center justify-between">
                <label htmlFor="time" className="text-sm font-medium text-ink-2">{tr("Start time (IST)")}</label>
                <span className="text-xs text-muted">{tr("India Standard Time")}</span>
              </div>
              {/* Quick time chips */}
              <div className="flex flex-wrap gap-1.5">
                {TIME_PRESETS.map((tp) => {
                  const on = c.sendTime === tp.time;
                  return (
                    <button
                      key={tp.time}
                      type="button"
                      onClick={() => set({ sendTime: tp.time })}
                      className={cn(
                        "min-h-10 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 sm:min-h-8 sm:px-2.5 sm:pointer-coarse:min-h-10",
                        on
                          ? "border-brand bg-brand text-on-brand shadow-xs"
                          : "border-line bg-sunken/60 text-ink-2 hover:border-line-strong",
                      )}
                    >
                      {tr(tp.label)} ({tp.hint})
                    </button>
                  );
                })}
              </div>
              <div className="max-w-xs">
                <input
                  id="time"
                  type="time"
                  className="field tabular"
                  value={c.sendTime}
                  onChange={(e) => set({ sendTime: e.target.value })}
                />
              </div>
            </div>

            {/* Schedule Live Preview Banner */}
            <div className="flex items-center gap-2.5 rounded-control bg-brand-soft/70 px-3.5 py-2.5 text-xs text-brand-deep border border-brand/20">
              <Clock aria-hidden className="size-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <span className="font-semibold">{tr("Schedule summary:")} </span>
                <span>{describeScheduleSummary(c.scheduleType, c.daysOfWeek, c.sendTime, c.runDate, isTa)}</span>
              </div>
            </div>

            {/* Validation warning if past date/time chosen */}
            {isPastTimeToday && (
              <Callout tone="warning">
                {isTa
                  ? `இன்று ${c.sendTime} நேரம் ஏற்கனவே கடந்துவிட்டது. பிந்தைய நேரத்தையோ நாளையையோ தேர்வு செய்யவும்.`
                  : `The time ${c.sendTime} has already passed for today. Please choose a later time or select tomorrow.`}
              </Callout>
            )}
          </div>
        </Card>

        <Card className="card-3d">
          <CardHeader tone="brand" icon={<Gauge3D />} title="Pacing" description="Send in small batches so your number keeps a good quality rating with Meta." />
          <div className="space-y-5 p-4 sm:p-5">
            <div role="group" aria-label="Pace presets" className="grid gap-2 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap">
              {PRESETS.map((p) => {
                const on = c.batchSize === p.batch && c.intervalMinutes === p.interval;
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ batchSize: p.batch, intervalMinutes: p.interval })}
                    className={cn(
                      "flex min-h-11 items-baseline justify-between gap-2 rounded-control border px-3 py-2 text-left text-xs transition active:scale-[0.98] min-[420px]:block",
                      on ? "border-brand bg-brand-soft text-brand-deep" : "border-line-strong/50 bg-panel hover:border-line-strong",
                    )}
                  >
                    <span className="block text-sm font-medium">{tr(p.label)}</span>
                    <span className={on ? "text-brand-deep" : "text-muted"}>
                      {isTa ? `${p.interval} நிமிடத்துக்கு ${p.batch}` : `${p.batch} every ${p.interval} min`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="batch" label="Customers per batch" hint="1–1,000">
                <input type="number" inputMode="numeric" min={1} max={1000} className="field tabular" value={c.batchSize || ""} onChange={(e) => set({ batchSize: Number(e.target.value) })} />
              </Field>
              <Field id="interval" label="Wait between batches" hint="minutes">
                <input type="number" inputMode="numeric" min={1} max={1440} className="field tabular" value={c.intervalMinutes || ""} onChange={(e) => set({ intervalMinutes: Number(e.target.value) })} />
              </Field>
            </div>
            {c.intervalMinutes > 0 && c.intervalMinutes < SCHEDULER_TICK_MINUTES && (
              <Callout tone="warning">
                {isTa
                  ? `தொகுதிகள் அதிகபட்சம் ${SCHEDULER_TICK_MINUTES} நிமிடத்துக்கு ஒருமுறை செல்லும், எனவே ${c.intervalMinutes} நிமிடம் ${SCHEDULER_TICK_MINUTES} ஆகவே செயல்படும். வேகமாக அனுப்ப, தொகுதி அளவை உயர்த்துங்கள்.`
                  : `Batches go out at most once every ${SCHEDULER_TICK_MINUTES} minutes, so ${c.intervalMinutes} min works as ${SCHEDULER_TICK_MINUTES}. For a faster pace, raise the batch size instead.`}
              </Callout>
            )}
          </div>
        </Card>
      </div>

      <aside aria-label={isTa ? "சுருக்கம்" : "Summary"} className="min-w-0 space-y-4 lg:sticky lg:top-8">
        <Card className="card-3d overflow-hidden">
          <div className="surface-dark bg-night p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{tr("Each send")}</p>
            <p className="tabular mt-2 text-3xl font-semibold">
              {sizeKnown ? size.toLocaleString("en-IN") : "…"} <span className="text-base font-normal text-white/75">{tr(size === 1 ? "customer" : "customers")}</span>
            </p>
            <p className="mt-1 text-sm text-white/80">
              {!sizeKnown
                ? tr("Counting customers…")
                : !size
                  ? tr("No customers match yet")
                  : isTa
                    ? `${batches} தொகுதி · ${days > 1 ? `சுமார் ${days} நாட்களில்` : formatMinutes(mins, true)} முடியும்`
                    : <>{batches} batch{batches === 1 ? "" : "es"} · done in {days > 1 ? `about ${days} days` : formatMinutes(mins)}</>}
            </p>
            {days > 1 && sender?.dailyLimit && (
              <p className="mt-2 rounded-control bg-white/10 px-2.5 py-1.5 text-xs text-white/85">
                {isTa
                  ? `${sender.label.split(" · ")[0]} நாளுக்கு ${sender.dailyLimit.toLocaleString("en-IN")} பேருக்கு அனுப்ப முடியும்; அனைவரையும் அடையும் வரை இந்த அனுப்புதல் ஒவ்வொரு நாளும் தானாகத் தொடரும்.`
                  : `${sender.label.split(" · ")[0]} can message ${sender.dailyLimit.toLocaleString("en-IN")} people a day, so this send continues automatically each day until everyone is reached.`}
              </p>
            )}
            {sender?.quality === "RED" && (
              <p className="mt-2 rounded-control bg-white/10 px-2.5 py-1.5 text-xs text-danger-on-dark">
                {isTa ? "இந்த எண்ணின் தரம் குறைவு. Meta மதிப்பீட்டை உயர்த்தும் வரை அனுப்புதல் நிறுத்தப்பட்டிருக்கும்." : "This number's quality is low. Sends stay paused until Meta rates it higher."}
              </p>
            )}
          </div>
          <ul className="space-y-3 p-5 text-sm">
            <li className="flex gap-3">
              <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {isTa ? `ஒரே நேரத்தில் ${c.batchSize || 0} வாடிக்கையாளர்கள்` : `${c.batchSize || 0} customers at a time`}
            </li>
            <li className="flex gap-3">
              <Gauge aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {isTa
                ? `பிறகு ${effectiveInterval(c.intervalMinutes || 0)} நிமிடம் காத்திருக்கும்`
                : `then waits ${effectiveInterval(c.intervalMinutes || 0)} minute${effectiveInterval(c.intervalMinutes || 0) === 1 ? "" : "s"}`}
            </li>
            <li className="flex gap-3">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="tabular">
                {c.sendTime} → {isTa ? "சுமார்" : "about"} {end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                {end.getDate() !== 1 && (isTa ? " (மறுநாள்)" : " (next day)")}
              </span>
            </li>
          </ul>
          {perWeek > 0 && sizeKnown && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              {isTa ? (
                <>வாரம் {perWeek} முறை ≈ வாரத்துக்கு <b className="text-ink">{(size * perWeek).toLocaleString("en-IN")}</b> செய்திகள்.</>
              ) : (
                <>{perWeek}× a week ≈ <b className="text-ink">{(size * perWeek).toLocaleString("en-IN")}</b> messages weekly.</>
              )}
            </p>
          )}
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            <p className="font-semibold text-ink">{tr("Schedule")}</p>
            <p className="mt-0.5">{describeScheduleSummary(c.scheduleType, c.daysOfWeek, c.sendTime, c.runDate, isTa)}</p>
          </div>
        </Card>

        <Card className="card-3d px-4 py-1">
          <CheckRow label="Campaign active" description="Paused campaigns keep their settings but don't send." checked={c.active} onChange={(e) => set({ active: e.target.checked })} />
        </Card>

        <div className="hidden lg:block">
          <Button className="w-full" loading={pending} onClick={save}>
            {id ? "Save changes" : "Create campaign"}
          </Button>
        </div>
        {id && <p className="text-center text-xs text-muted">{tr("Pacing changes also apply to a run that is already sending, from its next batch.")}</p>}
      </aside>
      <MobileActionBar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="tabular truncate text-sm font-semibold">{sizeKnown ? `${size.toLocaleString("en-IN")} ${tr(size === 1 ? "customer" : "customers")}` : tr("Counting…")}</p>
          <p className="truncate text-xs text-muted">
            {!sizeKnown
              ? isTa
                ? `${describeTags(pick, tagLabel)} குறிச்சொல்`
                : `Tagged ${describeTags(pick, tagLabel)}`
              : !size
                ? tr("No customers match yet")
                : isTa
                  ? `${batches} தொகுதி · ${days > 1 ? `சுமார் ${days} நாட்கள்` : `${formatMinutes(mins, true)}-ல் முடியும்`}`
                  : `${batches} batch${batches === 1 ? "" : "es"} · ${days > 1 ? `about ${days} days` : `done in ${formatMinutes(mins)}`}`}
          </p>
        </div>
        <Button className="!flex-none shrink-0 px-6" loading={pending} onClick={save}>
          {id ? "Save" : "Create"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
