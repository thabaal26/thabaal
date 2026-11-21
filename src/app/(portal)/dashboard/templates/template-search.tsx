"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import { Search, X } from "@/components/icons";

export function TemplateSearchInput({
  defaultValue = "",
  placeholder = "Search templates by name, content...",
}: {
  defaultValue?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const currentQ = searchParams.get("q") ?? "";
  const [prevQ, setPrevQ] = useState(currentQ);
  const [value, setValue] = useState(defaultValue);

  if (currentQ !== prevQ) {
    setPrevQ(currentQ);
    setValue(currentQ);
  }

  function updateQuery(nextQ: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = nextQ.trim();
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      updateQuery(value);
    }
  }

  function handleClear() {
    setValue("");
    updateQuery("");
  }

  return (
    <div className="relative flex items-center min-w-[200px] sm:w-64 md:w-72">
      <Search
        aria-hidden
        className={`pointer-events-none absolute left-3 size-4 shrink-0 text-muted transition-colors ${
          isPending ? "animate-pulse text-brand" : ""
        }`}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (value !== (searchParams.get("q") ?? "")) {
            updateQuery(value);
          }
        }}
        placeholder={placeholder}
        aria-label="Search templates"
        className="field h-10 w-full rounded-xl sm:h-9 border border-line bg-panel pl-9 pr-8 text-xs text-ink placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand shadow-sm"
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2.5 grid size-5 place-items-center rounded-full text-muted hover:bg-line/40 hover:text-ink transition"
        >
          <X aria-hidden className="size-3 shrink-0" />
        </button>
      )}
    </div>
  );
}
