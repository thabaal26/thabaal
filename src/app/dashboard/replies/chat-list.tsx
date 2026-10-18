"use client";

import { useState } from "react";
import Link from "@/components/intent-link";
import { Search } from "@/components/icons";

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
export function ChatList({
  items,
  selectedCustomerId,
  onSelectCustomer,
}: {
  items: ChatListItem[];
  selectedCustomerId?: string;
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q) || i.phone.includes(q) || i.previewText.toLowerCase().includes(q)) : items;

  return (
    <>
      {items.length > 6 && (
        <div style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
          <div className="search" style={{ maxWidth: "none" }}>
            <Search aria-hidden className="shrink-0" />
            <input type="search" aria-label="Search chats" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or message" />
          </div>
        </div>
      )}
      <nav className="cl scrolly" aria-label="Customer conversations" style={{ flex: 1 }}>
        {filtered.map((item) => {
          const current = selectedCustomerId === item.customerId;
          return (
            <Link key={item.customerId} href={item.href} scroll={false} onClick={() => onSelectCustomer?.(item.customerId)} aria-current={current ? "true" : undefined}>
              <span className="nm">
                <span>{item.name}</span>
                <span className="muted small">{item.timeStr}</span>
              </span>
              <span className="pv">
                {item.isButton && <b className="up">Tapped: </b>}
                {item.previewText}
              </span>
              {(item.unpaidLabel || item.openCount > 1 || item.handled) && (
                <span className="chips" style={{ gap: 6, marginTop: 4 }}>
                  {item.unpaidLabel && <span className="pill warn">{item.unpaidLabel}</span>}
                  {item.openCount > 1 && <span className="pill ok">{item.openCount} new</span>}
                  {item.handled && <span className="muted small">✓ Handled</span>}
                </span>
              )}
            </Link>
          );
        })}
        {filtered.length === 0 && <p className="muted" style={{ padding: 14 }}>No chats match “{search}”.</p>}
      </nav>
    </>
  );
}
