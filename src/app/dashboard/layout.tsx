import type { Metadata, Viewport } from "next";
import Link from "@/components/intent-link";
import { cache } from "react";
import { CallWidget } from "@/components/call-widget";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { getScope, owned, ownedMessages, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { nightColor, themeCss, themeStyle } from "@/lib/theme";
import { ClientSwitcher, HeaderClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav, type NavRole } from "./nav";
import { WalletBanner } from "./wallet/wallet-banner";
import { NotificationBell, NotificationProvider } from "@/components/notification-center";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppearanceSync } from "@/components/appearance-sync";
import { IconSetLink } from "@/components/icon-set-link";
import { appearanceAttrs, appearanceDataset, appearanceScript, resolveAppearance } from "@/lib/appearance";

/** The client whose look the dashboard wears: a client login's own, or the one an admin picked.
    Read once per request (the metadata and the layout both need it). */
const brandedClient = cache(async () => {
  const scope = await getScope();
  return scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null;
});

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
      applicationName: "Thabaal",
      manifest: "/manifest.webmanifest",
      icons: defaultIcons,
      appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "black-translucent" },
    };
  }
  return {
    title: { default: `Thabaal · ${client.name}`, template: `%s · ${client.name} · Thabaal` },
    applicationName: "Thabaal",
    manifest: "/manifest.webmanifest",
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
    // A 144 × 48 copy of the logo: it shows at about 36 px wide here (the full one is 146 KB).
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brands/thabaal/thabaal-logo-en-sm.png" alt="Thabaal" width={144} height={48} className={`${box} shrink-0 rounded-control bg-white object-contain p-0.5 ring-1 ring-white/15`} />
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
  const [settings, client, sender, clients, rawOpenReplies, rawNewOrders] = await Promise.all([
    getSettings(),
    brandedClient(),
    scope.clientId ? senderFor(scope.clientId) : null,
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

  const look = resolveAppearance(settings.appearance, client);
  const lookData = appearanceDataset(look);
  const name = client?.name ?? "Thabaal";
  const subtitle = client?.tagline || (scope.isAdmin ? (client ? "Admin view" : "Admin · all clients") : "A message with momentum");
  const via = settings.provider === "LOCAL" ? "Local session" : "Meta Cloud API";
  const live = !isSimulated(settings, client && sender ? sender.cfg : undefined);
  // A client without its own number: say so plainly (to the client too), never "demo mode".
  const notConnected = settings.provider === "META" && Boolean(client) && Boolean(sender?.cfg.notConnected);

  const role: NavRole = !scope.isAdmin && scope.canOperate && !scope.canManage ? "staff" : "manager";

  // Clients only see a reassuring "connected" line; setup problems are the admin's to fix.
  // "Live" means real sending credentials are configured (not demo mode); number health lives on the Overview.
  const status = notConnected ? (
    <span className="flex min-w-0 items-center gap-1.5 text-warning font-medium">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning-solid" />
      <span className="truncate">{scope.isAdmin ? "WhatsApp not connected: add this client's number" : "WhatsApp not connected yet"}</span>
    </span>
  ) : live ? (
    <span className="flex min-w-0 items-center gap-1.5 text-ink-2 dark:text-white/75 font-medium">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
      <span className="truncate">{scope.isAdmin ? `Sending via ${via}` : "WhatsApp connected"}</span>
    </span>
  ) : scope.isAdmin ? (
    <span className="flex min-w-0 items-center gap-1.5 text-warning font-medium">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-warning-solid" />
      <span className="truncate">Demo mode · {via} not set up</span>
    </span>
  ) : null;

  return (
    <NotificationProvider initialUnreadCount={unreadNotifications}>
      <div {...appearanceAttrs(look)} style={themeStyle(client)} className="min-h-dvh w-full overflow-x-clip bg-canvas lg:h-dvh lg:overflow-hidden lg:p-3.5 lg:flex lg:gap-3.5 lg:bg-[#EDE3D2] dark:lg:bg-[#061421] print:h-auto print:overflow-visible print:bg-white print:p-0">
        {client && themeCss(client) && <style>{themeCss(client)}</style>}
        {/* The portal's look (Settings → Appearance, or this client's own): set on <html> before
            anything paints, so sheets and dialogs wear it too. */}
        <IconSetLink set={lookData.iconset} />
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(lookData) }} />
        <AppearanceSync data={lookData} />
        <a href="#main" className="sr-only z-[70] rounded-control bg-panel px-4 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          Skip to content
        </a>

        {/* Floating Left Navigation Bar */}
        <aside className="hidden w-[244px] h-full shrink-0 transform-gpu flex-col overflow-hidden rounded-[24px] border border-[#E4D7C0] bg-[#FFFFFF]/95 shadow-[0_12px_36px_rgba(30,20,10,0.08)] backdrop-blur-xl dark:border-[#23455E] dark:bg-[#0E2638]/95 dark:shadow-[0_18px_48px_rgba(0,0,0,0.55)] dark:ring-1 dark:ring-white/[0.08] lg:flex print:!hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_0%_0%,rgb(255_200_44/0.08),transparent_55%)] dark:bg-[radial-gradient(120%_60%_at_0%_0%,rgb(22_125_99/0.22),transparent_55%),radial-gradient(90%_50%_at_100%_100%,rgb(234_191_38/0.1),transparent_60%)]" />
          <div className="relative flex h-16 shrink-0 items-center px-4">
            <Link href="/dashboard" className="logo flex items-center gap-2.5 px-2 text-decoration-none transition hover:opacity-90">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brands/thabaal/artifact-logo.png"
                alt="thabaal"
                width={40}
                height={22}
                className="w-10 h-auto shrink-0 object-contain"
              />
              <b className="font-display font-semibold text-[22px] tracking-[-0.3px] text-ink dark:text-[#FFF9F0] leading-none">
                thabaal
              </b>
            </Link>
          </div>
          {scope.isAdmin && (
            <div className="relative shrink-0 px-3 pt-2.5 pb-1">
              <ClientSwitcher clients={clients} current={scope.clientId} />
            </div>
          )}
          <div className="thin-scroll relative min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <SideNav
              isAdmin={scope.isAdmin}
              showWallet={client?.billingMode === "wallet"}
              disabledSections={disabledSections}
              openReplies={openReplies}
              newOrders={newOrders}
              unreadNotifications={unreadNotifications}
            />
          </div>
          <div className="relative shrink-0 space-y-2 border-t border-[#E4D7C0]/80 dark:border-[#23455E]/80 bg-[#FAF3E8]/80 dark:bg-[#091C2B]/80 p-4 text-[13px]">
            <div className="flex items-center gap-2 text-[#5A6B7B] dark:text-[#A8BACA] font-medium text-[12.5px]">
              <span className="size-2 rounded-full bg-[#10B981] animate-pulse shrink-0" />
              <span>{scope.isAdmin && notConnected ? "WhatsApp not connected" : "WhatsApp connected"}</span>
            </div>
            <div>
              <Link href="/dashboard/guide" className="text-[#5A6B7B] hover:text-[#10283B] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0] underline text-[12px]">
                What changed in this menu
              </Link>
            </div>
            <div className="text-[11.5px] text-[#8E9CAE] dark:text-white/40">
              Preview · Sample data
            </div>
          </div>
        </aside>

        {/* Mobile Top Header (Hidden on Desktop) */}
        <header className="sticky top-0 z-30 w-full border-b border-[#EADFCB] bg-[#FFF9F0]/95 backdrop-blur-md pt-[env(safe-area-inset-top)] text-ink dark:bg-[#0B1E2D]/95 dark:text-white dark:border-[#27465C] lg:hidden print:hidden">
          <div className="flex h-12 items-center gap-2.5 pl-3 pr-1.5 sm:h-14 sm:gap-3 sm:pl-4 sm:pr-2">
            <Link href="/dashboard" className="logo flex items-center gap-2 shrink-0 text-decoration-none transition hover:opacity-90">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brands/thabaal/artifact-logo.png"
                alt="thabaal"
                width={36}
                height={20}
                className="w-9 h-auto shrink-0 object-contain"
              />
              <b className="font-display font-semibold text-[20px] tracking-[-0.3px] text-ink dark:text-[#FFF9F0] leading-none">
                thabaal
              </b>
            </Link>
            {scope.isAdmin ? (
              <HeaderClientSwitcher clients={clients} current={scope.clientId} title={client ? name : "All clients"}>
                <span className="block text-2xs leading-tight">{status}</span>
              </HeaderClientSwitcher>
            ) : (
              <div className="min-w-0 flex-1 truncate text-right">
                <p className="truncate text-xs font-semibold leading-tight text-ink dark:text-white">{name}</p>
                <div className="text-2xs leading-tight">{status ?? <span className="block truncate text-muted dark:text-white/70">{subtitle}</span>}</div>
              </div>
            )}
            <ThemeToggle />
            {notificationsOn && <NotificationBell />}
            <SettingsLink />
          </div>
        </header>

        {/* Floating Right Main Content Bar */}
        <div className="flex-1 min-w-0 w-full lg:h-full lg:flex lg:flex-col lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-[#E4D7C0] lg:bg-[#FFF9F0]/98 lg:shadow-[0_12px_36px_rgba(30,20,10,0.08)] lg:backdrop-blur-xl dark:lg:border-[#23455E] dark:lg:bg-[#0B1E2D]/98 dark:lg:shadow-[0_18px_48px_rgba(0,0,0,0.55)] dark:lg:ring-1 dark:lg:ring-white/[0.08]">
          <div className="panel-scroll h-full w-full lg:overflow-y-auto overscroll-contain">
            <main id="main" className="stagger relative mx-auto w-full max-w-page px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pt-6 lg:px-7 lg:pb-6 lg:pt-5 print:p-0">
              {client?.billingMode === "wallet" && <WalletBanner clientId={client.id} lowAlert={client.walletLowAlert} />}
              {children}
            </main>
          </div>
        </div>
        {callsOn && scope.canOperate && <CallWidget />}
        <BottomNav
          isAdmin={scope.isAdmin}
          showWallet={client?.billingMode === "wallet"}
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
