import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";

/** Switch between the conversation inbox and the priority board. */
export function InboxTabs({ active }: { active: "inbox" | "priority" }) {
  const tabs = [
    { key: "inbox", href: "/dashboard/replies", label: "Inbox" },
    { key: "priority", href: "/dashboard/replies/priority", label: "Priority board" },
  ] as const;
  return (
    <nav aria-label="Replies views" className="inline-flex rounded-control bg-sunken p-0.5 sm:p-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-8 items-center rounded-[calc(var(--radius-control)-3px)] px-2.5 text-xs font-medium transition sm:px-3.5 sm:text-sm",
            t.key === active ? "bg-panel text-ink shadow-xs ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
