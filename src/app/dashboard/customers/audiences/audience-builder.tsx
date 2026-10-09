"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Field, Spinner } from "@/components/ui";
import type { AudienceFilter } from "@/lib/audiences";
import { countAudience, saveAudience } from "../../actions/audiences";

const split = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
const PRESETS: { label: string; name: string; f: AudienceFilter }[] = [
  { label: "Lapsed buyers", name: "Lapsed buyers", f: { noOrderForDays: 60 } },
  { label: "Recent buyers", name: "Bought in last 30 days", f: { orderedWithinDays: 30 } },
  { label: "Never ordered", name: "Never ordered", f: { neverOrdered: true } },
  { label: "Ghee buyers", name: "Ghee buyers", f: { bought: "ghee" } },
];

/** Build a filter, see how many customers it reaches, save it for campaigns. */
export function AudienceBuilder({ regions }: { regions: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [exclude, setExclude] = useState("");
  const [region, setRegion] = useState("");
  const [area, setArea] = useState("");
  const [bought, setBought] = useState("");
  const [orders, setOrders] = useState<"" | "within" | "none-for" | "never">("");
  const [days, setDays] = useState(30);
  const [count, setCount] = useState<number | null>(null);

  const filter: AudienceFilter = {
    tags: split(tags),
    excludeTags: split(exclude),
    region,
    area,
    bought,
    ...(orders === "within" && { orderedWithinDays: days }),
    ...(orders === "none-for" && { noOrderForDays: days }),
    ...(orders === "never" && { neverOrdered: true }),
  };
  const key = JSON.stringify(filter);

  // Live count, a moment after typing stops.
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await countAudience(JSON.parse(key));
      setCount(r.ok ? r.n : null);
    }, 400);
    return () => clearTimeout(t);
  }, [key]);

  const preset = (p: (typeof PRESETS)[number]) => {
    setName(p.name);
    setTags("");
    setExclude("");
    setRegion("");
    setArea("");
    setBought(p.f.bought ?? "");
    setOrders(p.f.orderedWithinDays ? "within" : p.f.noOrderForDays ? "none-for" : p.f.neverOrdered ? "never" : "");
    setDays(p.f.orderedWithinDays ?? p.f.noOrderForDays ?? 30);
  };

  return (
    <Card>
      <CardHeader title="New audience" description="Customers must match every condition. Opted-out and unreachable customers are always left out." />
      <form
        className="space-y-4 p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await saveAudience(name, filter);
            toastResult(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Start from a preset">
          <span className="text-sm text-muted">Start from:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => preset(p)}
              className="inline-flex min-h-11 items-center rounded-full border border-line-strong/50 bg-panel px-3.5 text-sm font-medium text-ink transition hover:bg-canvas active:bg-sunken sm:min-h-8 sm:px-3"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="a-tags" label="Has tags" hint="comma-separated">
            <input className="field" value={tags} placeholder="ghee, vip" onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field id="a-ex" label="Without tags" hint="comma-separated">
            <input className="field" value={exclude} placeholder="test" onChange={(e) => setExclude(e.target.value)} />
          </Field>
          <Field id="a-region" label="Region">
            <select className="field" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Any</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field id="a-area" label="Area contains">
            <input className="field" value={area} placeholder="Sellur" onChange={(e) => setArea(e.target.value)} />
          </Field>
          <Field id="a-bought" label="Bought">
            <input className="field" value={bought} placeholder="ghee, groundnut, coconut…" onChange={(e) => setBought(e.target.value)} />
          </Field>
          <div>
            <label htmlFor="a-orders" className="mb-1.5 block text-sm font-medium text-ink-2">Orders</label>
            <div className="flex gap-2">
              <select id="a-orders" className="field" value={orders} onChange={(e) => setOrders(e.target.value as typeof orders)}>
                <option value="">Any</option>
                <option value="within">Ordered in the last… days</option>
                <option value="none-for">No order for… days</option>
                <option value="never">Never ordered</option>
              </select>
              {(orders === "within" || orders === "none-for") && (
                <input type="number" min={1} max={3650} inputMode="numeric" className="field w-24 shrink-0 tabular" value={days || ""} aria-label="Days" onChange={(e) => setDays(Number(e.target.value))} />
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-card bg-sunken p-3 sm:flex-row sm:items-end">
          <Field id="a-name" label="Audience name" required className="flex-1">
            <input className="field" value={name} placeholder="Ghee buyers in Madurai" onChange={(e) => setName(e.target.value)} />
          </Field>
          <p className="tabular flex min-h-10 items-center gap-1 text-sm sm:pb-0" aria-live="polite">
            {count === null ? <Spinner className="text-muted" /> : <b className="text-ink">{count.toLocaleString("en-IN")}</b>} customers now
          </p>
          <Button type="submit" loading={pending}>Save audience</Button>
        </div>
      </form>
    </Card>
  );
}
