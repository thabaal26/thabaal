"use client";

import { Clock, Gauge, Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { DAYS, estimateDuration, formatMinutes } from "@/lib/schedule";
import { saveCampaign, type CampaignInput } from "../actions/campaigns";

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
  audience: { all: number; tags: { tag: string; n: number }[] };
  numbers: { id: string; label: string; businessAccountId: string; isDefault: boolean; dailyLimit: number | null; quality: string | null }[];
}) {
  const [c, setC] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (patch: Partial<CampaignInput>) => setC((s) => ({ ...s, ...patch }));

  const size = c.audienceTag ? (audience.tags.find((t) => t.tag === c.audienceTag)?.n ?? 0) : audience.all;
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
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Message" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cname">Campaign name</Label>
              <input id="cname" className="field" placeholder="Weekly offers" value={c.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            {numbers.length > 1 && (
              <div className="sm:col-span-2">
                <Label htmlFor="sender" hint="templates below are the ones approved for this number">Send from</Label>
                <select
                  id="sender"
                  className="field"
                  value={c.senderId}
                  onChange={(e) => {
                    const next = numbers.find((n) => n.id === e.target.value) ?? numbers[0];
                    const keep = templates.find((t) => t.id === c.templateId && (!t.businessAccountId || t.businessAccountId === next.businessAccountId));
                    set({ senderId: e.target.value, templateId: keep ? c.templateId : "" });
                  }}
                >
                  <option value="">Default number ({numbers.find((n) => n.isDefault)?.label ?? numbers[0].label})</option>
                  {numbers.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="tpl">Template</Label>
              <select id="tpl" className="field" value={chosen ? c.templateId : ""} onChange={(e) => set({ templateId: e.target.value })}>
                <option value="">{usable.length ? "Choose a template…" : "No templates for this number yet"}</option>
                {usable.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.category.toLowerCase()}{t.status !== "APPROVED" ? " (not approved yet)" : ""}
                  </option>
                ))}
              </select>
              {chosen && chosen.status !== "APPROVED" && (
                <p className="mt-1.5 text-xs text-amber-700">Sending waits until Meta approves this template.</p>
              )}
            </div>
            <div>
              <Label htmlFor="aud">Send to</Label>
              <select id="aud" className="field" value={c.audienceTag} onChange={(e) => set({ audienceTag: e.target.value })}>
                <option value="">All customers ({audience.all})</option>
                {audience.tags.map((t) => (
                  <option key={t.tag} value={t.tag}>Tag: {t.tag} ({t.n})</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Schedule" description="Times are in India Standard Time." />
          <div className="space-y-5 p-5">
            <div className="inline-flex rounded-lg bg-canvas p-1">
              {(["WEEKLY", "ONCE"] as const).map((s) => (
                <button key={s} type="button" onClick={() => set({ scheduleType: s })} className={cn("rounded-md px-4 py-2.5 text-sm font-medium transition sm:py-1.5 sm:text-xs", c.scheduleType === s ? "bg-white shadow-sm" : "text-muted")}>
                  {s === "WEEKLY" ? "Repeat weekly" : "Send once"}
                </button>
              ))}
            </div>
            {c.scheduleType === "WEEKLY" ? (
              <div>
                <Label hint={`${c.daysOfWeek.length} per week`}>Days</Label>
                <div className="flex gap-1.5 sm:flex-wrap sm:gap-2">
                  {DAYS.map((d, i) => {
                    const on = c.daysOfWeek.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set({ daysOfWeek: on ? c.daysOfWeek.filter((x) => x !== i) : [...c.daysOfWeek, i] })}
                        className={cn("h-11 min-w-0 flex-1 rounded-xl border text-xs font-medium transition active:scale-95 sm:flex-none sm:w-11", on ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-2 hover:border-ink/30")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="max-w-xs">
                <Label htmlFor="date">Date</Label>
                <input id="date" type="date" className="field" value={c.runDate} onChange={(e) => set({ runDate: e.target.value })} />
              </div>
            )}
            <div className="max-w-xs">
              <Label htmlFor="time">Start time</Label>
              <input id="time" type="time" className="field" value={c.sendTime} onChange={(e) => set({ sendTime: e.target.value })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pacing" description="Send in small batches so your number keeps a good quality rating with Meta." />
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({ batchSize: p.batch, intervalMinutes: p.interval })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-xs transition",
                    c.batchSize === p.batch && c.intervalMinutes === p.interval ? "border-brand bg-brand-soft/60" : "border-line hover:border-ink/30",
                  )}
                >
                  <span className="block font-medium">{p.label}</span>
                  <span className="text-muted">{p.batch} every {p.interval} min</span>
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="batch" hint="1–1,000">Customers per batch</Label>
                <input id="batch" type="number" inputMode="numeric" min={1} max={1000} className="field tabular" value={c.batchSize || ""} onChange={(e) => set({ batchSize: Number(e.target.value) })} />
              </div>
              <div>
                <Label htmlFor="interval" hint="minutes">Wait between batches</Label>
                <input id="interval" type="number" inputMode="numeric" min={1} max={1440} className="field tabular" value={c.intervalMinutes || ""} onChange={(e) => set({ intervalMinutes: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="bg-night p-5 text-white">
            <p className="text-xs uppercase tracking-wider text-white/50">Each send</p>
            <p className="tabular mt-2 text-3xl font-semibold">{size.toLocaleString("en-IN")} <span className="text-base font-normal text-white/60">customers</span></p>
            <p className="mt-1 text-sm text-white/70">
              {batches} batch{batches === 1 ? "" : "es"} · done in {days > 1 ? `about ${days} days` : formatMinutes(mins)}
            </p>
            {days > 1 && sender?.dailyLimit && (
              <p className="mt-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white/80">
                {sender.label.split(" · ")[0]} can message {sender.dailyLimit.toLocaleString("en-IN")} people a day, so this send continues automatically each day until everyone is reached.
              </p>
            )}
            {sender?.quality === "RED" && (
              <p className="mt-2 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs text-rose-100">This number&apos;s quality is low. Sends stay paused until Meta rates it higher.</p>
            )}
          </div>
          <ul className="space-y-3 p-5 text-sm">
            <li className="flex gap-3"><Users className="mt-0.5 size-4 text-muted" />{c.batchSize || 0} customers at a time</li>
            <li className="flex gap-3"><Gauge className="mt-0.5 size-4 text-muted" />then waits {c.intervalMinutes || 0} minute{c.intervalMinutes === 1 ? "" : "s"}</li>
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-4 text-muted" />
              {c.sendTime} → about {end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
              {end.getDate() !== 1 && " (next day)"}
            </li>
          </ul>
          {perWeek > 0 && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              {perWeek}× a week ≈ <b className="text-ink">{(size * perWeek).toLocaleString("en-IN")}</b> messages weekly.
            </p>
          )}
        </Card>

        <label className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm">
          Campaign active
          <input type="checkbox" className="size-5 accent-brand sm:size-4" checked={c.active} onChange={(e) => set({ active: e.target.checked })} />
        </label>

        <div className="hidden lg:block">
          <Button className="w-full" disabled={pending} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : id ? "Save changes" : "Create campaign"}
          </Button>
        </div>
        {id && <p className="text-center text-xs text-muted">Pacing changes also apply to a run that is already sending, from its next batch.</p>}
      </div>
      <MobileActionBar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="tabular truncate text-sm font-semibold">{size.toLocaleString("en-IN")} customers</p>
          <p className="truncate text-xs text-muted">{batches} batch{batches === 1 ? "" : "es"} · {days > 1 ? `about ${days} days` : `done in ${formatMinutes(mins)}`}</p>
        </div>
        <Button className="shrink-0 px-6" disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : id ? "Save" : "Create"}
        </Button>
      </MobileActionBar>
    </div>
  );
}
