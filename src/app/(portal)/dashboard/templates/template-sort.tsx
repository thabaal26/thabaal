"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export function TemplateSortSelect({
  currentSort = "latest",
}: {
  currentSort?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setSort(nextSort: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSort && nextSort !== "latest") {
      params.set("sort", nextSort);
    } else {
      params.delete("sort");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="template-sort" className="sr-only">
        Sort templates
      </label>
      <select
        id="template-sort"
        value={currentSort}
        onChange={(e) => setSort(e.target.value)}
        className="h-10 rounded-xl border border-line bg-panel px-3 text-xs font-semibold text-ink shadow-2xs transition hover:border-ink focus:border-brand focus:outline-hidden"
      >
        <option value="latest">Newest first</option>
        <option value="updated">Recently updated</option>
        <option value="name">Name (A–Z)</option>
      </select>
    </div>
  );
}
