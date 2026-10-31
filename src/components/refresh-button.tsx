"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "@/components/icons";
import { useLanguage } from "@/lib/i18n/context";

/**
 * A round "refresh now" button for a page header (Orders, Payments). The page also updates by itself
 * (LiveRefresh); this is for anyone who wants it at once. Only the page's data reloads, not the whole page.
 */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { isTa } = useLanguage();
  const label = isTa ? "புதுப்பி" : "Refresh";
  return (
    <button
      type="button"
      data-icon
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      aria-label={label}
      title={label}
      className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-line bg-panel text-ink shadow-xs transition hover:border-ink disabled:opacity-70 print:hidden"
    >
      <RefreshCw aria-hidden className={`size-4 ${pending ? "animate-spin" : ""}`} />
    </button>
  );
}
