import { LogOut, MessageCircle } from "lucide-react";
import type { Metadata, Viewport } from "next";
import { CallWidget } from "@/components/call-widget";
import { db } from "@/lib/db";
import { getScope, owned, ownedMessages, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { nightColor, themeCss, themeStyle } from "@/lib/theme";
import { logout } from "../login/actions";
import { ClientSwitcher, HeaderClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav, type NavRole } from "./nav";
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
  return { themeColor: nightColor(await brandedClient()) };
}

function BrandMark({ logoUrl, name, size }: { logoUrl?: string | null; name: string; size: "sm" | "md" }) {
  const box = size === "md" ? "size-10 rounded-control" : "size-8 rounded-control";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied path or URL of any size
    return <img src={logoUrl} alt={`${name} logo`} className={`${box} shrink-0 object-cover ring-1 ring-white/15`} />;
  }
  return (
    <span aria-hidden className={`grid ${box} shrink-0 place-items-center bg-brand text-white`}>
      <MessageCircle className={size === "md" ? "size-5" : "size-[18px]"} />
    </span>
  );
}

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
  const name = client?.name ?? "Campaign Portal";
  const subtitle = client?.tagline || (scope.isAdmin ? (client ? "Admin view" : "Admin · all clients") : "WhatsApp campaigns");
  const via = settings.provider === "LOCAL" ? "Local session" : "Meta Cloud API";
  const live = !isSimulated(settings, client ? (await senderFor(client.id)).cfg : undefined);

  const role: NavRole = !scope.isAdmin && scope.canOperate && !scope.canManage ? "staff" : "manager";

  // Clients only see a reassuring "connected" line; setup problems are the admin's to fix.
  const status = live ? (
    <span className="flex min-w-0 items-center gap-1.5 text-glow">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-glow" />
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

        <aside className="surface-dark fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto bg-night px-3 py-5 no-scrollbar lg:flex print:!hidden">
          <div className="mb-6 flex items-center justify-between gap-2 px-2">
            <div className="flex items-center gap-3 min-w-0">
              <BrandMark logoUrl={client?.logoUrl} name={name} size="md" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{name}</p>
                <p className="line-clamp-2 text-xs text-white/70">{subtitle}</p>
              </div>
            </div>
            <NotificationBell dark />
          </div>
          {scope.isAdmin && <div className="mb-5 px-1"><ClientSwitcher clients={clients} current={scope.clientId} dark /></div>}
          <SideNav isAdmin={scope.isAdmin} openReplies={openReplies} newOrders={newOrders} unreadNotifications={unreadNotifications} />
          <div className="mt-auto space-y-3 border-t border-white/10 px-2 pt-4">
            {status && <div className="text-xs">{status}</div>}
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{user.name}</p>
                <p className="truncate text-xs text-white/70">{user.email}</p>
              </div>
              <form action={logout}>
                <button aria-label="Sign out" title="Sign out" className="grid size-9 place-items-center rounded-control text-white/75 transition hover:bg-white/10 hover:text-white">
                  <LogOut aria-hidden className="size-4" />
                </button>
              </form>
            </div>
            {!scope.isAdmin && <p className="text-2xs text-white/55">Powered by Campaign Portal</p>}
          </div>
        </aside>

        <header className="surface-dark sticky top-0 z-30 w-full bg-night pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
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

        <main id="main" className="stagger mx-auto w-full max-w-page px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8 print:p-0">
          {children}
        </main>
        {scope.canOperate && <CallWidget />}
        <BottomNav isAdmin={scope.isAdmin} role={role} openReplies={openReplies} newOrders={newOrders} unreadNotifications={unreadNotifications} />
      </div>
    </NotificationProvider>
  );
}
