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
import { BottomNav, SettingsLink, SideNav } from "./nav";

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
  const box = size === "md" ? "size-10 rounded-xl" : "size-8 rounded-lg";
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- admin-supplied path or URL of any size
    return <img src={logoUrl} alt={`${name} logo`} className={`${box} shrink-0 object-cover ring-1 ring-white/15`} />;
  }
  return (
    <span className={`grid ${box} shrink-0 place-items-center bg-brand text-white`}>
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

  // Clients only see a reassuring "connected" line; setup problems are the admin's to fix.
  const mode = live ? (
    <span className="flex items-center gap-2 text-xs text-glow">
      <span className="size-2 animate-pulse rounded-full bg-glow" />
      {scope.isAdmin ? `Sending via ${via}` : "WhatsApp connected"}
    </span>
  ) : scope.isAdmin ? (
    <span className="flex items-center gap-2 text-xs text-amber-300"><span className="size-2 rounded-full bg-amber-400" />Demo mode · {via} not set up</span>
  ) : null;

  return (
    <div style={themeStyle(client)} className="min-h-dvh overflow-x-clip bg-canvas lg:pl-64 print:bg-white print:pl-0 lg:print:pl-0">
      {client && themeCss(client) && <style>{themeCss(client)}</style>}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-night px-4 py-6 lg:flex print:!hidden">
        <div className="mb-8 flex items-center gap-3 px-2">
          <BrandMark logoUrl={client?.logoUrl} name={name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="line-clamp-2 text-[11px] leading-snug text-white/55">{subtitle}</p>
          </div>
        </div>
        {scope.isAdmin && <div className="mb-5"><ClientSwitcher clients={clients} current={scope.clientId} dark /></div>}
        <SideNav isAdmin={scope.isAdmin} openReplies={openReplies} newOrders={newOrders} />
        <div className="mt-auto space-y-4 border-t border-white/10 px-2 pt-4">
          {mode}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{user.name}</p>
              <p className="truncate text-xs text-white/50">{user.email}</p>
            </div>
            <form action={logout}>
              <button title="Sign out" className="grid size-8 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
          {!scope.isAdmin && <p className="text-[10px] text-white/30">Powered by Campaign Portal</p>}
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-night/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden print:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <BrandMark logoUrl={client?.logoUrl} name={name} size="sm" />
          {scope.isAdmin ? (
            <HeaderClientSwitcher clients={clients} current={scope.clientId} title={client ? name : "All clients"}>
              {live ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] leading-tight text-glow">
                  <span className="size-1.5 shrink-0 rounded-full bg-glow" />
                  {scope.isAdmin ? `Sending via ${via}` : "WhatsApp connected"}
                </p>
              ) : scope.isAdmin ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] leading-tight text-amber-300">
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-400" /> Demo mode · sends simulated
                </p>
              ) : (
                <p className="truncate text-[11px] leading-tight text-white/55">{subtitle}</p>
              )}
            </HeaderClientSwitcher>
          ) : (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-white">{name}</p>
              {live ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] leading-tight text-glow">
                  <span className="size-1.5 shrink-0 rounded-full bg-glow" />
                  {scope.isAdmin ? `Sending via ${via}` : "WhatsApp connected"}
                </p>
              ) : scope.isAdmin ? (
                <p className="flex items-center gap-1.5 truncate text-[11px] leading-tight text-amber-300">
                  <span className="size-1.5 shrink-0 rounded-full bg-amber-400" /> Demo mode · sends simulated
                </p>
              ) : (
                <p className="truncate text-[11px] leading-tight text-white/55">{subtitle}</p>
              )}
            </div>
          )}
          <SettingsLink />
        </div>
      </header>

      <main className="mx-auto max-w-7xl animate-rise px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-8 lg:pb-10">{children}</main>
      {scope.canOperate && <CallWidget />}
      <BottomNav isAdmin={scope.isAdmin} openReplies={openReplies} newOrders={newOrders} />
    </div>
  );
}
