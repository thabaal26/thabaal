"use client";

import { Building2, CalendarClock, Inbox, LayoutDashboard, Menu, MessagesSquare, Settings, ShoppingBag, SquarePen, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/components/sheet";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/dashboard/replies", label: "Replies", short: "Replies", icon: Inbox },
  { href: "/dashboard/orders", label: "Orders", short: "Orders", icon: ShoppingBag },
  { href: "/dashboard/messages", label: "Message log", short: "Log", icon: MessagesSquare },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: CalendarClock },
  { href: "/dashboard/templates", label: "Templates", short: "Templates", icon: SquarePen },
  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users },
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings },
];

const ADMIN_NAV = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building2 }];
/** Phone tabs: what people check most. Everything else is under "More". */
const PHONE_TABS = ["/dashboard", "/dashboard/replies", "/dashboard/customers", "/dashboard/campaigns"];

function CountBadge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-glow px-1 text-[10px] font-bold text-night", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

function isActive(path: string, href: string) {
  return href === "/dashboard" ? path === href : path.startsWith(href);
}

export function SideNav({ isAdmin, openReplies, newOrders }: { isAdmin: boolean; openReplies?: number; newOrders?: number }) {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {[...NAV, ...(isAdmin ? ADMIN_NAV : [])].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
            isActive(path, href) ? "bg-white/10 font-medium text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
          )}
        >
          <Icon className={cn("size-4", isActive(path, href) && "text-glow")} />
          <span className="flex-1">{label}</span>
          {href === "/dashboard/replies" && <CountBadge n={openReplies} />}
          {href === "/dashboard/orders" && <CountBadge n={newOrders} />}
        </Link>
      ))}
    </nav>
  );
}

/** Phone tab bar: a floating frosted bar with the everyday sections within thumb reach, and "More" for the rest. */
export function BottomNav({ isAdmin, openReplies, newOrders }: { isAdmin: boolean; openReplies?: number; newOrders?: number }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const more = [...NAV, ...(isAdmin ? ADMIN_NAV : [])].filter((n) => !PHONE_TABS.includes(n.href));
  const moreActive = more.some((n) => isActive(path, n.href));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-[1.4rem] border border-white/60 bg-white/80 shadow-[0_10px_40px_-12px_rgb(15_26_23/0.35)] ring-1 ring-black/5 backdrop-blur-xl backdrop-saturate-150 lg:hidden print:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1">
        {PHONE_TABS.map((tab) => NAV.find((n) => n.href === tab)!).map(({ href, short, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95", active ? "text-brand-deep" : "text-muted")}
            >
              <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition", active && "bg-brand-soft")}>
                <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                {href === "/dashboard/replies" && <CountBadge n={openReplies} className="absolute -right-0.5 -top-1 ring-2 ring-white" />}
                {href === "/dashboard/orders" && <CountBadge n={newOrders} className="absolute -right-0.5 -top-1 ring-2 ring-white" />}
              </span>
              {short}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={cn("flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95", moreActive ? "text-brand-deep" : "text-muted")}
        >
          <span className={cn("relative grid h-7 w-12 place-items-center rounded-full transition", moreActive && "bg-brand-soft")}>
            <Menu className="size-[18px]" strokeWidth={moreActive ? 2.4 : 2} />
            <CountBadge n={newOrders} className="absolute -right-0.5 -top-1 ring-2 ring-white" />
          </span>
          More
        </button>
      </div>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="grid grid-cols-2 gap-2">
          {more.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex h-14 items-center gap-3 rounded-2xl px-4 text-sm font-medium ring-1 ring-line transition active:scale-[0.98]",
                  isActive(path, href) ? "bg-brand-soft text-brand-deep ring-brand/30" : "bg-panel text-ink hover:bg-canvas",
                )}
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex-1">{label}</span>
                {href === "/dashboard/orders" && <CountBadge n={newOrders} />}
              </Link>
            </li>
          ))}
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
      className={cn("grid size-10 place-items-center rounded-full transition active:scale-95", active ? "bg-white/15 text-white" : "text-white/70")}
    >
      <Settings className="size-5" />
    </Link>
  );
}
