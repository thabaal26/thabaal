import Link from "@/components/intent-link";
import { cn } from "@/lib/cn";
import { T } from "../../portal-ui";

/** Newest or oldest orders first; a link pair so the choice lives in the URL like the filters. */
export function SortSwitch({ value, newHref, oldHref }: { value: "new" | "old"; newHref: string; oldHref: string }) {
  const item = (on: boolean) =>
    cn(
      "flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-[calc(var(--radius-control)-4px)] px-3 text-sm font-medium transition sm:min-h-8 sm:pointer-coarse:min-h-10",
      on ? "bg-panel text-ink shadow-card" : "text-muted hover:text-ink",
    );
  return (
    <nav aria-label="Order" className="inline-flex w-full rounded-control bg-sunken p-1 sm:w-auto">
      <Link href={newHref} aria-current={value === "new" ? "true" : undefined} className={item(value === "new")}>
        <T>Newest first</T>
      </Link>
      <Link href={oldHref} aria-current={value === "old" ? "true" : undefined} className={item(value === "old")}>
        <T>Oldest first</T>
      </Link>
    </nav>
  );
}
