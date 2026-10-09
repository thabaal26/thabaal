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
  /** Ask for a value instead of a yes/no (replaces window.prompt). */
  input?: { label: string; defaultValue?: string; type?: "text" | "password" | "number"; inputMode?: "text" | "numeric" };
};
type Pending = Ask & { resolve: (answer: string | null) => void };

const EVENT = "portal-confirm";

/** Words that mark an action as destructive, so its confirm button turns red. */
const DESTRUCTIVE = /\b(delete|remove|cancel|stop|disconnect|unlink|log out|sign out)\b/i;

function ask(a: Ask): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (!document.querySelector("[data-confirm-host]")) {
      if (a.input) return resolve(window.prompt(a.message, a.input.defaultValue ?? ""));
      return resolve(window.confirm(a.message) ? "" : null);
    }
    window.dispatchEvent(new CustomEvent<Pending>(EVENT, { detail: { danger: !a.input && DESTRUCTIVE.test(a.message), ...a, resolve } }));
  });
}

/**
 * The portal's replacement for window.confirm: same question, asked in a branded dialog
 * (a bottom sheet on phones). Resolves true when confirmed.
 */
export async function confirmAction(a: Omit<Ask, "input"> | string): Promise<boolean> {
  return (await ask(typeof a === "string" ? { message: a } : a)) !== null;
}

/** The replacement for window.prompt: resolves the entered text, or null when cancelled. */
export function promptText(message: string, input: NonNullable<Ask["input"]>, opts: Omit<Ask, "message" | "input"> = {}): Promise<string | null> {
  return ask({ ...opts, message, input });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const answered = useRef(false);

  useEffect(() => {
    const on = (e: Event) => {
      const next = (e as CustomEvent<Pending>).detail;
      answered.current = false;
      setValue(next.input?.defaultValue ?? "");
      setPending((prev) => {
        prev?.resolve(null);
        return next;
      });
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const answer = (ok: boolean) => {
    if (!pending || answered.current) return;
    answered.current = true;
    pending.resolve(ok ? (pending.input ? value : "") : null);
    setPending(null);
  };

  return (
    <span data-confirm-host hidden={!pending}>
      <Sheet
        open={!!pending}
        onClose={() => answer(false)}
        role="alertdialog"
        title={pending?.title ?? (pending?.input ? pending.input.label : "Are you sure?")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            answer(true);
          }}
        >
          <p className="whitespace-pre-line text-md text-ink-2 sm:text-sm">{pending?.message}</p>
          {pending?.input && (
            <input
              aria-label={pending.input.label}
              type={pending.input.type ?? "text"}
              inputMode={pending.input.inputMode}
              autoComplete="off"
              className="field mt-4"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              data-autofocus
            />
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => answer(false)}>
              Go back
            </Button>
            <Button type="submit" variant={pending?.danger ? "dangerSolid" : "primary"} data-autofocus={pending?.input ? undefined : true}>
              {pending?.confirmLabel ?? (pending?.input ? "Save" : "Yes, continue")}
            </Button>
          </div>
        </form>
      </Sheet>
    </span>
  );
}
