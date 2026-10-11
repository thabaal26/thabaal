"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { dashHref, RANGES, VIEWS, type Range, type View } from "./overview-cards";

const RANGE_KEYS = Object.keys(RANGES) as Range[];
const SHORT: Record<Range, string> = { today: "Today", "7d": "7d", "30d": "30d" };

/**
 * One floating control bar for the dashboard: which section (a highlight slides to it and the new
 * view slides in from that side, see .animate-view-in) and which period. Centred and sticky.
 */
export function ViewTabs({ view, range, views, badges }: { view: View; range: Range; views: View[]; badges?: Partial<Record<View, number>> }) {
  const router = useRouter();
  const [active, setActive] = useState<View>(view);
  const [period, setPeriod] = useState<Range>(range);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const refs = useRef<Partial<Record<View, HTMLAnchorElement | null>>>({});

  // Follow the server once the new page has loaded (also covers back/forward).
  const [seen, setSeen] = useState(`${view}|${range}`);
  if (seen !== `${view}|${range}`) {
    setSeen(`${view}|${range}`);
    setActive(view);
    setPeriod(range);
  }

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[active];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  const pick = (v: View) => {
    if (v === active) return;
    const dir = views.indexOf(v) > views.indexOf(active) ? 1 : -1;
    document.documentElement.style.setProperty("--view-dx", `${dir * 28}px`);
    setActive(v);
  };
  const pickPeriod = (r: Range) => {
    document.documentElement.style.setProperty("--view-dx", "0px");
    setPeriod(r);
  };

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-20 mb-5 flex justify-center px-1 lg:top-[4.5rem] sm:mb-6 print:hidden">
      <div className="flex max-w-full items-center gap-1 rounded-full border border-line/80 bg-panel/85 p-1 shadow-[0_8px_24px_-8px_rgb(16_24_40/0.18),0_2px_6px_-2px_rgb(16_24_40/0.08)] backdrop-blur-md sm:p-1.5">
        <nav aria-label="Dashboard sections" className="thin-scroll relative flex min-w-0 gap-0.5 overflow-x-auto sm:gap-1">
          {pill && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 rounded-full bg-brand shadow-[0_4px_12px_-2px_rgb(22_125_99/0.45)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
              style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
            />
          )}
          {views.map((v) => {
            const on = v === active;
            const n = badges?.[v];
            return (
              <Link
                key={v}
                ref={(el) => {
                  refs.current[v] = el;
                }}
                href={dashHref(v, range)}
                scroll={false}
                title={VIEWS[v].hint}
                aria-current={v === view ? "page" : undefined}
                onClick={() => pick(v)}
                className={cn(
                  "relative z-10 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.8125rem] font-medium transition-colors duration-200 sm:gap-1.5 sm:px-4 sm:text-sm",
                  on ? "text-white" : "text-ink-2 hover:text-ink",
                  !pill && on && "bg-brand",
                )}
              >
                {VIEWS[v].label}
                {n ? (
                  <>
                    <span aria-hidden className={cn("size-1.5 rounded-full sm:hidden", on ? "bg-white/80" : "bg-warning")} />
                    <span className={cn("tabular rounded-full px-1.5 py-px text-2xs font-semibold transition-colors max-sm:sr-only", on ? "bg-white/25 text-white" : "bg-warning-bg text-warning")}>{n}</span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-line sm:mx-1" />

        {/* Period: segmented on wider screens, a compact menu on phones. */}
        <nav aria-label="Period" className="hidden shrink-0 gap-0.5 rounded-full bg-sunken p-0.5 sm:flex">
          {RANGE_KEYS.map((r) => (
            <Link
              key={r}
              href={dashHref(view, r)}
              scroll={false}
              aria-current={r === range ? "page" : undefined}
              onClick={() => pickPeriod(r)}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold transition",
                r === period ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
              )}
            >
              {RANGES[r].label}
            </Link>
          ))}
        </nav>
        <label className="relative shrink-0 sm:hidden">
          <span className="sr-only">Period</span>
          <select
            value={period}
            onChange={(e) => {
              const r = e.target.value as Range;
              pickPeriod(r);
              router.push(dashHref(view, r), { scroll: false });
            }}
            className="min-h-10 appearance-none rounded-full bg-sunken py-1 pl-3 pr-7 text-xs font-semibold text-ink outline-none"
          >
            {RANGE_KEYS.map((r) => (
              <option key={r} value={r}>
                {SHORT[r]}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
        </label>
      </div>
    </div>
  );
}
