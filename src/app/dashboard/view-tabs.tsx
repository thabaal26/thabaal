"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { dashHref, VIEWS, type Range, type View } from "./overview-cards";

/**
 * Dashboard sections as a centred floating pill bar. A highlight slides to the tab you pick, and
 * the direction is handed to the page so the next view slides in from that side (see .animate-view-in).
 */
export function ViewTabs({ view, range, views, badges }: { view: View; range: Range; views: View[]; badges?: Partial<Record<View, number>> }) {
  const [active, setActive] = useState<View>(view);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const refs = useRef<Partial<Record<View, HTMLAnchorElement | null>>>({});

  // Follow the server once the new view has loaded (also covers back/forward).
  const [seen, setSeen] = useState(view);
  if (seen !== view) {
    setSeen(view);
    setActive(view);
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
    refs.current[v]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  };

  return (
    <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] z-20 mb-5 flex justify-center px-1 lg:top-[4.5rem] sm:mb-6 print:hidden">
      <nav
        aria-label="Dashboard sections"
        className="thin-scroll relative flex max-w-full gap-0.5 overflow-x-auto rounded-full sm:gap-1 border border-line/80 bg-panel/85 p-1 sm:p-1.5 shadow-[0_8px_24px_-8px_rgb(16_24_40/0.18),0_2px_6px_-2px_rgb(16_24_40/0.08)] backdrop-blur-md"
      >
        {pill && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 sm:inset-y-1.5 rounded-full bg-brand shadow-[0_4px_12px_-2px_rgb(22_125_99/0.45)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
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
                "relative z-10 inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 text-[0.8125rem] font-medium transition-colors duration-200 sm:gap-1.5 sm:px-5 sm:text-sm",
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
    </div>
  );
}
