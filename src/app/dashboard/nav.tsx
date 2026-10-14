"use client";

import {
  BarChart3,
  Bell,
  Building2,
  ChevronRight,
  Clock,
  FileText,
  Home,
  IndianRupee,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquareText,
  Package,
  Phone,
  Settings,
  Tag,
  Users,
  Wallet,
} from "lucide-react";
import Link from "@/components/intent-link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/sheet";
import { isHrefEnabled } from "@/lib/client-sections";
import { cn } from "@/lib/cn";

export const NAV = [
  // 1. TODAY
  { href: "/dashboard", label: "Home", short: "Home", icon: Home, group: "Today" },

  // 2. DAILY WORK
  { href: "/dashboard/replies", label: "Chats", short: "Chats", icon: MessageCircle, group: "Daily work" },
  { href: "/dashboard/orders", label: "Orders", short: "Orders", icon: Package, group: "Daily work" },
  { href: "/dashboard/revenue", label: "Money", short: "Money", icon: IndianRupee, group: "Daily work" },

  // 3. GROW
  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users, group: "Grow" },
  { href: "/dashboard/catalogue", label: "Products", short: "Products", icon: Tag, group: "Grow" },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: Megaphone, group: "Grow" },
  { href: "/dashboard/templates", label: "Templates", short: "Templates", icon: FileText, group: "Grow" },

  // 4. UNDERSTAND
  { href: "/dashboard/report", label: "Reports", short: "Reports", icon: BarChart3, group: "Understand" },

  // 5. ACCOUNT
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings, group: "Account" },
];

export const EXTRA_NAV = [
  { href: "/dashboard/notifications", label: "Notifications", short: "Alerts", icon: Bell, group: "Today" },
  { href: "/dashboard/refills", label: "Reorders", short: "Reorders", icon: Clock, group: "Daily work" },
  { href: "/dashboard/calls", label: "Calls", short: "Calls", icon: Phone, group: "Daily work" },
  { href: "/dashboard/messages", label: "Message log", short: "Log", icon: MessageSquareText, group: "Grow" },
];

const ADMIN_NAV = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building2, group: "Account" }];

/** Thabaal wallet: admins, and clients billed through the wallet. */
const WALLET_NAV = [{ href: "/dashboard/wallet", label: "Wallet", short: "Wallet", icon: Wallet, group: "Account" }];

/**
 * Phone tabs: what each role opens most. Staff pack orders and answer customers all day;
 * owners and managers start from the overview. Everything else is under "More".
 * This only changes which links come first, never what anyone can open.
 */
const PHONE_TABS = {
  staff: ["/dashboard/orders", "/dashboard/replies", "/dashboard/customers"],
  manager: ["/dashboard", "/dashboard/replies", "/dashboard/orders", "/dashboard/customers"],
};

export type NavRole = keyof typeof PHONE_TABS;
type Counts = { openReplies?: number; newOrders?: number; unreadNotifications?: number };

