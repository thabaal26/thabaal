"use client";

import {
  BarChart3,
  Building2,
  Home,
  IndianRupee,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Tag,
  Users,
  Wallet,
  type IconComponent,
} from "@/components/icons";
import Link from "@/components/intent-link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/sheet";
import { isHrefEnabled } from "@/lib/client-sections";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: IconComponent;
  group: string;
  /** Pages that live under this item (opened from its tabs), so it stays highlighted there. */
  also?: string[];
};

/** The menu: five groups, in the order a working day goes. */
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Home", short: "Home", icon: Home, group: "Today" },

  { href: "/dashboard/replies", label: "Chats", short: "Chats", icon: MessageCircle, group: "Daily work", also: ["/dashboard/calls"] },
  { href: "/dashboard/orders", label: "Orders", short: "Orders", icon: Package, group: "Daily work" },
  { href: "/dashboard/revenue", label: "Money", short: "Money", icon: IndianRupee, group: "Daily work" },

  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users, group: "Grow", also: ["/dashboard/refills"] },
  { href: "/dashboard/catalogue", label: "Products", short: "Products", icon: Tag, group: "Grow" },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: Megaphone, group: "Grow", also: ["/dashboard/templates", "/dashboard/messages"] },

  { href: "/dashboard/report", label: "Reports", short: "Reports", icon: BarChart3, group: "Understand" },

  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings, group: "Account" },
];

const ADMIN_NAV: NavItem[] = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building2, group: "Account" }];

/** Thabaal wallet: admins, and clients billed through the wallet. */
const WALLET_NAV: NavItem[] = [{ href: "/dashboard/wallet", label: "Wallet", short: "Wallet", icon: Wallet, group: "Account" }];

/**
 * Phone tabs: what each role opens most. Staff pack orders and answer customers all day;
 * owners and managers start from Home. Everything else is under "More".
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

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
function isActive(path: string, item: Pick<NavItem, "href" | "also">) {
  if (item.href === "/dashboard") return path === "/dashboard";
  return under(path, item.href) || Boolean(item.also?.some((a) => under(path, a)));
}

const countFor = (href: string, c: Counts) =>
  href === "/dashboard/replies"
    ? { n: c.openReplies, label: "open chats" }
    : href === "/dashboard/orders"
      ? { n: c.newOrders, label: "orders to handle" }
      : null;

function menuItems(isAdmin: boolean, showWallet: boolean, disabledSections?: readonly string[]) {
  return [...NAV.filter((n) => isHrefEnabled(n.href, disabledSections)), ...(isAdmin || showWallet ? WALLET_NAV : []), ...(isAdmin ? ADMIN_NAV : [])];
}

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
  const items = menuItems(isAdmin, showWallet, disabledSections);
  const groups = [...new Set(items.map((n) => n.group))];

  // A section switched off for this client: leave it for Home.
  useEffect(() => {
    if (!isHrefEnabled(path, disabledSections)) router.replace("/dashboard");
  }, [path, disabledSections, router]);

  return (
    <nav aria-label="Main" className="space-y-4">
      {groups.map((g) => (
        <div key={g} role="group" aria-labelledby={`nav-${g}`}>
          <p id={`nav-${g}`} className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-muted">
            {g}
          </p>
          <ul className="space-y-1">
            {items
              .filter((n) => n.group === g)
              .map((item) => {
                const { href, label, icon: Icon } = item;
                const active = isActive(path, item);
                const count = countFor(href, { openReplies, newOrders, unreadNotifications });
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[14.5px] transition",
                        active ? "bg-brand font-semibold text-on-brand" : "font-medium text-ink hover:bg-brand-soft",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-[19px] shrink-0 transition-colors", active ? "text-on-brand" : "text-muted group-hover:text-ink")} />
                      <span className="flex-1 truncate">{label}</span>
                      {count && <CountBadge n={count.n} label={count.label} className={active ? "bg-on-brand text-brand" : "bg-danger-solid text-white"} />}
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
  const all = menuItems(isAdmin, showWallet, disabledSections);

  // Up to 4 tabs: the role's favourites first, then other enabled sections if some are switched off.
  const preferred = PHONE_TABS[role].filter((href) => all.some((n) => n.href === href));
  const fallback = all.map((n) => n.href).filter((href) => href !== "/dashboard/settings" && !preferred.includes(href));
  const tabs = [...preferred, ...fallback].slice(0, 4);
  const tabItems = tabs.map((t) => all.find((n) => n.href === t)).filter((x): x is NavItem => Boolean(x));

  const more = all.filter((n) => !tabs.includes(n.href));
  const moreActive = more.some((n) => isActive(path, n));
  // Counts for sections that live under "More" show on the More tab too.
  const hiddenCount = more.reduce((sum, n) => sum + (countFor(n.href, { openReplies, newOrders, unreadNotifications })?.n ?? 0), 0);

  const tabClass = (active: boolean) =>
    cn(
      "flex h-14 min-w-0 flex-col items-center justify-center gap-1 text-[10.5px] leading-tight transition active:scale-95 sm:h-16 sm:text-xs",
      active ? "font-bold text-ink dark:text-brand" : "font-medium text-muted hover:text-ink",
    );
  const dot = "absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger-solid px-1 text-[9px] font-bold text-white";

  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 backdrop-blur-md lg:hidden print:hidden">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${tabItems.length + 1}, minmax(0, 1fr))` }}>
        {tabItems.map((item) => {
          const { href, short, icon: Icon } = item;
          const active = isActive(path, item);
          const count = countFor(href, { openReplies, newOrders, unreadNotifications });
          return (
            <li key={href} className="min-w-0">
              <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                <span className="relative">
                  <Icon aria-hidden className={cn("size-5 transition-colors", active ? "text-ink dark:text-brand" : "text-muted")} />
                  {count?.n ? (
                    <span className={dot}>
                      {count.n > 99 ? "99+" : count.n}
                      <span className="sr-only"> {count.label}</span>
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-0.5">{short}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button type="button" onClick={() => setOpenedOn(path)} aria-haspopup="dialog" aria-expanded={moreOpen} className={cn(tabClass(moreActive), "w-full")}>
            <span className="relative">
              <Menu aria-hidden className={cn("size-5 transition-colors", moreActive ? "text-ink dark:text-brand" : "text-muted")} />
              {hiddenCount > 0 && <span className={dot}>{hiddenCount > 99 ? "99+" : hiddenCount}</span>}
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onClose={() => setOpenedOn(null)} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {more.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = isActive(path, item);
            const count = countFor(href, { openReplies, newOrders, unreadNotifications });
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-12 items-center gap-2.5 rounded-xl border px-3 text-xs font-medium transition active:scale-[0.98] sm:h-14 sm:gap-3 sm:px-3.5 sm:text-sm",
                    active ? "border-brand bg-brand-soft font-semibold text-ink" : "border-line bg-panel text-ink active:bg-sunken",
                  )}
                >
                  <Icon aria-hidden className={cn("size-5 shrink-0", active ? "text-ink" : "text-muted")} />
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
        active ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink",
      )}
    >
      <Settings aria-hidden className="size-5" />
    </Link>
  );
}
