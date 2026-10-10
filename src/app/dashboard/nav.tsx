"use client";

import { Bell, Building2, CalendarClock, ChevronRight, Inbox, LayoutDashboard, Menu, MessagesSquare, Phone, Settings, ShoppingBag, SquarePen, Store, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard, group: "Daily work" },
  { href: "/dashboard/notifications", label: "Notifications", short: "Alerts", icon: Bell, group: "Daily work" },
  { href: "/dashboard/orders", label: "Orders", short: "Orders", icon: ShoppingBag, group: "Daily work" },
  { href: "/dashboard/catalogue", label: "Catalogue", short: "Menu", icon: Store, group: "Daily work" },
  { href: "/dashboard/replies", label: "Replies", short: "Replies", icon: Inbox, group: "Daily work" },
  { href: "/dashboard/calls", label: "Calls", short: "Calls", icon: Phone, group: "Daily work" },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: CalendarClock, group: "Marketing" },
  { href: "/dashboard/templates", label: "Templates", short: "Templates", icon: SquarePen, group: "Marketing" },
  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users, group: "Marketing" },
  { href: "/dashboard/messages", label: "Message log", short: "Log", icon: MessagesSquare, group: "Marketing" },
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings, group: "Account" },
];

const ADMIN_NAV = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building2, group: "Account" }];

/**
 * Phone tabs: what each role opens most. Staff pack orders and answer customers all day;
 * owners and managers start from the overview. Everything else is under "More".
 * This only changes which links come first, never what anyone can open.
 */
const PHONE_TABS = {
  staff: ["/dashboard/orders", "/dashboard/replies", "/dashboard/calls", "/dashboard/customers"],
  manager: ["/dashboard", "/dashboard/orders", "/dashboard/replies", "/dashboard/customers"],
};

export type NavRole = keyof typeof PHONE_TABS;
type Counts = { openReplies?: number; newOrders?: number; unreadNotifications?: number };

