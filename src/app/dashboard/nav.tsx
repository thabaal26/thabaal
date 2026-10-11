"use client";

import { ChevronRight, Menu } from "@/components/icons";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell3D,
  ChartBar3D,
  Building3D,
  Calendar3D,
  Clock3D,
  Dashboard3D,
  Inbox3D,
  Messages3D,
  Phone3D,
  Rupee3D,
  Settings3D,
  ShoppingBag3D,
  Store3D,
  Template3D,
  Users3D,
} from "@/components/icons-3d";
import { Sheet } from "@/components/sheet";
import { isHrefEnabled } from "@/lib/client-sections";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Dashboard", icon: Dashboard3D, group: "Daily work", cube: "from-[#34d399] via-[#10b981] to-[#059669]" },
  { href: "/dashboard/notifications", label: "Notifications", short: "Alerts", icon: Bell3D, group: "Daily work", cube: "from-[#fbbf24] via-[#f59e0b] to-[#d97706]" },
  { href: "/dashboard/orders", label: "Orders", short: "Orders", icon: ShoppingBag3D, group: "Daily work", cube: "from-[#38bdf8] via-[#0ea5e9] to-[#0284c7]" },
  { href: "/dashboard/refills", label: "Refills", short: "Refills", icon: Clock3D, group: "Daily work", cube: "from-[#86efac] via-[#22c55e] to-[#15803d]" },
  { href: "/dashboard/revenue", label: "Revenue & cash", short: "Revenue", icon: Rupee3D, group: "Daily work", cube: "from-[#fde68a] via-[#f59e0b] to-[#b45309]" },
  { href: "/dashboard/catalogue", label: "Catalogue", short: "Menu", icon: Store3D, group: "Daily work", cube: "from-[#2dd4bf] via-[#14b8a6] to-[#0d9488]" },
  { href: "/dashboard/replies", label: "Replies", short: "Replies", icon: Inbox3D, group: "Daily work", cube: "from-[#c084fc] via-[#9333ea] to-[#7e22ce]" },
  { href: "/dashboard/calls", label: "Calls", short: "Calls", icon: Phone3D, group: "Daily work", cube: "from-[#4ade80] via-[#16a34a] to-[#15803d]" },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: Calendar3D, group: "Marketing", cube: "from-[#fb7185] via-[#f43f5e] to-[#e11d48]" },
  { href: "/dashboard/templates", label: "Templates", short: "Templates", icon: Template3D, group: "Marketing", cube: "from-[#818cf8] via-[#6366f1] to-[#4f46e5]" },
  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users3D, group: "Marketing", cube: "from-[#38bdf8] via-[#0284c7] to-[#0369a1]" },
  { href: "/dashboard/report", label: "Weekly report", short: "Report", icon: ChartBar3D, group: "Marketing", cube: "from-[#5eead4] via-[#14b8a6] to-[#0f766e]" },
  { href: "/dashboard/messages", label: "Message log", short: "Log", icon: Messages3D, group: "Marketing", cube: "from-[#a78bfa] via-[#7c3aed] to-[#6d28d9]" },
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings3D, group: "Account", cube: "from-[#fb923c] via-[#ea580c] to-[#c2410c]" },
];

const ADMIN_NAV = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building3D, group: "Account", cube: "from-[#fde047] via-[#eab308] to-[#ca8a04]" }];

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

