"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
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

/** The left card on Chats: one row per customer, newest first, the open one highlighted. */
export function ChatList({ items, selectedCustomerId }: { items: ChatListItem[]; selectedCustomerId?: string }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.phone.includes(q) || i.previewText.toLowerCase().includes(q)) : items;

  return (
    <div className="flex h-full flex-col">
      {items.length > 6 && (
        <div className="border-b border-line p-3">
          <label className="relative block">
            <span className="sr-only">Search chats</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, number or message"
              className="field !min-h-10 !pl-9 !text-sm"
            />
          </label>
        </div>
      )}

      <ul aria-label="Customer conversations" className="thin-scroll flex-1 overflow-y-auto">
        {filtered.map((item) => {
          const current = selectedCustomerId === item.customerId;
          return (
            <li key={item.customerId} className="border-b border-line last:border-b-0">
              <Link
                href={item.href}
                scroll={false}
                aria-current={current ? "true" : undefined}
                className={cn("block px-4 py-3.5 transition-colors", current ? "bg-brand-soft" : "hover:bg-sunken/60")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[15px] font-bold text-ink">{item.name}</p>
                  <time className="tabular shrink-0 text-[13px] font-semibold text-muted">{item.timeStr}</time>
                </div>
                <p className="mt-1 truncate text-[14px] text-muted">
                  {item.isButton && <span className="font-semibold text-success">Tapped: </span>}
                  {item.previewText}
                </p>
                {(item.unpaidLabel || item.openCount > 1 || item.handled) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {item.unpaidLabel && <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning">{item.unpaidLabel}</span>}
                    {item.openCount > 1 && <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-bold text-success">{item.openCount} new</span>}
                    {item.handled && <span className="text-[11.5px] font-medium text-muted">✓ Handled</span>}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No chats match “{search}”.</li>}
      </ul>
    </div>
  );
}