function CountBadge({ n, label, className }: { n?: number; label: string; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("tabular grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full px-1 text-2xs font-bold", className)}>
      {n > 99 ? "99+" : n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

function isActive(path: string, href: string) {
  return href === "/dashboard" ? path === href : path.startsWith(href);
}

const countFor = (href: string, c: Counts) =>
  href === "/dashboard/replies"
    ? { n: c.openReplies, label: "open replies" }
    : href === "/dashboard/orders"
    ? { n: c.newOrders, label: "orders to handle" }
    : href === "/dashboard/notifications"
    ? { n: c.unreadNotifications, label: "unread notifications" }
    : null;

export function SideNav({ isAdmin, openReplies, newOrders, unreadNotifications }: { isAdmin: boolean } & Counts) {
  const path = usePathname();
  const items = [...NAV, ...(isAdmin ? ADMIN_NAV : [])];
  const groups = [...new Set(items.map((n) => n.group))];
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g} role="group" aria-labelledby={`nav-${g}`}>
          <p id={`nav-${g}`} className="mb-1.5 px-3 text-2xs font-medium uppercase tracking-wider text-white/50">{g}</p>
          <ul className="space-y-0.5">
            {items
              .filter((n) => n.group === g)
              .map(({ href, label, icon: Icon }) => {
                const active = isActive(path, href);
                const count = countFor(href, { openReplies, newOrders, unreadNotifications });
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-control px-3 text-sm font-medium transition",
                        active ? "bg-night-2 text-white" : "text-white/70 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-glow" />}
                      <Icon aria-hidden className={cn("size-[18px] shrink-0", active ? "text-glow" : "text-white/55")} strokeWidth={1.9} />
                      <span className="flex-1 truncate">{label}</span>
                      {count && <CountBadge n={count.n} label={count.label} className={active ? "bg-glow text-night" : "bg-white/10 text-white/90"} />}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phone tab bar, pinned to the bottom edge, above the home indicator. */
export function BottomNav({ isAdmin, role, openReplies, newOrders, unreadNotifications }: { isAdmin: boolean; role: NavRole } & Counts) {
  const path = usePathname();
  // Remembers the page "More" was opened on, so the sheet closes by itself once a tapped page opens.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === path;
  const tabs = PHONE_TABS[role];
  const all = [...NAV, ...(isAdmin ? ADMIN_NAV : [])];
  const more = all.filter((n) => !tabs.includes(n.href));
  const moreActive = more.some((n) => isActive(path, n.href));
  // Counts for sections that live under "More" show on the More tab too.
  const hiddenCount = more.reduce((sum, n) => sum + (countFor(n.href, { openReplies, newOrders, unreadNotifications })?.n ?? 0), 0);

  const tabClass = (active: boolean) =>
    cn("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-2xs font-medium transition active:scale-95", active ? "text-brand-deep" : "text-ink-2/80");
  const iconWrap = (active: boolean) => cn("relative grid h-7 w-12 place-items-center rounded-full transition", active && "bg-brand-soft");
  const badge = "absolute -right-1 -top-1 bg-danger-solid text-white ring-2 ring-panel";

  return (
    <nav aria-label="Main" className="pb-safe glass-bar fixed inset-x-0 bottom-0 z-30 lg:hidden print:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {tabs.map((tab) => all.find((n) => n.href === tab)!).map(({ href, short, icon: Icon }) => {
          const active = isActive(path, href);
          const count = countFor(href, { openReplies, newOrders, unreadNotifications });
          return (
            <li key={href} className="min-w-0">
              <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <span className={iconWrap(active)}>
                  <Icon aria-hidden className="size-5" strokeWidth={active ? 2.4 : 2} />
                  {count && <CountBadge n={count.n} label={count.label} className={badge} />}
                </span>
                <span className="max-w-full truncate px-0.5">{short}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button type="button" onClick={() => setOpenedOn(path)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn(tabClass(moreActive), "w-full")}>
            <span className={iconWrap(moreActive)}>
              <Menu aria-hidden className="size-5" strokeWidth={moreActive ? 2.4 : 2} />
              <CountBadge n={hiddenCount} label="to handle" className={badge} />
            </span>
            More
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onClose={() => setOpenedOn(null)} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {more.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            const count = countFor(href, { openReplies, newOrders, unreadNotifications });
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-control border px-4 text-sm font-medium transition active:scale-[0.98]",
                    active ? "border-brand/30 bg-brand-soft text-brand-deep" : "border-line bg-panel text-ink active:bg-sunken",
                  )}
                >
                  <Icon aria-hidden className="size-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {count && <CountBadge n={count.n} label={count.label} className="bg-danger-solid text-white" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </nav>
  );
}

/** Sub-pages that aren't in the menu, named for the top bar's trail. */
const SUBPAGES: Record<string, string> = {
  new: "New",
  packing: "Packing list",
  audiences: "Audiences",
  grow: "Grow your list",
  sheet: "Google Sheet",
};

/**
 * Computers' top bar: the workspace, then the section and any sub-page, so a deep page always
 * says where it is. Sections link back; the current page doesn't.
 */
export function TopbarTrail({ workspace }: { workspace: string }) {
  const path = usePathname();
  const all = [...NAV, ...ADMIN_NAV];
  const section = all.filter((n) => isActive(path, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const rest = section ? path.slice(section.href.length).split("/").filter(Boolean) : [];
  const sub = rest.length ? SUBPAGES[rest[0]] ?? "Details" : null;
  const crumb = "truncate text-sm";
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5">
        <li className={cn(crumb, "max-w-60 font-medium text-muted")}>{workspace}</li>
        {section && (
          <>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
            <li className="min-w-0">
              {sub ? (
                <Link href={section.href} className={cn(crumb, "block font-medium text-muted transition hover:text-ink")}>
                  {section.label}
                </Link>
              ) : (
                <span aria-current="page" className={cn(crumb, "block font-semibold text-ink")}>
                  {section.label}
                </span>
              )}
            </li>
          </>
        )}
        {sub && (
          <>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
            <li aria-current="page" className={cn(crumb, "font-semibold text-ink")}>
              {sub}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

export function SettingsLink() {
  const path = usePathname();
  const active = path.startsWith("/dashboard/settings");
  return (
    <Link
      href="/dashboard/settings"
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      className={cn("grid size-11 shrink-0 place-items-center rounded-control transition active:scale-95", active ? "bg-night-2 text-glow" : "text-white/80 hover:bg-white/10")}
    >
      <Settings aria-hidden className="size-5" />
    </Link>
  );
}
