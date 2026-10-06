import { LogOut, MessageCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getScope, requireUser } from "@/lib/session";
import { getSettings, isSimulated } from "@/lib/provider";
import { logout } from "../login/actions";
import { ClientSwitcher } from "./client-switcher";
import { BottomNav, SettingsLink, SideNav } from "./nav";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireUser();
  const scope = await getScope();
  const [settings, client, clients] = await Promise.all([
    getSettings(),
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId } }) : null,
    scope.isAdmin ? db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const title = scope.isAdmin ? "Campaign Portal" : (scope.clientName ?? "Campaign Portal");
  const via = settings.provider === "LOCAL" ? "Local session" : "Meta Cloud API";

  const mode = !isSimulated(settings, client) ? (
    <span className="flex items-center gap-2 text-xs text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-400" />Sending via {via}</span>
  ) : (
    <span className="flex items-center gap-2 text-xs text-amber-300"><span className="size-2 rounded-full bg-amber-400" />Demo mode · {via} not set up</span>
  );

  const live = !isSimulated(settings, client);

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-night px-4 py-6 lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand text-white"><MessageCircle className="size-5" /></span>
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="text-[11px] text-white/50">{scope.isAdmin ? "Admin" : "WhatsApp campaigns"}</p>
          </div>
        </div>
        {scope.isAdmin && <div className="mb-5"><ClientSwitcher clients={clients} current={scope.clientId} dark /></div>}
        <SideNav isAdmin={scope.isAdmin} />
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
        </div>
      </aside>

      <header className="sticky top-0 z-30 bg-night/95 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white"><MessageCircle className="size-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-white">{scope.isAdmin ? (scope.clientName ?? "All clients") : title}</p>
            <p className={`flex items-center gap-1.5 truncate text-[11px] leading-tight ${live ? "text-emerald-300" : "text-amber-300"}`}>
              <span className={`size-1.5 shrink-0 rounded-full ${live ? "bg-emerald-400" : "bg-amber-400"}`} />
              {live ? `Sending via ${via}` : "Demo mode · sends simulated"}
            </p>
          </div>
          <SettingsLink />
        </div>
      </header>

      {scope.isAdmin && (
        <div className="bg-night px-4 pb-3 lg:hidden"><ClientSwitcher clients={clients} current={scope.clientId} dark /></div>
      )}
      <main className="mx-auto max-w-7xl animate-rise px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-8 sm:pt-8 lg:pb-10">{children}</main>
      <BottomNav />
    </div>
  );
}
