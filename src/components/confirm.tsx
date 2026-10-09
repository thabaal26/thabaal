"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "./sheet";
import { Button } from "./ui";

type Ask = {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** Destructive actions (delete, cancel, stop) get a red confirm button. */
  danger?: boolean;
};
type Pending = Ask & { resolve: (ok: boolean) => void };

const EVENT = "portal-confirm";

/** Words that mark an action as destructive, so its confirm button turns red. */
const DESTRUCTIVE = /\b(delete|remove|cancel|stop|disconnect|unlink|log out|sign out)\b/i;

/**
 * The portal's replacement for window.confirm: same question, asked in a branded dialog
 * (a bottom sheet on phones). Resolves true when confirmed.
 */
export function confirmAction(ask: Ask | string): Promise<boolean> {
  const a = typeof ask === "string" ? { message: ask } : ask;
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !document.querySelector("[data-confirm-host]")) return resolve(window.confirm(a.message));
    window.dispatchEvent(new CustomEvent<Pending>(EVENT, { detail: { danger: DESTRUCTIVE.test(a.message), ...a, resolve } }));
  });
}

export function ConfirmHost() {
  const [ask, setAsk] = useState<Pending | null>(null);
  const answered = useRef(false);

  useEffect(() => {
    const on = (e: Event) => {
      answered.current = false;
      setAsk((prev) => {
        prev?.resolve(false);
        return (e as CustomEvent<Pending>).detail;
      });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const answer = (ok: boolean) => {
    if (!ask || answered.current) return;
    answered.current = true;
    ask.resolve(ok);
    setAsk(null);
  };

  return (
    <span data-confirm-host hidden={!ask}>
      <Sheet
        open={!!ask}
        onClose={() => answer(false)}
        role="alertdialog"
        title={ask?.title ?? "Are you sure?"}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => answer(false)}>
              Go back
            </Button>
            <Button variant={ask?.danger ? "dangerSolid" : "primary"} onClick={() => answer(true)} data-autofocus>
              {ask?.confirmLabel ?? "Yes, continue"}
            </Button>
          </div>
        }
      >
        <p className="whitespace-pre-line text-md text-ink-2 sm:text-sm">{ask?.message}</p>
      </Sheet>
    </span>
  );
}
