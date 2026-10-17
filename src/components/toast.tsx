"use client";

import { CheckCircle2, X, XCircle } from "@/components/icons";
import { useCallback, useEffect, useState } from "react";

type Toast = { id: number; ok: boolean; text: string; details?: string[] };
const EVENT = "portal-toast";

export function toast(ok: boolean, text: string, details?: string[]) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ok, text, details } }));
}

/** Shows the outcome of a server action. */
export function toastResult(r: { ok: boolean; message?: string; errors?: string[] }) {
  toast(r.ok, r.message ?? (r.ok ? "Done." : "Please fix the following:"), r.errors);
}

/** Shown when a server action never got an answer (offline, connection dropped, server restarting). */
export const CONNECTION_PROBLEM = "Couldn't reach Thabaal. Check your internet connection and try again. If you're not sure it saved, refresh the page first.";

/**
 * Runs a server action and turns a dropped connection into a normal failed result, so the form stays open with a
 * clear message instead of the page breaking. Actions are safe to retry: money actions refuse to count twice.
 */
export async function safeAction<T extends { ok: boolean; message?: string }>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("Server action failed", e);
    // Only ok and message are set; callers read other fields after checking ok.
    return { ok: false, message: CONNECTION_PROBLEM } as T;
  }
}

/** Up to three results at once, newest last; errors stay longer and can be dismissed early. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setItems((s) => s.filter((x) => x.id !== id)), []);
  useEffect(() => {
    const on = (e: Event) => {
      const t = { id: Date.now() + Math.random(), ...(e as CustomEvent).detail } as Toast;
      setItems((s) => [...s.slice(-2), t]);
      setTimeout(() => dismiss(t.id), t.ok ? 4000 : 8000);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [dismiss]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6 lg:bottom-6 lg:top-auto print:hidden"
    >
      {items.map((t) => (
        <div key={t.id} className="surface-dark pointer-events-auto flex w-full max-w-sm animate-toast items-start gap-3 rounded-card bg-night py-3 pl-4 pr-2 text-sm text-white shadow-pop">
          {t.ok ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-call-answer" />
          ) : (
            <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-on-dark" />
          )}
          <div className="min-w-0 flex-1 py-px">
            <p>
              <span className="sr-only">{t.ok ? "Done: " : "Problem: "}</span>
              {t.text}
            </p>
            {t.details?.length ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-white/75">
                {t.details.map((d) => <li key={d}>{d}</li>)}
              </ul>
            ) : null}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-my-1.5 grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
