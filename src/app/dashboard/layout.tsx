import { LogOut } from "@/components/icons";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CallWidget } from "@/components/call-widget";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { getScope, owned, ownedMessages, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { nightColor, themeCss, themeStyle } from "@/lib/theme";
import { logout } from "../login/actions";
import { ClientSwitcher, HeaderClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav, TopbarTrail, type NavRole } from "./nav";
import { NotificationBell, NotificationProvider } from "@/components/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconPackSync } from "@/components/icon-pack-sync";
import { iconPackOf } from "@/lib/icon-pack";

/** The client whose look the dashboard wears: a client login's own, or the one an admin picked. */
async function brandedClient() {
  const scope = await getScope();
  return scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const client = await brandedClient();
  const defaultIcons = {
    icon: [
      { url: "/icon", type: "image/png", sizes: "512x512" },
      { url: "/brands/thabaal/mark.png", type: "image/png" },
    ],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
  if (!client) {
    return {
      title: { default: "Thabaal · Customer Messaging", template: "%s · Thabaal" },
      icons: defaultIcons,
      appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "black-translucent" },
    };
  }
  return {
    title: { default: `Thabaal · ${client.name}`, template: `%s · ${client.name} · Thabaal` },
    manifest: `/api/manifest/${client.id}`,
    icons: defaultIcons,
    appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "black-translucent" },
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
  const [settings, client, clients, rawOpenReplies, rawNewOrders] = await Promise.all([
    getSettings(),
    brandedClient(),
    scope.isAdmin ? db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.reply.groupBy({ by: ["customerId"], where: { handled: false, ...ownedMessages(scope) } }).then((g) => g.length),
    db.order.count({ where: { status: { in: ["NEW", "PAID"] }, ...owned(scope) } }).catch(() => 0),
  ]);

  const disabledSections = client?.disabledSections ?? [];
  const ordersOn = isSectionEnabled(disabledSections, "orders");
  const repliesOn = isSectionEnabled(disabledSections, "replies");
  const callsOn = isSectionEnabled(disabledSections, "calls");
  const notificationsOn = isSectionEnabled(disabledSections, "notifications");

  const openReplies = repliesOn ? rawOpenReplies : 0;
  const newOrders = ordersOn ? rawNewOrders : 0;
  const unreadNotifications = openReplies + newOrders;

  const iconPack = iconPackOf(client?.iconPack);
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

  return (
    <NotificationProvider initialUnreadCount={unreadNotifications}>
      <div style={themeStyle(client)} className="min-h-dvh w-full overflow-x-clip bg-canvas lg:pl-64 print:bg-white print:pl-0 lg:print:pl-0">
        {client && themeCss(client) && <style>{themeCss(client)}</style>}
        {/* Set the icon pack before anything paints, so the other pack never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.icons=${JSON.stringify(iconPack)}` }} />
        <IconPackSync pack={iconPack} />
        <a href="#main" className="sr-only z-[70] rounded-control bg-panel px-4 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>

        <aside className="surface-dark fixed inset-y-0 left-0 z-40 hidden w-64 transform-gpu flex-col overflow-hidden border-r border-white/[0.08] bg-night lg:flex print:!hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,rgb(22_125_99/0.22),transparent_55%),radial-gradient(90%_50%_at_100%_100%,rgb(234_191_38/0.1),transparent_60%)]" />
          <div className="relative flex h-16 shrink-0 items-center gap-3 border-b border-white/[0.06] px-4">
            <BrandMark logoUrl={client?.logoUrl} name={name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{name}</p>
              <p className="truncate text-xs text-white/60">{subtitle}</p>
            </div>
          </div>
          {scope.isAdmin && (
            <div className="relative shrink-0 px-3 pt-2.5 pb-1">
              <ClientSwitcher clients={clients} current={scope.clientId} dark />
            </div>
          )}
          <div className="thin-scroll relative min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(255_255_255/0.15)_transparent]">
            <SideNav
              isAdmin={scope.isAdmin}
              disabledSections={disabledSections}
              openReplies={openReplies}
              newOrders={newOrders}
              unreadNotifications={unreadNotifications}
            />
          </div>
          <div className="relative shrink-0 space-y-3 border-t border-white/[0.08] bg-black/15 p-3">
            {status && <div className="px-1 text-xs">{status}</div>}
            <div className="flex items-center gap-2.5 rounded-control px-1">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-night-2 text-xs font-semibold text-glow ring-1 ring-white/15">
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
        <header className="sticky top-0 z-30 hidden h-16 transform-gpu items-center gap-4 border-b border-line bg-panel px-6 lg:flex xl:px-8 print:!hidden">
          <TopbarTrail workspace={client ? name : scope.isAdmin ? "All clients" : name} />
          <div className="ml-auto flex items-center gap-2">
            {ordersOn && newOrders > 0 && (
              <Link
                href="/dashboard/orders"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning-border bg-warning-bg px-3 text-xs font-semibold text-warning shadow-2xs transition hover:brightness-95"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-warning-solid" />
                <span className="tabular">{newOrders}</span> order{newOrders === 1 ? "" : "s"} to handle
              </Link>
            )}
            {repliesOn && openReplies > 0 && (
              <Link
                href="/dashboard/replies"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand/25 bg-brand-soft px-3 text-xs font-semibold text-brand-deep shadow-2xs transition hover:brightness-95"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-brand" />
                <span className="tabular">{openReplies}</span> open repl{openReplies === 1 ? "y" : "ies"}
              </Link>
            )}
            <ThemeToggle />
            {notificationsOn && <NotificationBell />}
            <span aria-hidden className="mx-1 h-6 w-px bg-line" />
            <Link
              href="/dashboard/settings"
              title="Account settings"
              className="flex min-w-0 items-center gap-2.5 rounded-control py-1 pl-1 pr-2 transition hover:bg-sunken"
            >
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand-deep ring-1 ring-brand/20">
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
            <ThemeToggle onDark />
            {notificationsOn && <NotificationBell dark />}
            <SettingsLink />
          </div>
        </header>

        <main id="main" className="stagger relative mx-auto w-full max-w-page px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-7 print:p-0">
          {children}
        </main>
        {callsOn && scope.canOperate && <CallWidget />}
        <BottomNav
          isAdmin={scope.isAdmin}
          role={role}
          disabledSections={disabledSections}
          openReplies={openReplies}
          newOrders={newOrders}
          unreadNotifications={unreadNotifications}
        />
      </div>
    </NotificationProvider>
  );
}
