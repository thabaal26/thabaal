import { LogOut } from "lucide-react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CallWidget } from "@/components/call-widget";
import { db } from "@/lib/db";
import { getScope, owned, ownedMessages, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { nightColor, themeCss, themeStyle } from "@/lib/theme";
import { logout } from "../login/actions";
import { ClientSwitcher, HeaderClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav, TopbarTrail, type NavRole } from "./nav";
import { NotificationBell, NotificationProvider } from "@/components/notification-center";

/** The client whose look the dashboard wears: a client login's own, or the one an admin picked. */
async function brandedClient() {
  const scope = await getScope();
  return scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const client = await brandedClient();
  if (!client) return {};
  return {
    title: { absolute: `${client.name} · Campaigns`, template: `%s · ${client.name}` },
    manifest: `/api/manifest/${client.id}`,
    ...(client.logoUrl && { icons: { icon: client.logoUrl, apple: client.logoUrl } }),
    appleWebApp: { capable: true, title: client.name, statusBarStyle: "black-translucent" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: nightColor() };
}

function BrandMark({ logoUrl, name, size }: { logoUrl?: string | null; name: string; size: "sm" | "md" }) {
  const box = size === "md" ? "size-9" : "size-8";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied path or URL of any size
    return <img src={logoUrl} alt={`${name} logo`} className={`${box} shrink-0 rounded-control object-cover ring-1 ring-white/15`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brands/thabaal/thabaal-logo-en.png" alt="Thabaal" className={`${box} shrink-0 rounded-control bg-white object-contain p-0.5 ring-1 ring-white/15`} />
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();
  const scope = await getScope();
  const [settings, client, clients, openReplies, newOrders] = await Promise.all([
    getSettings(),
    brandedClient(),
    scope.isAdmin ? db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.reply.count({ where: { handled: false, ...ownedMessages(scope) } }),
    db.order.count({ where: { status: { in: ["NEW", "PAID"] }, ...owned(scope) } }).catch(() => 0), // 0 until the Order table exists (npm run db:push)
  ]);
  const name = client?.name ?? "Thabaal";
  const subtitle = client?.tagline || (scope.isAdmin ? (client ? "Admin view" : "Admin · all clients") : "A message with momentum");
  const via = settings.provider === "LOCAL" ? "Local session" : "Meta Cloud API";
  const live = !isSimulated(settings, client ? (await senderFor(client.id)).cfg : undefined);

  const role: NavRole = !scope.isAdmin && scope.canOperate && !scope.canManage ? "staff" : "manager";

  // Clients only see a reassuring "connected" line; setup problems are the admin's to fix.
  // "Live" means real sending credentials are configured (not demo mode); number health lives on the Overview.
  const status = live ? (
    <span className="flex min-w-0 items-center gap-1.5 text-white/75">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-call-answer" />
      <span className="truncate">{scope.isAdmin ? `Sending via ${via}` : "WhatsApp connected"}</span>
    </span>
  ) : scope.isAdmin ? (
    <span className="flex min-w-0 items-center gap-1.5 text-warning-on-dark">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-warning-on-dark" />
      <span className="truncate">Demo mode · {via} not set up, sends are simulated</span>
    </span>
  ) : null;

  const unreadNotifications = openReplies + newOrders;

  return (
    <NotificationProvider>
      <div style={themeStyle(client)} className="min-h-dvh w-full overflow-x-clip bg-canvas lg:pl-64 print:bg-white print:pl-0 lg:print:pl-0">
        {client && themeCss(client) && <style>{themeCss(client)}</style>}
        <a href="#main" className="sr-only z-[70] rounded-control bg-panel px-4 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>

        <aside className="surface-dark fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/[0.06] bg-night lg:flex print:!hidden">
          <div className="flex h-16 shrink-0 items-center gap-3 px-4">
            <BrandMark logoUrl={client?.logoUrl} name={name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-xs text-white/60">{subtitle}</p>
            </div>
          </div>
          {scope.isAdmin && (
            <div className="shrink-0 px-3 pb-2">
              <ClientSwitcher clients={clients} current={scope.clientId} dark />
            </div>
          )}
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
            <SideNav isAdmin={scope.isAdmin} openReplies={openReplies} newOrders={newOrders} unreadNotifications={unreadNotifications} />
          </div>
          <div className="shrink-0 space-y-3 border-t border-white/[0.06] p-3">
            {status && <div className="px-1 text-xs">{status}</div>}
            <div className="flex items-center gap-2.5 rounded-control px-1">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-night-2 text-xs font-semibold text-white ring-1 ring-white/10">
                {initials(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user.name}</p>
                <p className="truncate text-xs text-white/60">{user.email}</p>
              </div>
              <form action={logout}>
                <button
                  type="submit"
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid size-9 place-items-center rounded-control text-white/70 transition hover:bg-white/10 hover:text-white active:scale-95"
                >
                  <LogOut aria-hidden className="size-4" />
                </button>
              </form>
            </div>
            {!scope.isAdmin && <p className="px-1 text-2xs text-white/50">Powered by Thabaal (தபால்)</p>}
          </div>
        </aside>

        {/* Computers: where you are, and the account controls. Phones use the dark header below. */}
        <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-line bg-panel/95 px-6 backdrop-blur-sm lg:flex xl:px-8 print:!hidden">
          <TopbarTrail workspace={client ? name : scope.isAdmin ? "All clients" : name} />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <span aria-hidden className="mx-2 h-6 w-px bg-line" />
            <Link
              href="/dashboard/settings"
              title="Account settings"
              className="flex min-w-0 items-center gap-2.5 rounded-control py-1 pl-1 pr-2 transition hover:bg-sunken"
            >
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep">
                {initials(user.name)}
              </span>
              <span className="hidden min-w-0 text-left xl:block">
                <span className="block max-w-40 truncate text-sm font-medium leading-tight text-ink">{user.name}</span>
                <span className="block max-w-40 truncate text-xs leading-tight text-muted">{scope.isAdmin ? "Admin" : scope.canManage ? "Manager" : scope.canOperate ? "Staff" : "Viewer"}</span>
              </span>
              <span className="sr-only xl:hidden">{user.name}, account settings</span>
            </Link>
          </div>
        </header>

        <header className="glass-nav surface-dark sticky top-0 z-30 w-full pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
          <div className="flex h-14 items-center gap-3 pl-4 pr-2">
            <BrandMark logoUrl={client?.logoUrl} name={name} size="sm" />
            {scope.isAdmin ? (
              <HeaderClientSwitcher clients={clients} current={scope.clientId} title={client ? name : "All clients"}>
                <span className="block text-2xs leading-tight">{status}</span>
              </HeaderClientSwitcher>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-white">{name}</p>
                <div className="text-2xs leading-tight">{status ?? <span className="block truncate text-white/70">{subtitle}</span>}</div>
              </div>
            )}
            <NotificationBell dark />
            <SettingsLink />
          </div>
        </header>

        <main id="main" className="stagger relative mx-auto w-full max-w-page px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-7 print:p-0">
          {children}
        </main>
        {scope.canOperate && <CallWidget />}
        <BottomNav isAdmin={scope.isAdmin} role={role} openReplies={openReplies} newOrders={newOrders} unreadNotifications={unreadNotifications} />
      </div>
    </NotificationProvider>
  );
}
