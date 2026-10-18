import type { Metadata, Viewport } from "next";
import Link from "@/components/intent-link";
import { cache } from "react";
import { CallWidget } from "@/components/call-widget";
import { isSectionEnabled } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { getScope, owned, ownedMessages, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { themeCss, themeStyle } from "@/lib/theme";
import { ClientSwitcher, HeaderClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav, type NavRole } from "./nav";
import { WalletBanner } from "./wallet/wallet-banner";
import { NotificationBell, NotificationProvider } from "@/components/notification-center";
import { ShellProvider } from "@/components/shell-tools";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitch, LanguageToggle } from "@/lib/i18n/language-switch";
import { AppearanceSync } from "@/components/appearance-sync";
import { IconSetLink } from "@/components/icon-set-link";
import { InlineScript } from "@/components/inline-script";
import "./portal.css";
import { appearanceAttrs, appearanceDataset, appearanceScript, resolveAppearance } from "@/lib/appearance";

/** The client whose look the dashboard wears: a client login's own, or the one an admin picked.
    Read once per request (the metadata and the layout both need it). */
const brandedClient = cache(async () => {
  const scope = await getScope();
  return scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null;
});

export async function generateMetadata(): Promise<Metadata> {
  const client = await brandedClient();
  const icons = {
    icon: [
      { url: "/icon", type: "image/png", sizes: "512x512" },
      { url: "/brands/thabaal/mark.png", type: "image/png" },
    ],
    shortcut: "/icon",
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
  const common = { applicationName: "Thabaal", manifest: "/manifest.webmanifest", icons, appleWebApp: { capable: true, title: "Thabaal", statusBarStyle: "default" as const } };
  return client
    ? { ...common, title: { default: `Thabaal · ${client.name}`, template: `%s · ${client.name} · Thabaal` } }
    : { ...common, title: { default: "Thabaal · Customer Messaging", template: "%s · Thabaal" } };
}

export async function generateViewport(): Promise<Viewport> {
  // The cream top bar; the theme script switches it to the dark canvas when dark mode is on.
  return { themeColor: "#FFF9F0" };
}

/** Thabaal's mark and name: the product's own brand, top left of every page. */
function Logo({ size }: { size: "sm" | "md" }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Thabaal home"
      className={`flex shrink-0 items-center gap-2 transition hover:opacity-90 ${size === "md" ? "-translate-x-1.5" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brands/thabaal/artifact-logo.png"
        alt=""
        width={40}
        height={22}
        data-keep
        className={`h-auto dark:[filter:drop-shadow(0_0_0.6px_#fff)_drop-shadow(0_0_1.2px_rgb(255_255_255/0.55))] ${size === "md" ? "w-11" : "w-9"}`}
      />
      {/* The same drawn wordmark as the sign-in page (dark letters by day, white at night), not typed text. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brands/thabaal/w-day.png"
        alt="thabaal"
        width={900}
        height={252}
        data-keep
        className={`w-auto dark:hidden ${size === "md" ? "h-7" : "h-6"}`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brands/thabaal/w-night.png"
        alt="thabaal"
        width={900}
        height={252}
        data-keep
        className={`hidden w-auto dark:block ${size === "md" ? "h-7" : "h-6"}`}
      />
    </Link>
  );
}

/** The client's own logo (white-label), or its initials. */
function ClientMark({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied path or URL of any size
    return <img src={logoUrl} alt="" data-keep className="size-8 shrink-0 rounded-control object-cover ring-1 ring-line" />;
  }
  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return <span className="grid size-8 shrink-0 place-items-center rounded-control bg-brand-soft text-xs font-bold text-ink ring-1 ring-line">{initials}</span>;
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await requireUser();
  const scope = await getScope();
  const [settings, client, sender, clients, rawOpenReplies, rawOrdersToHandle, rawPaymentsToCheck] = await Promise.all([
    getSettings(),
    brandedClient(),
    scope.clientId ? senderFor(scope.clientId) : null,
    scope.isAdmin ? db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.reply.groupBy({ by: ["customerId"], where: { handled: false, ...ownedMessages(scope) } }).then((g) => g.length),
    // New orders to confirm plus confirmed or paid ones to pack: the same work Home and Orders count.
    db.order.count({ where: { status: { in: ["NEW", "CONFIRMED", "PAID"] }, ...owned(scope) } }).catch(() => 0),
    // Payments that need someone: customers who say they paid (check the bank), and refunds still due.
    db.order
      .count({
        where: {
          ...owned(scope),
          OR: [
            { paidAt: null, paymentClaimedAt: { not: null }, status: { not: "CANCELLED" } },
            { status: "CANCELLED", refundedAt: null, OR: [{ paidAt: { not: null } }, { paidAmount: { gt: 0 } }] },
          ],
        },
      })
      .catch(() => 0),
  ]);

  const disabledSections = client?.disabledSections ?? [];
  const ordersOn = isSectionEnabled(disabledSections, "orders");
  const repliesOn = isSectionEnabled(disabledSections, "replies");
  const callsOn = isSectionEnabled(disabledSections, "calls");
  const notificationsOn = isSectionEnabled(disabledSections, "notifications");

  const openReplies = repliesOn ? rawOpenReplies : 0;
  const ordersToHandle = ordersOn ? rawOrdersToHandle : 0;
  const unreadNotifications = openReplies + ordersToHandle;
  const paymentsToCheck = ordersOn ? rawPaymentsToCheck : 0;

  const look = resolveAppearance(settings.appearance, client);
  const lookData = appearanceDataset(look);
  const name = client?.name ?? (scope.isAdmin ? "All clients" : "Thabaal");
  const via = settings.provider === "LOCAL" ? "Local session" : "Meta Cloud API";
  const live = !isSimulated(settings, client && sender ? sender.cfg : undefined);
  // A client without its own number: say so plainly (to the client too), never "demo mode".
  const notConnected = settings.provider === "META" && Boolean(client) && Boolean(sender?.cfg.notConnected);

  const role: NavRole = !scope.isAdmin && scope.canOperate && !scope.canManage ? "staff" : "manager";

  // The real connection state, in plain words. Setup details are the admin's to fix.
  const dotLine = (tone: "ok" | "warn", text: string) => (
    <span className={`flex min-w-0 items-center gap-1.5 font-medium ${tone === "ok" ? "text-ink-2" : "text-warning"}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${tone === "ok" ? "bg-success-solid" : "bg-warning-solid"}`} />
      <span className="truncate">{text}</span>
    </span>
  );
  const status = notConnected
    ? dotLine("warn", scope.isAdmin ? "WhatsApp not connected: add this client's number" : "WhatsApp not connected yet")
    : live
      ? dotLine("ok", scope.isAdmin && !client ? `Sending via ${via}` : "WhatsApp connected")
      : scope.isAdmin
        ? dotLine("warn", `Demo mode · ${via} not set up`)
        : null;

  return (
    <NotificationProvider initialUnreadCount={unreadNotifications}>
      <ShellProvider notifications={notificationsOn}>
        <div {...appearanceAttrs(look)} style={themeStyle(client)} className="min-h-dvh w-full overflow-x-clip bg-canvas lg:flex lg:items-start lg:gap-3 lg:bg-desk lg:p-3 print:bg-white print:p-0">
          {client && themeCss(client) && <style>{themeCss(client)}</style>}
          {/* The portal's look (Settings → Appearance, or this client's own): set on <html> before
              anything paints, so sheets and dialogs wear it too. */}
          <IconSetLink set={lookData.iconset} />
          <InlineScript html={appearanceScript(lookData)} />
          <AppearanceSync data={lookData} />
          <a href="#main" className="sr-only z-[70] rounded-control bg-panel px-4 py-2 text-sm font-medium text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
            Skip to content
          </a>

          {/* Computers: two floating bars on a darker backdrop. The menu (white) stays pinned while the
              page bar (cream) scrolls with the window, so sticky headers and pinned buttons keep working. */}
          <aside className="sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-[248px] shrink-0 flex-col overflow-hidden rounded-[22px] border border-line bg-panel shadow-float lg:flex print:!hidden">
            <div className="flex h-[72px] shrink-0 items-center justify-center border-b border-line px-5">
              <Logo size="md" />
            </div>
            {scope.isAdmin && (
              <div className="shrink-0 px-3 pb-1 pt-3">
                <ClientSwitcher clients={clients} current={scope.clientId} />
              </div>
            )}
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <SideNav
                isAdmin={scope.isAdmin}
                showWallet={client?.billingMode === "wallet"}
                disabledSections={disabledSections}
                openReplies={openReplies}
                newOrders={ordersToHandle}
                unreadNotifications={unreadNotifications}
                paymentsToCheck={paymentsToCheck}
              />
              <Link href="/dashboard/guide" className="mt-4 block px-3 text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline">
                What changed in this menu
              </Link>
            </div>
            <div className="shrink-0 border-t border-line p-3 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-2xs font-semibold text-muted">மொழி / Lang</span>
                <LanguageSwitch size="sm" />
              </div>
              <Link href="/dashboard/settings" className="flex items-center gap-2.5 rounded-xl p-2 transition hover:bg-sunken">
                <ClientMark logoUrl={client?.logoUrl} name={name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{name}</span>
                  {status && <span className="block text-[12px]">{status}</span>}
                </span>
              </Link>
            </div>
          </aside>

          {/* Phones and tablets: a slim top bar with the logo, the business and quick controls. */}
          <header className="sticky top-0 z-30 w-full border-b border-line bg-canvas/95 pt-[env(safe-area-inset-top)] text-ink backdrop-blur-md lg:hidden print:hidden">
            <div className="flex h-14 items-center gap-1.5 pl-3 pr-1.5 sm:gap-3 sm:pl-4 sm:pr-2">
              <Logo size="sm" />
              {scope.isAdmin ? (
                <HeaderClientSwitcher clients={clients} current={scope.clientId} title={client ? name : "All clients"}>
                  <span className="block text-2xs leading-tight">{status}</span>
                </HeaderClientSwitcher>
              ) : (
                // Under 360px there's no room for a readable name next to the controls; the page title has it.
                <div className="min-w-0 flex-1 text-right [@media(max-width:359px)]:invisible">
                  <p className="truncate text-xs font-semibold leading-tight text-ink">{name}</p>
                  {status && <div className="flex justify-end text-2xs leading-tight">{status}</div>}
                </div>
              )}
              {/* 40px tap targets on phones; the light/dark switch lives in Settings there, to leave room for the name. */}
              <LanguageSwitch size="sm" className="h-11 shrink-0 max-sm:hidden [&>button]:min-h-10 [&>button]:min-w-10" />
              <LanguageToggle className="sm:hidden" />
              <ThemeToggle className="max-sm:hidden" />
              {notificationsOn && <NotificationBell className="max-sm:size-10" />}
              <SettingsLink />
            </div>
          </header>

          <div className="min-w-0 flex-1 lg:min-h-[calc(100dvh-1.5rem)] lg:rounded-[22px] lg:border lg:border-line lg:bg-canvas lg:shadow-float print:border-0 print:shadow-none">
            <main
              id="main"
              className="stagger relative mx-auto w-full max-w-page px-3.5 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3.5 sm:px-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pt-6 lg:px-8 lg:pb-12 lg:pt-7 print:p-0"
            >
              {/* Every page sits in the portal design (portal.css); pages built from it add their own frame. */}
              <div className="thabaal-portal">
                <div className="wrapin">
                  {client?.billingMode === "wallet" && <WalletBanner clientId={client.id} lowAlert={client.walletLowAlert} />}
                  {children}
                </div>
              </div>
            </main>
          </div>
          {callsOn && scope.canOperate && <CallWidget />}
          <BottomNav
            isAdmin={scope.isAdmin}
            showWallet={client?.billingMode === "wallet"}
            role={role}
            disabledSections={disabledSections}
            openReplies={openReplies}
            newOrders={ordersToHandle}
            unreadNotifications={unreadNotifications}
            paymentsToCheck={paymentsToCheck}
          />
        </div>
      </ShellProvider>
    </NotificationProvider>
  );
}
