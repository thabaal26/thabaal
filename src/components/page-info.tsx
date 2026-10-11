"use client";

import { Info } from "@/components/icons";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The page title and its description. Computers always show the description; phones fold
 * it behind an info button so the page's content starts within the first screen.
 */
export function PageInfo({ title, description }: { title: string; description?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="flex items-center gap-1 sm:items-start">
        <h1 className="min-w-0 text-lg font-semibold leading-snug tracking-tight text-ink [overflow-wrap:anywhere] sm:text-title">{title}</h1>
        {description && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            aria-label={open ? "Hide page description" : "About this page"}
            onClick={() => setOpen(!open)}
            className={cn("-my-1 -mr-1 grid size-8 shrink-0 place-items-center rounded-full transition active:bg-sunken sm:hidden print:hidden", open ? "text-brand-deep" : "text-muted")}
          >
            <Info aria-hidden className="size-4" />
          </button>
        )}
      </div>
      {description && (
        <p id={id} className={cn("mt-1 max-w-read text-xs leading-snug text-muted sm:text-sm sm:leading-normal", !open && "max-sm:hidden")}>
          {description}
        </p>
      )}
    </>
  );
}
