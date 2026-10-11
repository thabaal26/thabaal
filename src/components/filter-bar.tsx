"use client";

import { CalendarDays, Megaphone, MapPin, Package, SlidersHorizontal, Tags, User, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { activeCount, ALL_SECTIONS, filterQuery, PRESETS, withQuery, type FilterSection, type FilterState, type RangeKey } from "@/lib/filters";
import type { FilterOptions } from "@/lib/filter-scope";
import { MultiPicker } from "./multi-picker";
import { Picker } from "./picker";
import { Sheet } from "./sheet";
import { Button } from "./ui";

type Section = FilterSection;
const ALL = ALL_SECTIONS;

const todayStr = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/**
 * The portal's filter control: the period (presets or any from–to dates) and who/what to look at
 * (products, single customers, customer groups, area, campaign). Opens one panel; applying updates
 * the URL so the page re-renders with the new figures. Active filters show as removable chips.
 */
export function FilterBar({
  value,
  options,
  basePath,
  extra = {},
  defaultRange = "7d",
  sections = ALL,
  periodLabel,
  compact,
  className,
  note,
}: {
  value: FilterState;
  options: FilterOptions;
  basePath: string;
  /** Page params kept when filters change (view, show, q…). */
  extra?: Record<string, string | undefined>;
  defaultRange?: RangeKey;
  sections?: Section[];
  /** What the period button says, e.g. "Last 7 days" or "3 – 9 Oct". */
  periodLabel: string;
  /** Pill buttons sized for the dashboard's floating bar. */
  compact?: boolean;
  className?: string;
  /** What these filters change on this page, shown at the top of the panel. */
  note?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(value);
  const [pending, start] = useTransition();
  const has = (s: Section) => sections.includes(s);
  const count = activeCount(value);

  const go = (f: FilterState) => {
    document.documentElement.style.setProperty("--view-dx", "0px");
    start(() => router.push(withQuery(basePath, filterQuery(f, extra, defaultRange)), { scroll: false }));
  };
  const openPanel = () => {
    setDraft(value);
    setOpen(true);
  };
  const apply = () => {
    setOpen(false);
    go(draft);
  };
  const set = (p: Partial<FilterState>) => setDraft((d) => ({ ...d, ...p }));

  const btn = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition",
    compact ? "min-h-9 bg-sunken px-3 text-xs text-ink hover:bg-line/60" : "min-h-10 border border-line bg-panel px-3.5 text-sm text-ink-2 shadow-xs hover:border-line-2 hover:text-ink",
    pending && "opacity-60",
  );

  return (
    <>
      <div className={cn("flex items-center gap-1.5", className)}>
        {has("period") && (
          <button type="button" onClick={openPanel} className={btn} aria-label={`Period: ${periodLabel}. Change`}>
            <CalendarDays aria-hidden className="size-3.5 text-brand" />
            <span className={cn("max-w-[9rem] truncate", compact && "max-sm:sr-only")}>{periodLabel}</span>
          </button>
        )}
        <button type="button" onClick={openPanel} className={btn} aria-label={`Filters${count ? `, ${count} on` : ""}`}>
          <SlidersHorizontal aria-hidden className="size-3.5" />
          <span className={cn(compact && "max-sm:sr-only")}>Filter</span>
          {count > 0 && <span className="tabular grid min-w-5 place-items-center rounded-full bg-brand px-1 text-2xs font-bold text-white">{count}</span>}
        </button>
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter"
        description={`${note ?? "Pick a period and narrow to products, customers, groups or an area."} Within one filter any match counts; different filters must all match.`}
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setDraft({ ...value, range: defaultRange, from: "", to: "", products: [], customers: [], tags: [], area: "", campaign: "" })}
            >
              Clear all
            </Button>
            <Button onClick={apply} loading={pending}>
              Show results
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {has("period") && (
            <section aria-labelledby="f-period">
              <h3 id="f-period" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarDays aria-hidden className="size-4 text-brand" /> Period
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => set({ range: p.key, from: "", to: "" })}
                    aria-pressed={draft.range === p.key}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs font-semibold transition",
                      draft.range === p.key ? "border-brand bg-brand text-white" : "border-line bg-panel text-ink-2 hover:border-line-2",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="text-xs font-medium text-muted">
                  From
                  <input
                    type="date"
                    max={todayStr()}
                    value={draft.from}
                    onChange={(e) => set({ range: "custom", from: e.target.value, to: draft.to || e.target.value })}
                    className="mt-1 block min-h-10 w-full rounded-control border border-line-strong bg-panel px-3 text-sm text-ink"
                  />
                </label>
                <label className="text-xs font-medium text-muted">
                  To
                  <input
                    type="date"
                    max={todayStr()}
                    min={draft.from || undefined}
                    value={draft.to}
                    onChange={(e) => set({ range: "custom", to: e.target.value, from: draft.from || e.target.value })}
                    className="mt-1 block min-h-10 w-full rounded-control border border-line-strong bg-panel px-3 text-sm text-ink"
                  />
                </label>
              </div>
            </section>
          )}

          {has("products") && options.products.length > 0 && (
            <Field icon={<Package className="size-4 text-gold-deep" />} label="Products" hint="Only these products: sales, carts and the people who bought them">
              <MultiPicker title="Products" options={options.products} value={draft.products} onChange={(v) => set({ products: v })} placeholder="All products" />
            </Field>
          )}
          {has("customers") && (
            <Field icon={<User className="size-4 text-info" />} label="Customers" hint="One or a few people: everything about just them">
              <MultiPicker title="Customers" options={options.customers} value={draft.customers} onChange={(v) => set({ customers: v })} placeholder="All customers" />
            </Field>
          )}
          {has("tags") && options.tags.length > 0 && (
            <Field icon={<Tags className="size-4 text-accent" />} label="Customer groups" hint="Tags from the sheets and your own groups">
              <MultiPicker title="Customer groups" options={options.tags} value={draft.tags} onChange={(v) => set({ tags: v })} placeholder="All groups" />
            </Field>
          )}
          {has("area") && options.areas.length > 1 && (
            <Field icon={<MapPin className="size-4 text-brand" />} label="Area">
              <Picker title="Area" options={[{ value: "", label: "Any area" }, ...options.areas]} value={draft.area} onChange={(v) => set({ area: v })} placeholder="Any area" />
            </Field>
          )}
          {has("campaign") && options.campaigns.length > 0 && (
            <Field icon={<Megaphone className="size-4 text-danger" />} label="Campaign" hint="Only the people this campaign messaged">
              <Picker title="Campaign" options={[{ value: "", label: "Any campaign" }, ...options.campaigns]} value={draft.campaign} onChange={(v) => set({ campaign: v })} placeholder="Any campaign" />
            </Field>
          )}
        </div>
      </Sheet>
    </>
  );
}

