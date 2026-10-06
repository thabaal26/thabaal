"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Sheet } from "./sheet";

export type PickerOption = { value: string; label: string; hint?: string; disabled?: boolean };

/**
 * The portal's dropdown: a field-styled button that opens a bottom sheet of large, tappable
 * options on phones (a centred list on larger screens), with search for long lists.
 * Works controlled (value + onChange) or as a form field (name + defaultValue), and with
 * `autoSubmit` it applies a filter form as soon as something is picked.
 */
export function Picker({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  title,
  id,
  placeholder = "Choose…",
  disabled,
  autoSubmit,
  className,
  trigger,
  "aria-label": ariaLabel,
}: {
  options: PickerOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  title: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  autoSubmit?: boolean;
  className?: string;
  /** Custom trigger (e.g. a header title); receives the selected option. */
  trigger?: (selected: PickerOption | undefined) => ReactNode;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hidden = useRef<HTMLInputElement>(null);
  const submitNext = useRef(false);
  const selected = options.find((o) => o.value === current);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  // Submit after React has written the new value into the hidden input.
  useEffect(() => {
    if (submitNext.current) {
      submitNext.current = false;
      hidden.current?.form?.requestSubmit();
    }
  }, [current]);

  function pick(v: string) {
    setOpen(false);
    setQuery("");
    if (v === current) return;
    if (value === undefined) setInner(v);
    onChange?.(v);
    if (autoSubmit) submitNext.current = true;
  }

  return (
    <>
      {name && <input ref={hidden} type="hidden" name={name} value={current} />}
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={ariaLabel ?? title}
        onClick={() => setOpen(true)}
        className={trigger ? cn("text-left", className) : cn("field flex items-center justify-between gap-2 text-left", className)}
      >
        {trigger ? (
          trigger(selected)
        ) : (
          <>
            <span className={cn("min-w-0 truncate", !selected && "text-muted/80")}>{selected?.label ?? placeholder}</span>
            <ChevronDown className="size-4 shrink-0 text-muted" />
          </>
        )}
      </button>
      <Sheet open={open} onClose={() => { setOpen(false); setQuery(""); }} title={title}>
        {options.length > 8 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="field pl-10" />
          </div>
        )}
        <ul role="listbox" aria-label={title} className="-mx-2 space-y-0.5">
          {shown.map((o) => {
            const active = o.value === current;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={o.disabled}
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] transition active:scale-[0.99] disabled:opacity-40 sm:min-h-10 sm:text-sm",
                    active ? "bg-brand-soft font-medium text-brand-deep" : "hover:bg-canvas",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block [overflow-wrap:anywhere]">{o.label}</span>
                    {o.hint && <span className={cn("mt-0.5 block text-xs", active ? "text-brand-deep/70" : "text-muted")}>{o.hint}</span>}
                  </span>
                  {active && <Check className="size-4 shrink-0" />}
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
