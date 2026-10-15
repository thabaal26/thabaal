"use client";

import { Check, Copy, Printer, Send } from "@/components/icons";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui";

/** Copy the summary as WhatsApp-formatted text, open WhatsApp directly to share, or print the page. */
export function ReportTools({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <>
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass("secondary")}
        title="Share executive summary directly on WhatsApp"
      >
        <Send aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" /> Share on WhatsApp
      </a>
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Copy aria-hidden className="size-4" />}
        {copied ? "Copied" : "Copy text"}
      </Button>
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer aria-hidden className="size-4" /> Print
      </Button>
    </>
  );
}
