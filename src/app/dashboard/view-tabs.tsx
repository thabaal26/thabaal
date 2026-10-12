"use client";

import Link from "@/components/intent-link";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { VIEWS, type View } from "./overview-cards";

/**
 * The dashboard's floating section switcher: a highlight slides to the picked section and the new
 * view slides in from that side (see .animate-view-in). Centred, sticky. Each section shows its own
 * filters at its top.
 */
export function ViewTabs({
  view,
  views,
  badges,
  queries,
}: {
  view: View;
  views: View[];
  badges?: Partial<Record<View, number>>;
  /** Each section's link: the current filters it uses, as a query string. */
  queries: Partial<Record<View, string>>;
}) {
  const [active, setActive] = useState<View>(view);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const refs = useRef<Partial<Record<View, HTMLAnchorElement | null>>>({});

  // Follow the server once the new page has loaded (also covers back/forward).
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
  };
  const href = (v: View) => {
    const q = new URLSearchParams(queries[v] ?? "");
    if (v !== "overview") q.set("view", v);
    const s = q.toString();
    return s ? `/dashboard?${s}` : "/dashboard";
  };

  return (
    <div className="sticky top-[calc(3rem+env(safe-area-inset-top)+0.375rem)] z-20 mb-3.5 flex justify-center sm:top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)] sm:mb-6 sm:px-1 lg:top-[4.5rem] print:hidden">
      <div className="ui-card flex w-full max-w-full items-center rounded-full border border-line/80 bg-panel/90 p-1 shadow-[0_6px_18px_-6px_rgb(16_24_40/0.15),0_2px_5px_-2px_rgb(16_24_40/0.07)] backdrop-blur-md sm:w-auto sm:gap-1 sm:p-1.5">
        <nav aria-label="Dashboard sections" className="relative flex w-full min-w-0 items-center justify-between gap-0.5 sm:w-auto sm:min-w-max sm:justify-start sm:gap-1">
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
                href={href(v)}
                scroll={false}
                title={VIEWS[v].hint}
                aria-current={v === view ? "page" : undefined}
                onClick={() => pick(v)}
                className={cn(
                  "relative z-10 inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium transition-colors duration-200 sm:min-h-10 sm:flex-none sm:gap-1.5 sm:px-4 sm:text-sm",
                  on ? "text-white" : "text-ink-2 hover:text-ink",
                  !pill && on && "bg-brand",
                )}
              >
                <span className="truncate">{VIEWS[v].label}</span>
                {n ? (
                  <>
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full sm:hidden", on ? "bg-white/85" : "bg-warning")} />
                    <span className={cn("tabular rounded-full px-1.5 py-px text-2xs font-semibold transition-colors max-sm:sr-only", on ? "bg-white/25 text-white" : "bg-warning-bg text-warning")}>{n}</span>
                  </>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
