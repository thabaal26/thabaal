"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const noop = () => () => {};

/** Open overlays, innermost last: only the top one answers Esc, Tab and the back button. */
const stack: string[] = [];
const isTop = (id: string) => stack[stack.length - 1] === id;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * The portal's one overlay: a bottom sheet on phones, a centred dialog from `sm` up.
 * Traps focus inside, closes with Esc, the close button, the backdrop and the phone's back
 * button (it adds a history entry while open), stops the page scrolling behind it and gives
 * focus back to whatever opened it.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  role = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticks to the bottom of the sheet, for the submit button of a long form. */
  footer?: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
}) {
  const id = useId();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const close = useCallback(() => closeRef.current(), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(id);

    // Body scroll lock, shared by nested sheets.
    const body = document.body;
    if (stack.length === 1) {
      body.dataset.prevOverflow = body.style.overflow;
      body.style.overflow = "hidden";
    }

    // Phones: the back button closes the sheet instead of leaving the page.
    // (Skipped when React re-runs this effect in development and the entry is already there.)
    // When one sheet hands over to another (e.g. order actions → dispatch), the new sheet takes
    // over the closing sheet's entry instead of stacking a second one, so one back press closes it.
    const current = window.history.state?.__sheet;
    if (current !== id) {
      const entry = { ...window.history.state, __sheet: id };
      if (current && !stack.includes(current)) window.history.replaceState(entry, "");
      else window.history.pushState(entry, "");
    }
    const onPop = () => {
      if (window.history.state?.__sheet !== id && stack.includes(id)) close();
    };
    window.addEventListener("popstate", onPop);

    const onKey = (e: KeyboardEvent) => {
      if (!isTop(id)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);

    // Focus the first field if there is one, otherwise the sheet itself.
    requestAnimationFrame(() => {
      const target = panel.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([type=search]), textarea, select");
      (target && window.matchMedia("(pointer: fine)").matches ? target : panel.current)?.focus({ preventScroll: true });
    });

    return () => {
      stack.splice(stack.indexOf(id), 1);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      if (stack.length === 0) body.style.overflow = body.dataset.prevOverflow ?? "";
      // Closed by a button or Esc: drop the history entry this sheet added (not after a navigation,
      // and not when React is only re-running the effect, which puts the id back on the stack).
      setTimeout(() => {
        if (!stack.includes(id) && window.history.state?.__sheet === id) window.history.back();
      });
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, id, close]);

  if (!open || !mounted) return null;
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 print:hidden">
      <div aria-hidden className="absolute inset-0 animate-fade bg-night/55" onClick={close} />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-sheet glass-modal outline-none sm:animate-rise sm:rounded-sheet",
          className?.includes("max-w-") ? "" : "sm:max-w-md",
          className,
        )}
      >
        <div className="shrink-0 px-5 pb-3 pt-2 sm:pt-5">
          <div aria-hidden className="mx-auto mb-2.5 h-1 w-10 rounded-full bg-line-strong/50 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pt-1.5">
              <h2 id={titleId} className="text-base font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button type="button" onClick={close} aria-label="Close" className="-mr-2 grid size-11 shrink-0 place-items-center rounded-control text-muted transition hover:bg-sunken hover:text-ink active:bg-sunken sm:size-9">
              <X className="size-5" />
            </button>
          </div>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1", footer ? "pb-4" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6")}>{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
