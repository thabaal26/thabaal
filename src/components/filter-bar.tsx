"use client";

import { CalendarDays, Check, ChevronDown, MapPin, Package, Search, SlidersHorizontal, User, X } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ALL_SECTIONS, filterQuery, PRESETS, withQuery, type FilterSection, type FilterState, type RangeKey } from "@/lib/filters";
import type { FilterOptions } from "@/lib/filter-scope";
import { Sheet } from "./sheet";
import { Button } from "./ui";

type Section = FilterSection;
const ALL = ALL_SECTIONS;

const todayStr = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/**
 * Simplified, high-clarity filter control:
 * - Period (quick presets or custom From–To dates)
 * - Catalogue Products (inline multi-select, no nested sheet)
 * - Delivery Area (inline single-select pills/list, no nested sheet)
 * Unwanted/confusing filters (single customers, raw sheet tags, campaign recipients) are removed.
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
  /** Pill buttons sized for compact toolbars. */
  compact?: boolean;
  className?: string;
  /** What these filters change on this page, shown at the top of the panel. */
  note?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(value);
  const [prodQuery, setProdQuery] = useState("");
  const [areaQuery, setAreaQuery] = useState("");
  const [pending, start] = useTransition();

  const has = (s: Section) => sections.includes(s);
  const hasProducts = has("products") && options.products.length > 0;
  const hasArea = has("area") && options.areas.length > 1;
  const periodOnly = !hasProducts && !hasArea;
  const count = (hasProducts ? value.products.length : 0) + (hasArea && value.area ? 1 : 0);

  const go = (f: FilterState) => {
    document.documentElement.style.setProperty("--view-dx", "0px");
    start(() => router.push(withQuery(basePath, filterQuery(f, extra, defaultRange)), { scroll: false }));
  };

  const openPanel = () => {
    setDraft(value);
    setProdQuery("");
    setAreaQuery("");
    setOpen(true);
  };

  const apply = () => {
    setOpen(false);
    go(draft);
  };

  const clearAll = () => {
    const cleared: FilterState = {
      ...value,
      range: defaultRange,
      from: "",
      to: "",
      products: [],
      customers: [],
      tags: [],
      area: "",
      campaign: "",
    };
    setDraft(cleared);
    setOpen(false);
    go(cleared);
  };

  const set = (p: Partial<FilterState>) => setDraft((d) => ({ ...d, ...p }));

  const toggleProduct = (prodName: string) => {
    setDraft((d) => ({
      ...d,
      products: d.products.includes(prodName)
        ? d.products.filter((x) => x !== prodName)
        : [...d.products, prodName],
    }));
  };

  const filteredProducts = useMemo(() => {
    const q = prodQuery.trim().toLowerCase();
    return q
      ? options.products.filter((p) => `${p.label} ${p.hint ?? ""}`.toLowerCase().includes(q))
      : options.products;
  }, [options.products, prodQuery]);

  const filteredAreas = useMemo(() => {
    const q = areaQuery.trim().toLowerCase();
    return q
      ? options.areas.filter((a) => `${a.label} ${a.hint ?? ""}`.toLowerCase().includes(q))
      : options.areas;
  }, [options.areas, areaQuery]);

  const btn = cn(
    "inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition",
    compact
      ? "min-h-8 bg-sunken px-2.5 text-xs text-ink hover:bg-line/60 sm:min-h-9 sm:px-3"
      : "min-h-9 border border-line bg-panel px-3 text-xs text-ink-2 shadow-xs hover:border-line-2 hover:text-ink sm:min-h-10 sm:px-3.5 sm:text-sm",
    pending && "opacity-60",
  );

  return (
    <>
      <div className={cn("flex items-center gap-1.5", className)}>
        {has("period") && (
          <button type="button" onClick={openPanel} className={btn} aria-label={`Period: ${periodLabel}. Change`}>
            <CalendarDays aria-hidden className="size-3.5 shrink-0 text-brand" />
            <span className="max-w-[9rem] truncate">{periodLabel}</span>
            {periodOnly && <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted" />}
          </button>
        )}
        {!periodOnly && (
          <button
            type="button"
            onClick={openPanel}
            className={cn(btn, count > 0 && "border-brand/40 bg-brand-soft/60 text-brand-deep")}
            aria-label={`Filters${count ? `, ${count} active` : ""}`}
          >
            <SlidersHorizontal aria-hidden className="size-3.5 shrink-0" />
            <span>Filter</span>
            {count > 0 && (
              <span className="tabular grid min-w-4.5 place-items-center rounded-full bg-brand px-1 text-2xs font-bold text-on-brand sm:min-w-5">
                {count}
              </span>
            )}
          </button>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={periodOnly ? "Date period" : "Filter"}
        description={
          note ??
          (periodOnly
            ? "Choose a preset period or pick exact From and To dates."
            : "Choose a date period and narrow results by product or delivery area.")
        }
        footer={
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={clearAll}>
              Reset to default
            </Button>
            <Button onClick={apply} loading={pending}>
              {periodOnly ? "Apply dates" : "Show results"}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {has("period") && (
            <section aria-labelledby="f-period">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="f-period" className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <CalendarDays aria-hidden className="size-4 text-brand" /> Date period
                </h3>
                {periodOnly && <span className="text-[11px] text-muted">Tap a preset to apply</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => {
                  const isSelected = draft.range === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        const next = { ...draft, range: p.key, from: "", to: "" };
                        setDraft(next);
                        if (periodOnly) {
                          setOpen(false);
                          go(next);
                        }
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        "min-h-8 rounded-full border px-3 text-xs font-semibold transition sm:min-h-9",
                        isSelected
                          ? "border-brand bg-brand text-on-brand shadow-2xs"
                          : "border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <label className="text-xs font-medium text-muted">
                  From date
                  <input
                    type="date"
                    max={todayStr()}
                    value={draft.from}
                    onChange={(e) => set({ range: "custom", from: e.target.value, to: draft.to || e.target.value })}
                    className="mt-1 block min-h-9 w-full rounded-control border border-line-strong bg-panel px-2.5 text-xs text-ink sm:min-h-10 sm:px-3 sm:text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-muted">
                  To date
                  <input
                    type="date"
                    max={todayStr()}
                    min={draft.from || undefined}
                    value={draft.to}
                    onChange={(e) => set({ range: "custom", to: e.target.value, from: draft.from || e.target.value })}
                    className="mt-1 block min-h-9 w-full rounded-control border border-line-strong bg-panel px-2.5 text-xs text-ink sm:min-h-10 sm:px-3 sm:text-sm"
                  />
                </label>
              </div>
            </section>
          )}

          {hasArea && (
            <section aria-labelledby="f-area" className="border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="f-area" className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <MapPin aria-hidden className="size-4 text-brand" /> Delivery area
                </h3>
                {draft.area && (
                  <button
                    type="button"
                    onClick={() => set({ area: "" })}
                    className="text-xs font-semibold text-brand-deep hover:underline"
                  >
                    Clear area
                  </button>
                )}
              </div>
              {options.areas.length > 8 && (
                <div className="relative mb-2">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={areaQuery}
                    onChange={(e) => setAreaQuery(e.target.value)}
                    placeholder="Search area or locality…"
                    className="field min-h-9 pl-8 text-xs"
                  />
                </div>
              )}
              <div className="max-h-44 overflow-y-auto rounded-control border border-line bg-canvas/50 p-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {!areaQuery.trim() && (
                    <button
                      type="button"
                      onClick={() => set({ area: "" })}
                      className={cn(
                        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                        !draft.area
                          ? "border-brand bg-brand text-on-brand"
                          : "border-line bg-panel text-ink-2 hover:border-line-2",
                      )}
                    >
                      All areas
                    </button>
                  )}
                  {filteredAreas.map((a) => {
                    const active = draft.area === a.value;
                    return (
                      <button
                        key={a.value}
                        type="button"
                        onClick={() => set({ area: active ? "" : a.value })}
                        className={cn(
                          "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                          active
                            ? "border-brand bg-brand text-on-brand"
                            : "border-line bg-panel text-ink-2 hover:border-line-2 hover:text-ink",
                        )}
                      >
                        <span className="truncate">{a.label}</span>
                        {a.hint && (
                          <span className={cn("text-[10px]", active ? "text-white/80" : "text-muted")}>
                            ({a.hint.replace(/ customers.*/, "")})
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {!filteredAreas.length && (
                    <p className="w-full py-3 text-center text-xs text-muted">No matching area</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {hasProducts && (
            <section aria-labelledby="f-products" className="border-t border-line pt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h3 id="f-products" className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Package aria-hidden className="size-4 text-gold-deep" /> Catalogue products
                </h3>
                {draft.products.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set({ products: [] })}
                    className="text-xs font-semibold text-brand-deep hover:underline"
                  >
                    {draft.products.length} selected · Clear
                  </button>
                )}
              </div>
              <p className="mb-2 text-xs text-muted">
                Filter to specific catalogue items ({options.products.length} available)
              </p>
              {options.products.length > 6 && (
                <div className="relative mb-2">
                  <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    type="search"
                    value={prodQuery}
                    onChange={(e) => setProdQuery(e.target.value)}
                    placeholder="Search catalogue product…"
                    className="field min-h-9 pl-8 text-xs"
                  />
                </div>
              )}
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-control border border-line bg-canvas/50 p-1.5">
                {filteredProducts.map((p) => {
                  const active = draft.products.includes(p.value);
                  return (
                    <li key={p.value}>
                      <button
                        type="button"
                        onClick={() => toggleProduct(p.value)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition",
                          active
                            ? "bg-brand-soft font-semibold text-brand-deep"
                            : "text-ink hover:bg-panel",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "grid size-4 shrink-0 place-items-center rounded border transition",
                            active ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-panel",
                          )}
                        >
                          {active && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{p.label}</span>
                        {p.hint && (
                          <span className={cn("shrink-0 text-[11px]", active ? "text-brand-deep/80" : "text-muted")}>
                            {p.hint}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {!filteredProducts.length && (
                  <li className="py-4 text-center text-xs text-muted">No matching product</li>
                )}
              </ul>
            </section>
          )}
        </div>
      </Sheet>
    </>
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
    ...value.customers.map((c) => ({
      key: `c:${c}`,
      icon: <User className="size-3" />,
      text: name(options.customers, c),
      drop: () => ({ ...value, customers: value.customers.filter((x) => x !== c) }),
    })),
    ...value.products.map((p) => ({
      key: `p:${p}`,
      icon: <Package className="size-3" />,
      text: p,
      drop: () => ({ ...value, products: value.products.filter((x) => x !== p) }),
    })),
    ...(value.area
      ? [
          {
            key: "area",
            icon: <MapPin className="size-3" />,
            text: name(options.areas, value.area),
            drop: () => ({ ...value, area: "" }),
          },
        ]
      : []),
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
        Clear all
      </button>
    </div>
  );
}
