"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
import { Avatar } from "@/components/ui";
import { Search } from "@/components/icons";
import { cn } from "@/lib/cn";

export type ChatListItem = {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  timeStr: string;
  previewText: string;
  isButton: boolean;
  openCount: number;
  handled: boolean;
  unpaidLabel: string | null;
  href: string;
};

export function ChatList({
  items,
  selectedCustomerId,
}: {
  items: ChatListItem[];
  selectedCustomerId?: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.phone.includes(q) ||
      item.previewText.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full flex-col">
      {/* WhatsApp Search Bar */}
      <div className="border-b border-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full rounded-xl border border-line bg-panel py-1.5 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none dark:bg-[#1A262D]"
          />
        </div>
      </div>

      {/* Scrollable Customer List */}
      <ul aria-label="Customer conversations" className="thin-scroll flex-1 overflow-y-auto py-1">
        {filtered.map((item) => {
          const current = selectedCustomerId === item.customerId;
          return (
            <li key={item.customerId} className="relative">
              <Link
                href={item.href}
                scroll={false}
                className={cn(
                  "flex items-start gap-3 p-3 mx-2 my-1 rounded-xl transition-all",
                  current
                    ? "bg-brand-soft text-ink dark:bg-[#1A384F] shadow-2xs font-medium"
                    : "hover:bg-[#F5F7FB]/70 dark:hover:bg-[#1A262D]/70 text-ink dark:text-[#E9EDEF]",
                )}
              >
                <Avatar name={item.name} className="size-11 shrink-0 text-xs font-semibold shadow-2xs" />
                <div className="min-w-0 flex-1">
                  {/* Top: Name & Time */}
                  <div className="flex items-baseline justify-between gap-1">
                    <p className={cn("truncate text-[14.5px]", current ? "font-bold text-ink" : "font-semibold")}>
                      {item.name}
                    </p>
                    <time className="tabular shrink-0 text-[11.5px] text-[#667781] dark:text-[#8696A0]">
                      {item.timeStr}
                    </time>
                  </div>

                  {/* Middle: Last message preview */}
                  <p className={cn("mt-0.5 truncate text-[13px]", current ? "text-muted" : "text-[#667781] dark:text-[#8696A0]")}>
                    {item.isButton && <span className="font-medium text-emerald-600 dark:text-emerald-400">Tapped: </span>}
                    {item.previewText}
                  </p>

                  {/* Bottom: Badges */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {item.unpaidLabel && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                        {item.unpaidLabel}
                      </span>
                    )}
                    {item.openCount > 0 && (
                      <span className="rounded-full bg-emerald-500 px-1.5 py-0.2 text-[10.5px] font-bold text-white shadow-xs">
                        {item.openCount}
                      </span>
                    )}
                    {item.handled && (
                      <span className="text-[11px] text-muted">✓ Handled</span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
