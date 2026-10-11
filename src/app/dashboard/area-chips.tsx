"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "@/components/icons";

type AreaItem = {
  location: string;
  _count: number;
};

export function AreaChips({
  topAreas,
  otherAreas = [],
}: {
  topAreas: AreaItem[];
  otherAreas?: AreaItem[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (topAreas.length === 0 && otherAreas.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">
          {otherAreas.length > 0 ? "Top areas" : "Areas"}
        </p>
        {otherAreas.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex min-h-11 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-brand-deep hover:bg-brand-soft/50 sm:min-h-7"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                Show top 10 <ChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                Others ({otherAreas.length}) <ChevronDown className="size-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {topAreas.map((a) => (
          <Link
            key={a.location}
            href={`/dashboard/customers?area=${encodeURIComponent(`loc:${a.location}`)}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/50 bg-panel px-3 text-sm transition hover:border-brand hover:bg-brand-soft/50 active:bg-sunken sm:min-h-8"
          >
            <span className="truncate max-w-[180px]">{a.location}</span>{" "}
            <span className="tabular text-xs text-muted">{a._count}</span>
          </Link>
        ))}

        {expanded &&
          otherAreas.map((a) => (
            <Link
              key={a.location}
              href={`/dashboard/customers?area=${encodeURIComponent(`loc:${a.location}`)}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-canvas/80 px-3 text-sm text-muted transition hover:border-brand hover:bg-brand-soft/50 hover:text-ink active:bg-sunken sm:min-h-8"
            >
              <span className="truncate max-w-[180px]">{a.location}</span>{" "}
              <span className="tabular text-xs text-muted">{a._count}</span>
            </Link>
          ))}

        {!expanded && otherAreas.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-line-strong bg-canvas px-3.5 text-sm font-medium text-muted transition hover:border-brand hover:bg-brand-soft/60 hover:text-brand-deep active:bg-sunken sm:min-h-8"
          >
            <span>+ {otherAreas.length} others</span>
            <ChevronDown className="size-3.5 text-muted" />
          </button>
        )}
      </div>
    </div>
  );
}
