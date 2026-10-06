import type { ReactNode } from "react";

/** Primary actions floating just above the phone tab bar. A spacer keeps page content clear of it. */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden />
      <div className="fixed inset-x-3 bottom-[calc(4.25rem+max(0.75rem,env(safe-area-inset-bottom)))] z-20 rounded-[1.25rem] border border-white/60 bg-white/85 px-3 py-2.5 shadow-[0_10px_40px_-12px_rgb(15_26_23/0.3)] ring-1 ring-black/5 backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">{children}</div>
      </div>
    </>
  );
}
