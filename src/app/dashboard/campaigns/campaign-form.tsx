"use client";

import { Clock, Gauge, Users, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { MultiPicker } from "@/components/multi-picker";
import { Picker } from "@/components/picker";
import { toastResult } from "@/components/toast";
import { Button, Callout, Card, CardHeader, CheckRow, Field, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DAYS, effectiveInterval, estimateDuration, formatMinutes, SCHEDULER_TICK_MINUTES } from "@/lib/schedule";
import { AUDIENCE_PREFIX, decodeTags, describeTags, encodeTags, TAGS_PREFIX, type TagPick } from "@/lib/audience-tags";
import { countCampaignAudience, saveCampaign, type CampaignInput } from "../actions/campaigns";

type SendTo = "all" | "tags" | "saved";

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
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<CampaignInput>) => setC((s) => ({ ...s, ...patch }));

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
      const r = await saveCampaign(id, c);
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
        <Card>
          <CardHeader title="Message" />
          <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field id="cname" label="Campaign name" className="sm:col-span-2">
              <input className="field" placeholder="Weekly offers" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            {numbers.length > 1 && (
              <div className="sm:col-span-2">
                <label htmlFor="sender" className="mb-1.5 block text-sm font-medium text-ink-2">Send from</label>
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
                    ...numbers.map((n) => ({ value: n.id, label: n.label, hint: n.dailyLimit ? `Up to ${n.dailyLimit.toLocaleString("en-IN")} people a day` : "No daily limit" })),
                  ]}
                />
                <p className="mt-1.5 text-xs text-muted">Templates below are the ones approved for this number.</p>
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="tpl" className="mb-1.5 block text-sm font-medium text-ink-2">Template</label>
              <Picker
                id="tpl"
                title="Template"
                value={chosen ? c.templateId : ""}
                onChange={(templateId) => set({ templateId })}
                placeholder={usable.length ? "Choose a template…" : "No templates for this number yet"}
                options={usable.map((t) => ({
                  value: t.id,
                  label: t.name,
                  hint: `${t.category.charAt(0)}${t.category.slice(1).toLowerCase()}${t.status !== "APPROVED" ? " · not approved yet" : " · approved"}`,
                }))}
              />
              {chosen && chosen.status !== "APPROVED" && <p className="mt-1.5 text-xs text-warning">Sending waits until Meta approves this template.</p>}
            </div>
            <fieldset className="space-y-3 sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink-2">Send to</legend>
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
                    options={tagOptions.map((t) => ({ value: t.tag, label: t.label, hint: `${t.n.toLocaleString("en-IN")} customers` }))}
                  />
                  {pick.tags.length > 0 && (
                    <ul aria-label="Chosen tags" className="flex flex-wrap gap-1.5">
                      {pick.tags.map((tag) => (
                        <li key={tag}>
                          <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-soft py-0.5 pl-3 pr-1 text-sm font-medium text-brand-deep">
                            {tagLabel(tag)}
                            <button
                              type="button"
                              aria-label={`Remove ${tagLabel(tag)}`}
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
                      <span className="text-sm text-ink-2">Customers with</span>
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
                  options={savedOptions.map((t) => ({ value: t.tag, label: t.label.replace(/^★\s*/, ""), hint: `${t.n.toLocaleString("en-IN")} customers${t.hint ? ` · ${t.hint}` : ""}` }))}
                />
              )}

              <p className="tabular text-sm text-muted" aria-live="polite">
                {sendTo === "all"
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

        <Card>
          <CardHeader title="Schedule" description="Times are in India Standard Time." />
          <div className="space-y-5 p-4 sm:p-5">
            <Segmented
              label="How often"
              value={c.scheduleType}
              onChange={(scheduleType) => set({ scheduleType })}
              options={[
                { value: "WEEKLY", label: "Repeat weekly" },
                { value: "ONCE", label: "Send once" },
              ]}
              className="w-full sm:w-auto"
            />
            {c.scheduleType === "WEEKLY" ? (
              <fieldset>
                <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink-2">
                  Days <span className="text-xs font-normal text-muted">{c.daysOfWeek.length} per week</span>
                </legend>
                <div className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.daysOfWeek.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ daysOfWeek: on ? c.daysOfWeek.filter((x) => x !== i) : [...c.daysOfWeek, i] })}
                        className={cn(
                          "flex h-11 min-w-0 items-center justify-center rounded-control border px-0.5 text-xs font-medium transition active:scale-95 sm:w-12 sm:flex-none",
                          on ? "border-brand bg-brand text-white" : "border-line-strong/50 bg-panel text-ink-2 hover:border-line-strong",
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <Field id="date" label="Date" className="max-w-xs">
                <input type="date" className="field" value={c.runDate} onChange={(e) => set({ runDate: e.target.value })} />
              </Field>
            )}
            <Field id="time" label="Start time" className="max-w-xs">
              <input type="time" className="field" value={c.sendTime} onChange={(e) => set({ sendTime: e.target.value })} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pacing" description="Send in small batches so your number keeps a good quality rating with Meta." />
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
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className={on ? "text-brand-deep" : "text-muted"}>
                      {p.batch} every {p.interval} min
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
                Batches go out at most once every {SCHEDULER_TICK_MINUTES} minutes, so {c.intervalMinutes} min works as {SCHEDULER_TICK_MINUTES}. For a faster pace, raise the batch size instead.
              </Callout>
            )}
          </div>
        </Card>
      </div>

      <aside aria-label="Summary" className="min-w-0 space-y-4 lg:sticky lg:top-8">
        <Card className="overflow-hidden">
          <div className="surface-dark bg-night p-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Each send</p>
            <p className="tabular mt-2 text-3xl font-semibold">
              {sizeKnown ? size.toLocaleString("en-IN") : "…"} <span className="text-base font-normal text-white/75">customers</span>
            </p>
            <p className="mt-1 text-sm text-white/80">
              {!sizeKnown ? "Counting customers…" : !size ? "No customers match yet" : <>{batches} batch{batches === 1 ? "" : "es"} · done in {days > 1 ? `about ${days} days` : formatMinutes(mins)}</>}
            </p>
            {days > 1 && sender?.dailyLimit && (
              <p className="mt-2 rounded-control bg-white/10 px-2.5 py-1.5 text-xs text-white/85">
                {sender.label.split(" · ")[0]} can message {sender.dailyLimit.toLocaleString("en-IN")} people a day, so this send continues automatically each day until everyone is reached.
              </p>
            )}
            {sender?.quality === "RED" && (
              <p className="mt-2 rounded-control bg-white/10 px-2.5 py-1.5 text-xs text-danger-on-dark">This number&apos;s quality is low. Sends stay paused until Meta rates it higher.</p>
            )}
          </div>
          <ul className="space-y-3 p-5 text-sm">
            <li className="flex gap-3">
              <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {c.batchSize || 0} customers at a time
            </li>
            <li className="flex gap-3">
              <Gauge aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              then waits {effectiveInterval(c.intervalMinutes || 0)} minute{effectiveInterval(c.intervalMinutes || 0) === 1 ? "" : "s"}
            </li>
            <li className="flex gap-3">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="tabular">
                {c.sendTime} → about {end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
                {end.getDate() !== 1 && " (next day)"}
              </span>
            </li>
          </ul>
          {perWeek > 0 && sizeKnown && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              {perWeek}× a week ≈ <b className="text-ink">{(size * perWeek).toLocaleString("en-IN")}</b> messages weekly.
            </p>
          )}
        </Card>

        <Card className="px-4 py-1">
          <CheckRow label="Campaign active" description="Paused campaigns keep their settings but don't send." checked={c.active} onChange={(e) => set({ active: e.target.checked })} />
        </Card>

        <div className="hidden lg:block">
          <Button className="w-full" loading={pending} onClick={save}>
            {id ? "Save changes" : "Create campaign"}
          </Button>
        </div>
        {id && <p className="text-center text-xs text-muted">Pacing changes also apply to a run that is already sending, from its next batch.</p>}
      </aside>
      <MobileActionBar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="tabular truncate text-sm font-semibold">{sizeKnown ? `${size.toLocaleString("en-IN")} customers` : "Counting…"}</p>
          <p className="truncate text-xs text-muted">
            {!sizeKnown ? `Tagged ${describeTags(pick, tagLabel)}` : !size ? "No customers match yet" : `${batches} batch${batches === 1 ? "" : "es"} · ${days > 1 ? `about ${days} days` : `done in ${formatMinutes(mins)}`}`}
          </p>
        </div>
        <Button className="!flex-none shrink-0 px-6" loading={pending} onClick={save}>
          {id ? "Save" : "Create"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
