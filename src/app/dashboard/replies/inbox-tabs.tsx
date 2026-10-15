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
            "inline-flex min-h-[32px] items-center rounded-lg px-3.5 text-[13.5px] font-semibold transition-all duration-200 ease-out active:scale-[0.96]",
            t.key === active
              ? "bg-ink text-canvas shadow-xs -translate-y-px"
              : "text-muted hover:text-ink hover:bg-subtle/60",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