function Field({ icon, label, hint, children }: { icon: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden>{icon}</span>
        {label}
      </h3>
      {hint && <p className="mb-2 mt-0.5 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** The filters that are on, as chips; tap × to drop one. */
export function ActiveFilters({
  value,
  options,
  basePath,
  extra = {},
  defaultRange = "7d",
  className,
}: {
  value: FilterState;
  options: FilterOptions;
  basePath: string;
  extra?: Record<string, string | undefined>;
  defaultRange?: RangeKey;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const name = (list: { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;
  const go = (f: FilterState) => start(() => router.push(withQuery(basePath, filterQuery(f, extra, defaultRange)), { scroll: false }));
  const chips: { key: string; icon: ReactNode; text: string; drop: () => FilterState }[] = [
    ...value.products.map((p) => ({ key: `p:${p}`, icon: <Package className="size-3" />, text: p, drop: () => ({ ...value, products: value.products.filter((x) => x !== p) }) })),
    ...value.customers.map((c) => ({ key: `c:${c}`, icon: <User className="size-3" />, text: name(options.customers, c), drop: () => ({ ...value, customers: value.customers.filter((x) => x !== c) }) })),
    ...value.tags.map((t) => ({ key: `t:${t}`, icon: <Tags className="size-3" />, text: name(options.tags, t), drop: () => ({ ...value, tags: value.tags.filter((x) => x !== t) }) })),
    ...(value.area ? [{ key: "area", icon: <MapPin className="size-3" />, text: name(options.areas, value.area), drop: () => ({ ...value, area: "" }) }] : []),
    ...(value.campaign ? [{ key: "camp", icon: <Megaphone className="size-3" />, text: name(options.campaigns, value.campaign), drop: () => ({ ...value, campaign: "" }) }] : []),
  ];
  if (!chips.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", pending && "opacity-60", className)}>
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => go(c.drop())}
          className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-deep transition hover:border-brand/60"
          aria-label={`Remove filter ${c.text}`}
        >
          <span aria-hidden>{c.icon}</span>
          <span className="truncate">{c.text}</span>
          <X aria-hidden className="size-3" />
        </button>
      ))}
      <button
        type="button"
        onClick={() => go({ ...value, products: [], customers: [], tags: [], area: "", campaign: "" })}
        className="px-1.5 text-xs font-semibold text-muted hover:text-ink"
      >
        Clear
      </button>
    </div>
  );
}
