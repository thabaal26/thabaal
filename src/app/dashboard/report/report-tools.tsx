"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";

/** Copy the summary as WhatsApp-formatted text (to forward to the owner), or print the page. */
export function ReportTools({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
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
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
        {copied ? "Copied" : "Copy for WhatsApp"}
      </Button>
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer aria-hidden className="size-4" /> Print
      </Button>
    </>
  );
}
