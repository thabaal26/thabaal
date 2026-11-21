"use client";

import { useState } from "react";
import { Info, X } from "@/components/icons";
import { CLASSIFICATION_DEFINITIONS, type ClassificationMeta } from "@/lib/campaign-classification-meta";
import { cn } from "@/lib/cn";
import { useTr } from "@/lib/i18n/context";

export function ClassificationInfoIcon({
  statusKey,
  className,
}: {
  statusKey: string;
  className?: string;
}) {
  const { isTa } = useTr();
  const [open, setOpen] = useState(false);
  const info: ClassificationMeta | undefined = CLASSIFICATION_DEFINITIONS[statusKey];

  if (!info) return null;

  return (
    <>
      <button
        type="button"
        title={info.definition}
        aria-label={`Info: ${info.title}`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center justify-center p-0.5 text-muted hover:text-ink focus:outline-none rounded transition",
          className
        )}
      >
        <Info className="size-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-panel bg-panel border border-line shadow-card p-5 text-ink space-y-3.5 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-2.5">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand-deep text-xs font-bold">
                  i
                </span>
                <h3 className="font-semibold text-base">{info.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-control text-muted hover:text-ink hover:bg-hover transition"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <div>
                <h4 className="font-semibold text-ink-2">{isTa ? "1. இதன் அர்த்தம் என்ன?" : "1. What does this status mean?"}</h4>
                <p className="text-muted mt-0.5">{info.definition}</p>
              </div>

              <div>
                <h4 className="font-semibold text-ink-2">{isTa ? "2. ஏன் இவ்வாறு வகைப்படுத்தப்பட்டது?" : "2. Why is this customer classified this way?"}</h4>
                <p className="text-muted mt-0.5">{info.whyClassified}</p>
              </div>

              <div>
                <h4 className="font-semibold text-ink-2">{isTa ? "3. இதற்கு ஆதாரம் / மெட்டா பிழை என்ன?" : "3. What evidence or Meta error caused it?"}</h4>
                <p className="text-muted mt-0.5 font-mono text-2xs bg-sunken px-1.5 py-1 rounded border border-line/60">
                  {info.evidenceOrMetaError}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-line/60">
                <div className="bg-sunken p-2 rounded-control">
                  <span className="text-2xs text-muted block">{isTa ? "4. தேர்வு செய்யலாமா?" : "4. Can be selected?"}</span>
                  <span className={cn("font-medium", info.selectable ? "text-success" : "text-danger")}>
                    {info.selectable ? (isTa ? "ஆம் (சரிபார்க்க)" : "Yes (for preview)") : (isTa ? "இல்லை" : "No")}
                  </span>
                </div>
                <div className="bg-sunken p-2 rounded-control">
                  <span className="text-2xs text-muted block">{isTa ? "5. இப்போது அனுப்பலாமா?" : "5. Sendable now?"}</span>
                  <span className={cn("font-medium", info.dispatchable ? "text-success" : "text-amber-600")}>
                    {info.dispatchable ? (isTa ? "ஆம்" : "Yes (Eligible)") : (isTa ? "தடுக்கப்பட்டது" : "Blocked")}
                  </span>
                </div>
              </div>

              {info.dispatchBlockingCondition && (
                <div>
                  <h4 className="font-semibold text-ink-2">{isTa ? "6. அனுப்ப தடையான நிபந்தனை என்ன?" : "6. What condition prevents dispatch?"}</h4>
                  <p className="text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 p-2 rounded-control mt-0.5">
                    {info.dispatchBlockingCondition}
                  </p>
                </div>
              )}

              {info.retryAvailability && (
                <div>
                  <h4 className="font-semibold text-ink-2">{isTa ? "7. மீண்டும் எப்போது அனுப்பலாம்?" : "7. When can retry become available?"}</h4>
                  <p className="text-muted mt-0.5">{info.retryAvailability}</p>
                </div>
              )}

              <div className="pt-2 border-t border-line/60 text-2xs text-muted">
                <span className="font-medium text-ink-2">{isTa ? "8. தானாக அனுப்பப்படுமா?" : "8. Does selecting this automatically send?"}</span>{" "}
                {isTa
                  ? "இல்லை. இது பார்வையிடுவதற்கும் இலக்கு நிர்ணயிப்பதற்கும் மட்டுமே. நீங்கள் பிரச்சாரத்தை இயக்கும் போது மட்டுமே மெசேஜ் வரிசைப்படுத்தப்படும்."
                  : "No. Selecting this filter only previews the customer list; dispatch occurs only when the campaign is explicitly started."}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-control bg-sunken hover:bg-hover transition text-ink"
              >
                {isTa ? "புரிந்தது" : "Got it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
