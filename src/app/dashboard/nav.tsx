"use client";

import { Building2, CalendarClock, LayoutDashboard, MessagesSquare, Settings, SquarePen, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const NAV = [
  { href: "/dashboard", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/dashboard/messages", label: "Message log", short: "Log", icon: MessagesSquare },
  { href: "/dashboard/campaigns", label: "Campaigns", short: "Campaigns", icon: CalendarClock },
  { href: "/dashboard/templates", label: "Templates", short: "Templates", icon: SquarePen },
  { href: "/dashboard/customers", label: "Customers", short: "Customers", icon: Users },
  { href: "/dashboard/settings", label: "Settings", short: "Settings", icon: Settings },
];

const ADMIN_NAV = [{ href: "/dashboard/clients", label: "Clients", short: "Clients", icon: Building2 }];

function isActive(path: string, href: string) {
  return href === "/dashboard" ? path === href : path.startsWith(href);
}

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
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
          <Icon className={cn("size-4", isActive(path, href) && "text-emerald-400")} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone tab bar: the five everyday sections, within thumb reach. Settings lives in the top bar. */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.slice(0, 5).map(({ href, short, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95", active ? "text-brand-deep" : "text-muted")}
            >
              <span className={cn("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-brand-soft")}>
                <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
              </span>
              {short}
            </Link>
          );
        })}
      </div>
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
