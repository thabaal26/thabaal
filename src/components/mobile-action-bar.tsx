"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Primary actions pinned just above the phone tab bar, in thumb reach. Rendered into <body> so
 * nothing on the page (animated sections, later cards) can cover or unpin it. The marker left in
 * place makes the page reserve room for the bar at its end (see `#main:has([data-action-bar])`).
 */
export function MobileActionBar({ children }: { children: ReactNode }) {
  // Only after hydration: the server has no <body> to portal into.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return (
    <>
      <span data-action-bar hidden />
      {mounted &&
        createPortal(
          <div className="glass-bar fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 py-2.5 lg:hidden print:hidden">
            <div className="mx-auto flex max-w-lg items-center gap-2 *:flex-1">{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
