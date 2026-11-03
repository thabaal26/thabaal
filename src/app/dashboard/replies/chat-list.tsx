"use client";

import { useState, type ReactNode } from "react";
import Link from "@/components/intent-link";
import { Check, CheckCheck, CircleAlert, Search } from "@/components/icons";
import { useLanguage } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export type ChatListItem = {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  timeStr: string;
  previewText: string;
  isButton: boolean;
  /** We messaged them (a campaign, an update) and they haven't written back. */
  isSent: boolean;
  /** Our message's status when isSent: SENT, DELIVERED, READ or FAILED. */
  sentStatus?: string | null;
  openCount: number;
  handled: boolean;
  unpaidLabel: string | null;
  href: string;
};

const SENT_WORD: Record<string, string> = { SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Not delivered" };

/** Two letters for the round picture: first and last word ("Muthu Arasu" → MA), or the last digits of a number. */
export function initials(name: string) {
  const all = name.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!all.length) return "?";
  // Numbers in a name ("Meena 2", a phone saved as the name) don't make letters.
  const words = all.filter((w) => !/^\d+$/.test(w));
  if (!words.length) return all.join("").slice(-2);
  const a = [...words[0]][0] ?? "";
  const b = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : ([...words[0]][1] ?? "");
  return (a + b).toUpperCase();
}

/** The same colour for the same customer every time. */
export function avatarColour(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % 6);
}

export function Avatar({ name, seed, size }: { name: string; seed: string; size?: "sm" | "lg" }) {
  return (
    <span className={cn("wa-av", size)} data-c={avatarColour(seed)} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Our message's ticks in the list, like WhatsApp's "✓✓ You: …". */
function SentTicks({ status }: { status?: string | null }) {
  const word = status ? (SENT_WORD[status] ?? status) : "";
  const icon =
    status === "FAILED" ? (
      <CircleAlert aria-hidden className="ic" style={{ width: 15, height: 15, color: "var(--bad)" }} />
    ) : status === "SENT" ? (
      <Check aria-hidden className="ic" style={{ width: 16, height: 16 }} />
    ) : (
      <CheckCheck aria-hidden className="ic" style={{ width: 16, height: 16, color: status === "READ" ? "var(--wa-read)" : undefined }} />
    );
  return (
    <>
      {icon}
      <span className="sr-only">{word}</span>
    </>
  );
}

/** The chat list on Chats: search, the filters, then one row per customer, newest first. */
export function ChatList({
  items,
  selectedCustomerId,
  onSelectCustomer,
  filters,
}: {
  items: ChatListItem[];
  selectedCustomerId?: string;
  onSelectCustomer?: (customerId: string) => void;
  /** All / Open / Handled / Sent, under the search box. */
  filters?: ReactNode;
}) {
  const { isTamil } = useLanguage();
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  // A number typed ("98421 74756", "+91…") also finds the chat by phone.
  const digits = /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  const filtered = q
    ? items.filter((i) => i.name.toLowerCase().includes(q) || (digits.length > 2 && i.phone.includes(digits)) || i.previewText.toLowerCase().includes(q))
    : items;

  return (
    <>
      <div className="wa-search">
        <Search aria-hidden className="ic" />
        <input
          type="search"
          aria-label="Search chats"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isTamil ? "பெயர், எண் அல்லது செய்தியைத் தேடு" : "Search name, number or message"}
        />
      </div>
      {filters}
      <nav className="wa-rows" aria-label="Customer conversations">
        {filtered.map((item) => {
          const current = selectedCustomerId === item.customerId;
          const unread = !item.handled && !item.isSent;
          return (
            <Link
              key={item.customerId}
              href={item.href}
              scroll={false}
              onClick={() => onSelectCustomer?.(item.customerId)}
              aria-current={current ? "true" : undefined}
              className={cn("wa-row", unread && "wa-new")}
            >
              <Avatar name={item.name} seed={item.customerId} />
              <span className="wa-rb">
                <span className="wa-l1">
                  <span className="wa-nm">{item.name}</span>
                  <span className="wa-tm">{item.timeStr}</span>
                </span>
                <span className="wa-l2">
                  <span className="wa-pv">
                    {item.isSent && <SentTicks status={item.sentStatus} />}
                    {item.isSent && <b>{isTamil ? "நீங்கள்:" : "You sent:"}</b>}
                    {item.isButton && <b>{isTamil ? "தட்டினார்:" : "Tapped:"}</b>}
                    <span>{item.previewText}</span>
                  </span>
                  {item.unpaidLabel && <span className="wa-tag">{item.unpaidLabel}</span>}
                  {item.handled && !item.isSent && <span className="sr-only">✓ Handled</span>}
                  {unread && (
                    <span className="wa-badge" aria-label={`${item.openCount} new`}>
                      {item.openCount}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="wa-empty">{isTamil ? `“${search}” உடன் பொருந்தும் உரையாடல் இல்லை.` : `No chats match “${search}”.`}</p>
        )}
      </nav>
    </>
  );
}
