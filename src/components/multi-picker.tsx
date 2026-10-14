"use client";

import { Check, ChevronDown, Search } from "@/components/icons";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";
import { Button } from "./ui";
import type { PickerOption } from "./picker";

/**
 * Pick several options: a field-styled button that opens a sheet of checkable rows (with search
 * for long lists). Changes apply as they're ticked; "Done" just closes.
 */
export function MultiPicker({
  options,
  value,
  onChange,
  title,
  id,
  placeholder = "Choose…",
  className,
}: {
  options: PickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  title: string;
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);
  const picked = options.filter((o) => value.includes(o.value));
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <button type="button" id={id} aria-haspopup="dialog" onClick={() => setOpen(true)} className={cn("field flex items-center justify-between gap-2 text-left", className)}>
        <span className={cn("min-w-0 truncate", !picked.length && "text-muted")}>
          {picked.length ? (picked.length === 1 ? picked[0].label : `${picked.length} selected`) : placeholder}
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted" />
      </button>
      <Sheet
        open={open}
        onClose={close}
        title={title}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="flex-1 sm:flex-none" disabled={!value.length} onClick={() => onChange([])}>
              Clear
            </Button>
            <Button className="flex-[2] sm:ml-auto sm:flex-none" onClick={close}>
              Done{value.length ? ` (${value.length})` : ""}
            </Button>
          </div>
        }
      >
        {options.length > 8 && (
          <div className="relative mb-3">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label={`Search ${title.toLowerCase()}`} className="field pl-10" />
          </div>
        )}
        <ul aria-label={title} className="-mx-2 space-y-0.5">
          {shown.map((o) => {
            const on = value.includes(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-md transition active:bg-sunken sm:min-h-10 sm:text-sm sm:pointer-coarse:min-h-12",
                    on ? "bg-brand-soft font-medium text-brand-deep" : "text-ink hover:bg-canvas",
                  )}
                >
                  <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-panel")}>
                    {on && <Check className="size-3.5" strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block [overflow-wrap:anywhere]">{o.label}</span>
                    {o.hint && <span className={cn("mt-0.5 block text-xs", on ? "text-brand-deep" : "text-muted")}>{o.hint}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;</li>}
        </ul>
      </Sheet>
    </>
  );
}