export function SideNav({
  isAdmin,
  disabledSections,
  openReplies,
  newOrders,
  unreadNotifications,
}: { isAdmin: boolean; disabledSections?: readonly string[] } & Counts) {
  const path = usePathname();
  const router = useRouter();
  const enabledNav = NAV.filter((n) => isHrefEnabled(n.href, disabledSections));
  const items = [...enabledNav, ...(isAdmin ? ADMIN_NAV : [])];
  const groups = [...new Set(items.map((n) => n.group))];

  useEffect(() => {
    if (!isHrefEnabled(path, disabledSections)) {
      router.replace("/dashboard");
    }
  }, [path, disabledSections, router]);

  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g) => (
        <div key={g} role="group" aria-labelledby={`nav-${g}`}>
          <p id={`nav-${g}`} className="mb-1.5 px-3 text-2xs font-medium uppercase tracking-wider text-white/50">{g}</p>
          <ul className="space-y-1">
            {items
              .filter((n) => n.group === g)
              .map(({ href, label, icon: Icon, cube }) => {
                const active = isActive(path, href);
                const count = countFor(href, { openReplies, newOrders, unreadNotifications });
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-control px-2.5 text-sm font-medium transition",
                        active ? "bg-night-2 text-white shadow-xs ring-1 ring-white/15" : "text-white/85 hover:bg-white/[0.08] hover:text-white",
                      )}
                    >
                      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-glow" />}
                      <span
                        aria-hidden
                        className={cn(
                          "icon-cube-3d grid size-7 shrink-0 place-items-center rounded-[8px] bg-gradient-to-br text-white transition-transform duration-200 group-hover:scale-105",
                          cube,
                          active
                            ? "ring-2 ring-glow/80 shadow-[0_0_12px_rgb(250_204_21/0.4)]"
                            : "ring-1 ring-inset ring-white/35",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex-1 truncate">{label}</span>
                      {count && <CountBadge n={count.n} label={count.label} className={active ? "bg-glow text-night" : "bg-white/15 text-white"} />}
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
export function BottomNav({
  isAdmin,
  role,
  disabledSections,
  openReplies,
  newOrders,
  unreadNotifications,
}: { isAdmin: boolean; role: NavRole; disabledSections?: readonly string[] } & Counts) {
  const path = usePathname();
  // Remembers the page "More" was opened on, so the sheet closes by itself once a tapped page opens.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === path;
  const enabledNav = NAV.filter((n) => isHrefEnabled(n.href, disabledSections));
  const all = [...enabledNav, ...(isAdmin ? ADMIN_NAV : [])];

  // Pick up to 4 primary phone tabs from preferred role tabs first, filling from remaining enabled sections if some are disabled.
  const preferredHrefs = PHONE_TABS[role].filter((href) => all.some((n) => n.href === href));
  const fallbackHrefs = enabledNav
    .map((n) => n.href)
    .filter((href) => href !== "/dashboard/settings" && !preferredHrefs.includes(href));
  const tabs = [...preferredHrefs, ...fallbackHrefs].slice(0, 4);
  const tabItems = tabs.map((tab) => all.find((n) => n.href === tab)).filter((x): x is (typeof all)[number] => Boolean(x));

  const more = all.filter((n) => !tabs.includes(n.href));
  const moreActive = more.some((n) => isActive(path, n.href));
  // Counts for sections that live under "More" show on the More tab too.
  const hiddenCount = more.reduce((sum, n) => sum + (countFor(n.href, { openReplies, newOrders, unreadNotifications })?.n ?? 0), 0);

  const tabClass = (active: boolean) =>
    cn("flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-2xs font-medium transition active:scale-95", active ? "text-brand-deep font-semibold" : "text-ink-2/90");
  const iconWrap = (active: boolean, cube = "from-[#34d399] via-[#10b981] to-[#059669]") =>
    cn(
      "icon-cube-3d relative grid h-8 w-11 place-items-center rounded-[10px] bg-gradient-to-br text-white transition",
      cube,
      active ? "ring-2 ring-brand-deep/40 scale-105" : "ring-1 ring-inset ring-white/35 opacity-95",
    );
  const badge = "absolute -right-1 -top-1 bg-danger-solid text-white ring-2 ring-panel";

  return (
    <nav aria-label="Main" className="pb-safe glass-bar fixed inset-x-0 bottom-0 z-30 lg:hidden print:hidden">
      <ul
        className="mx-auto grid max-w-lg"
        style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}
      >
        {tabItems.map(({ href, short, icon: Icon, cube }) => {
          const active = isActive(path, href);
          const count = countFor(href, { openReplies, newOrders, unreadNotifications });
          return (
            <li key={href} className="min-w-0">
              <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <span className={iconWrap(active, cube)}>
                  <Icon aria-hidden className="size-5" />
                  {count && <CountBadge n={count.n} label={count.label} className={badge} />}
                </span>
                <span className="max-w-full truncate px-0.5">{short}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button type="button" onClick={() => setOpenedOn(path)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn(tabClass(moreActive), "w-full")}>
            <span className={iconWrap(moreActive, "from-[#818cf8] via-[#6366f1] to-[#4f46e5]")}>
              <Menu className="size-5" strokeWidth={2} />
              <CountBadge n={hiddenCount} label="to handle" className={badge} />
            </span>
            More
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onClose={() => setOpenedOn(null)} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {more.map(({ href, label, icon: Icon, cube }) => {
            const active = isActive(path, href);
            const count = countFor(href, { openReplies, newOrders, unreadNotifications });
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-control border px-3.5 text-sm font-medium transition active:scale-[0.98]",
                    active ? "border-brand/30 bg-brand-soft text-brand-deep" : "border-line bg-panel text-ink active:bg-sunken",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "icon-cube-3d grid size-8 shrink-0 place-items-center rounded-[9px] bg-gradient-to-br text-white ring-1 ring-inset ring-white/40",
                      cube,
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
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
      <Settings3D aria-hidden className="size-5" />
    </Link>
  );
}
