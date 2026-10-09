"use client";

import { MoreHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet } from "./sheet";
import { Button } from "./ui";

/**
 * Secondary page actions: shown inline from `sm` up, behind a "⋯" button (a sheet of
 * full-width buttons) on phones, so the header doesn't grow three rows of buttons.
 */
export function OverflowMenu({ title, label = "More actions", children }: { title: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="contents max-sm:hidden">{children}</div>
      <Button variant="secondary" icon className="!min-w-0 !flex-none sm:hidden" aria-label={label} onClick={() => setOpen(true)}>
        <MoreHorizontal aria-hidden className="size-5" />
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <div className="grid gap-2 *:w-full">{children}</div>
      </Sheet>
    </>
  );
}
