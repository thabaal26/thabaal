"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition, type ReactNode } from "react";
import { confirmAction } from "./confirm";
import { safeAction, toastResult } from "./toast";
import { Button, type ButtonSize, type ButtonVariant } from "./ui";

type Result = { ok: boolean; message?: string; errors?: string[] };

/** Runs a bound server action, with optional confirmation, then shows the result. Ignores repeat taps while it runs. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  title,
  className,
  "aria-label": ariaLabel,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const router = useRouter();
  return (
    <Button
      variant={variant}
      size={size}
      title={title}
      aria-label={ariaLabel}
      className={className}
      loading={pending}
      onClick={async () => {
        if (busy.current) return;
        busy.current = true;
        try {
          if (confirm && !(await confirmAction(confirm))) return;
          start(async () => {
            toastResult(await safeAction(action));
            router.refresh();
          });
        } finally {
          busy.current = false;
        }
      }}
    >
      {children}
    </Button>
  );
}
