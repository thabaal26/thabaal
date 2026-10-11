import { BookOpen, CircleAlert, CircleCheck, Globe, MessageCircle, MoreHorizontal, PackageCheck, Phone, RotateCw, ShoppingBag, ShoppingCart, Store, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export type HeroWork = {
  unpaidCartsCount: number;
  unpaidCartsValue: number;
  browsedNoCartCount: number;
  toDispatchCount: number;
  unhandledRepliesCount: number;
  refillsDueCount: number;
  showOrders: boolean;
  showReplies: boolean;
};

type Todo = { key: string; text: ReactNode; href: string; color: string; icon: ComponentType<{ className?: string }> };

function todosOf(w: HeroWork): Todo[] {
  const t: Todo[] = [];
  if (w.showOrders && w.unpaidCartsCount)
    t.push({ key: "unpaid", href: "/dashboard/orders?show=unpaid", color: "#d97706", icon: ShoppingCart, text: <><b>{formatValue(w.unpaidCartsValue, "inr")}</b> in {w.unpaidCartsCount} unpaid cart{w.unpaidCartsCount === 1 ? "" : "s"}</> });
  if (w.showOrders && w.toDispatchCount)
    t.push({ key: "pack", href: "/dashboard/orders/packing", color: "#167d63", icon: PackageCheck, text: <><b>{fmtNumber(w.toDispatchCount)}</b> to pack</> });
  if (w.showReplies && w.unhandledRepliesCount)
    t.push({ key: "chats", href: "/dashboard/replies/priority", color: "#6941c6", icon: MessageCircle, text: <><b>{fmtNumber(w.unhandledRepliesCount)}</b> chat{w.unhandledRepliesCount === 1 ? "" : "s"} to answer</> });
  if (w.showOrders && w.refillsDueCount)
    t.push({ key: "refills", href: "/dashboard/refills", color: "#15803d", icon: RotateCw, text: <><b>{fmtNumber(w.refillsDueCount)}</b> refill{w.refillsDueCount === 1 ? "" : "s"} due</> });
  if (w.showOrders && w.browsedNoCartCount)
    t.push({ key: "browsed", href: "/dashboard?view=customers#customer-scenarios", color: "#0284c7", icon: BookOpen, text: <><b>{fmtNumber(w.browsedNoCartCount)}</b> browsed, no cart</> });
  return t;
}

/**
 * The top of the dashboard: greeting, a headline that says what needs doing today (alerts first),
 * one-tap to-dos, and the business details tucked into a menu. The client's banner sits faded on the right.
 */
export function BrandHero({
  client,
  name,
  customers,
  issues,
  actions,
  work,
}: {
  client: { tagline: string | null; bannerUrl: string | null; website: string | null; supportPhone: string | null } | null;
  name: string;
  customers: number;
  /** How many alerts need someone to act. */
  issues: number;
  actions?: ReactNode;
  work: HeroWork;
}) {
  const todos = todosOf(work);
  const tone = issues > 0 ? "danger" : todos.length ? "work" : "clear";
  const accent = tone === "danger" ? "var(--color-danger-solid)" : "var(--color-brand)";

  return (
    <section
      aria-labelledby="hero-title"
      className="card-3d relative mb-4 overflow-hidden rounded-card border bg-panel sm:mb-5"
      style={{ background: `radial-gradient(80% 120% at 0% 0%, ${tone === "danger" ? "rgb(201 54 54 / 0.07)" : "rgb(22 125 99 / 0.07)"}, transparent 60%), linear-gradient(180deg, var(--color-panel) 0%, var(--color-panel-2) 100%)` }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 z-10 h-[3px]" style={{ background: accent }} />

      {client?.bannerUrl && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 hidden max-w-[48%] md:block">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
          <img
            src={client.bannerUrl}
            alt=""
            className="h-full w-auto max-w-none object-contain"
            style={{ maskImage: "linear-gradient(90deg, transparent 0%, #000 38%)", WebkitMaskImage: "linear-gradient(90deg, transparent 0%, #000 38%)" }}
          />
          {client.tagline && <p className="absolute bottom-3 right-4 rounded-full bg-night/70 px-3 py-1 text-2xs font-medium text-white backdrop-blur-sm">{client.tagline}</p>}
        </div>
      )}

      <div className="relative flex flex-col gap-3.5 p-4 sm:p-5 md:max-w-[68%] lg:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted">
            <span lang="ta">வணக்கம்</span> · {greeting()}, <span className="font-semibold text-ink-2">{name}</span>
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ring-inset",
              issues === 0 ? "bg-success-bg text-success ring-success-border" : "bg-danger-bg text-danger ring-danger-border",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", issues === 0 ? "animate-pulse bg-success-solid" : "bg-danger-solid")} />
            {issues === 0 ? "WhatsApp live" : `${issues} alert${issues === 1 ? "" : "s"}`}
          </span>

          <details className="group/m relative">
            <summary
              aria-label="Business details"
              className="grid size-7 cursor-pointer list-none place-items-center rounded-full text-muted transition hover:bg-subtle hover:text-ink [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="size-4" />
            </summary>
            <div className="absolute left-0 top-9 z-30 w-60 rounded-card border border-line bg-panel p-1.5 shadow-lg">
              <Link href="/dashboard/customers" className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink">
                <Users aria-hidden className="size-4 text-brand" /> <b className="tabular text-ink">{fmtNumber(customers)}</b> customers
              </Link>
              <Link href="/dashboard/orders" className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink">
                <ShoppingBag aria-hidden className="size-4 text-gold-deep" /> Orders
              </Link>
              <Link href="/dashboard/catalogue" className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink">
                <Store aria-hidden className="size-4 text-info" /> Catalogue
              </Link>
              {client?.website && (
                <a href={client.website} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink">
                  <Globe aria-hidden className="size-4 text-muted" /> <span className="truncate">{host(client.website)}</span>
                </a>
              )}
              {client?.supportPhone && (
                <a href={`tel:${client.supportPhone.replace(/\s/g, "")}`} className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-sm text-ink-2 hover:bg-subtle hover:text-ink">
                  <Phone aria-hidden className="size-4 text-muted" /> <span className="tabular">{client.supportPhone}</span>
                </a>
              )}
            </div>
          </details>
        </div>

        <h1 id="hero-title" className="text-[1.5rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[1.875rem]">
          {tone === "danger" ? (
            <>
              <CircleAlert aria-hidden className="mr-2 inline size-6 -translate-y-0.5 text-danger-solid sm:size-7" />
              {issues} thing{issues === 1 ? " needs" : "s need"} <span className="text-danger">your attention.</span>
            </>
          ) : tone === "work" ? (
            <>
              {todos.length} thing{todos.length === 1 ? "" : "s"} <span className="text-brand">need you today.</span>
            </>
          ) : (
            <>
              <CircleCheck aria-hidden className="mr-2 inline size-6 -translate-y-0.5 text-success-solid sm:size-7" />
              All clear <span className="text-brand">today.</span>
            </>
          )}
        </h1>

        {todos.length > 0 && (
          <ul className="thin-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
            {todos.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.key} className="shrink-0">
                  <Link
                    href={t.href}
                    className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-line bg-panel/90 py-1 pl-1 pr-3.5 text-sm text-ink-2 shadow-xs backdrop-blur-sm transition hover:-translate-y-px hover:border-line-2 hover:text-ink hover:shadow-sm"
                  >
                    <span aria-hidden className="grid size-7 place-items-center rounded-full text-white" style={{ background: t.color }}>
                      <Icon className="size-3.5" />
                    </span>
                    <span className="tabular whitespace-nowrap [&_b]:font-semibold [&_b]:text-ink">{t.text}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {actions && <div className="flex flex-wrap gap-2 max-sm:*:flex-1">{actions}</div>}
      </div>
    </section>
  );
}
