import type { ReactNode } from "react";

/** Primary actions pinned just above the phone tab bar, in thumb reach. A spacer keeps page content clear of it. */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-panel px-4 py-2.5 shadow-bar lg:hidden print:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2 *:flex-1">{children}</div>
      </div>
    </>
  );
}
