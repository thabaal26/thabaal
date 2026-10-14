import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";

/** Switch between Open chats, Priority board, and Calls as in artifact inbox.html. */
export function InboxTabs({ active }: { active: "inbox" | "priority" | "calls" }) {
  const tabs = [
    { key: "inbox", href: "/dashboard/replies", label: "Open chats" },
    { key: "priority", href: "/dashboard/replies/priority", label: "Priority" },
    { key: "calls", href: "/dashboard/calls", label: "Calls" },
  ] as const;

  return (
    <nav aria-label="Chats views" className="inline-flex rounded-xl border border-line bg-card p-1 shadow-2xs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold transition",
            t.key === active
              ? "bg-[#10283B] text-[#FFF9F0] dark:bg-[#FFF9F0] dark:text-[#10283B] shadow-xs"
              : "text-muted hover:text-ink dark:hover:text-[#FFF9F0]",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