function CountBadge({ n, label, className }: { n?: number; label: string; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("tabular grid h-[18px] min-w-[20px] place-items-center rounded-full px-1.5 text-[11.5px] font-bold", className)}>
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
  showWallet = false,
  disabledSections,
  openReplies,
  newOrders,
  unreadNotifications,
}: { isAdmin: boolean; showWallet?: boolean; disabledSections?: readonly string[] } & Counts) {
  const path = usePathname();
  const router = useRouter();
  const enabledNav = NAV.filter((n) => isHrefEnabled(n.href, disabledSections));
  const items = [...enabledNav, ...(isAdmin || showWallet ? WALLET_NAV : []), ...(isAdmin ? ADMIN_NAV : [])];
  const groups = [...new Set(items.map((n) => n.group))];

  useEffect(() => {
    if (!isHrefEnabled(path, disabledSections)) {
      router.replace("/dashboard");
    }
  }, [path, disabledSections, router]);

  return (
    <nav aria-label="Main" className="space-y-4">
      {groups.map((g) => (
        <div key={g} role="group" aria-labelledby={`nav-${g}`}>
          <p id={`nav-${g}`} className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted/80 dark:text-white/40">{g}</p>
          <ul className="space-y-1">
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
                        "group relative flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[14.5px] transition",
                        active
                          ? "bg-[#FFC329] text-[#10283B] font-semibold"
                          : "text-[#10283B] hover:bg-[#FFF3D6] dark:text-[#FFF9F0] dark:hover:bg-[#1B3B52] font-medium",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[19px] shrink-0 transition-colors",
                          active
                            ? "text-[#10283B]"
                            : "text-[#5A6B7B] group-hover:text-[#10283B] dark:text-[#A8BACA] dark:group-hover:text-[#FFF9F0]",
                        )}
                        strokeWidth={2}
                      />
                      <span className="flex-1 truncate">{label}</span>
                      {count && (
                        <CountBadge
                          n={count.n}
                          label={count.label}
                          className={active ? "bg-[#10283B] text-[#FFC329]" : "bg-[#C0412A] text-white shadow-xs"}
                        />
                      )}
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
  showWallet = false,
  role,
  disabledSections,
  openReplies,
  newOrders,
  unreadNotifications,
}: { isAdmin: boolean; showWallet?: boolean; role: NavRole; disabledSections?: readonly string[] } & Counts) {
  const path = usePathname();
  // Remembers the page "More" was opened on, so the sheet closes by itself once a tapped page opens.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === path;
  const enabledNav = NAV.filter((n) => isHrefEnabled(n.href, disabledSections));
  const all = [...enabledNav, ...(isAdmin || showWallet ? WALLET_NAV : []), ...(isAdmin ? ADMIN_NAV : [])];

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
    cn(
      "flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium leading-tight transition active:scale-95 sm:h-16 sm:text-xs",
      active ? "text-[#10283B] font-bold dark:text-[#FFC329]" : "text-[#5A6B7B] hover:text-[#10283B] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0]",
    );

  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-[#EADFCB] bg-[#FFF9F0]/95 backdrop-blur-md dark:bg-[#0B1E2D]/95 dark:border-[#27465C] lg:hidden print:hidden">
      <ul
        className="mx-auto grid max-w-lg"
        style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}
      >
        {tabItems.map(({ href, short, icon: Icon }) => {
          const active = isActive(path, href);
          const count = countFor(href, { openReplies, newOrders, unreadNotifications });
          return (
            <li key={href} className="min-w-0">
              <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <span className="relative">
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-5 transition-colors",
                      active
                        ? "text-[#10283B] dark:text-[#FFC329]"
                        : "text-[#5A6B7B] dark:text-[#A8BACA]",
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                  {count && count.n !== undefined && count.n > 0 && (
                    <span className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#C0412A] px-1 text-[9px] font-bold text-white shadow-xs">
                      {count.n > 99 ? "99+" : count.n}
                    </span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{short}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button type="button" onClick={() => setOpenedOn(path)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn(tabClass(moreActive), "w-full")}>
            <span className="relative">
              <Menu
                aria-hidden="true"
                className={cn(
                  "size-5 transition-colors",
                  moreActive
                    ? "text-[#10283B] dark:text-[#FFC329]"
                    : "text-[#5A6B7B] dark:text-[#A8BACA]",
                )}
                strokeWidth={moreActive ? 2.2 : 1.8}
              />
              {hiddenCount > 0 && (
                <span className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-[#C0412A] px-1 text-[9px] font-bold text-white shadow-xs">
                  {hiddenCount > 99 ? "99+" : hiddenCount}
                </span>
              )}
            </span>
            <span>More</span>
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
                    "flex h-12 items-center gap-2.5 rounded-xl border px-3 text-xs font-medium transition active:scale-[0.98] sm:h-14 sm:gap-3 sm:px-3.5 sm:text-sm",
                    active ? "border-[#FFC329] bg-[#FFC329]/15 text-[#10283B] font-semibold dark:bg-[#FFC329]/20 dark:text-[#FFC329]" : "border-line bg-panel text-ink active:bg-sunken",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-5 shrink-0 transition-colors",
                      active ? "text-[#10283B] dark:text-[#FFC329]" : "text-muted",
                    )}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
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
  fields: "Custom fields",
};

/**
 * Computers' top bar: the workspace, then the section and any sub-page, so a deep page always
 * says where it is. Sections link back; the current page doesn't.
 */
export function TopbarTrail({ workspace }: { workspace: string }) {
  const path = usePathname();
  const all = [...NAV, ...EXTRA_NAV, ...WALLET_NAV, ...ADMIN_NAV];
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
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl transition active:scale-95 sm:size-11",
        active ? "bg-sunken text-ink dark:bg-white/15 dark:text-white" : "text-muted hover:text-ink dark:text-white/80 dark:hover:bg-white/10",
      )}
    >
      <Settings aria-hidden="true" className="size-5" strokeWidth={1.8} />
    </Link>
  );
}
