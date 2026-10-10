import { CircleAlert, CircleCheck, Globe, Phone, ShoppingBag, Store, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const chip = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-xs font-medium text-ink-2 shadow-xs transition hover:border-line-strong hover:bg-subtle hover:text-ink";

/**
 * The top of the Overview: who it's for, a one-line verdict on how things stand (worked out from the
 * real alerts below it), the period switch and the main actions. The client's banner sits beside it.
 */
export function BrandHero({
  client,
  name,
  customers,
  issues,
  actions,
  period,
}: {
  client: { tagline: string | null; bannerUrl: string | null; website: string | null; supportPhone: string | null } | null;
  name: string;
  customers: number;
  /** How many alerts need someone to act. */
  issues: number;
  actions?: ReactNode;
  period: ReactNode;
}) {
  return (
    <section
      aria-labelledby="hero-title"
      className="card-3d relative mb-5 flex flex-col gap-5 overflow-hidden rounded-card border p-4 sm:mb-6 sm:p-6 md:flex-row md:items-stretch md:justify-between"
      style={{
        background:
          issues === 0
            ? "radial-gradient(90% 100% at 0% 0%, rgb(22 125 99 / 0.08), transparent 60%), linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)"
            : "radial-gradient(90% 100% at 0% 0%, rgb(201 54 54 / 0.08), transparent 60%), linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)",
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: issues === 0 ? "var(--color-brand)" : "var(--color-danger-solid)" }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-muted">
            <span lang="ta">வணக்கம்</span> · {greeting()}, <span className="font-semibold text-ink-2">{name}</span>
          </p>
          <span
            className={
              issues === 0
                ? "inline-flex items-center gap-1.5 rounded-full bg-success-bg px-2.5 py-0.5 text-2xs font-semibold text-success ring-1 ring-inset ring-success-border"
                : "inline-flex items-center gap-1.5 rounded-full bg-danger-bg px-2.5 py-0.5 text-2xs font-semibold text-danger ring-1 ring-inset ring-danger-border"
            }
          >
            <span aria-hidden className={`size-1.5 rounded-full ${issues === 0 ? "bg-success-solid animate-pulse" : "bg-danger-solid"}`} />
            {issues === 0 ? "All systems operational" : `${issues} alert${issues === 1 ? "" : "s"}`}
          </span>
        </div>

        <h1 id="hero-title" className="mt-2 text-[1.625rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2rem]">
          {issues === 0 ? (
            <>
              <CircleCheck aria-hidden className="mr-2 inline size-6 -translate-y-0.5 text-success-solid sm:size-7" />
              Everything&apos;s running <span className="text-brand">smoothly.</span>
            </>
          ) : (
            <>
              <CircleAlert aria-hidden className="mr-2 inline size-6 -translate-y-0.5 text-danger-solid sm:size-7" />
              {issues} thing{issues === 1 ? " needs" : "s need"} <span className="text-danger">your attention.</span>
            </>
          )}
        </h1>

        <div className="mt-3.5 flex flex-wrap gap-2">
          <Link href="/dashboard/customers" className={chip}>
            <Users aria-hidden className="size-3.5 text-brand" /> <span className="tabular font-semibold text-ink">{fmtNumber(customers)}</span> customers
          </Link>
          <Link href="/dashboard/orders" className={chip}>
            <ShoppingBag aria-hidden className="size-3.5 text-gold-deep" /> Orders
          </Link>
          <Link href="/dashboard/catalogue" className={chip}>
            <Store aria-hidden className="size-3.5 text-info" /> Catalogue
          </Link>
          {client?.website && (
            <a href={client.website} target="_blank" rel="noreferrer" className={chip}>
              <Globe aria-hidden className="size-3.5 text-muted" /> <span className="truncate">{host(client.website)}</span>
            </a>
          )}
          {client?.supportPhone && (
            <a href={`tel:${client.supportPhone.replace(/\s/g, "")}`} className={chip}>
              <Phone aria-hidden className="size-3.5 text-muted" /> <span className="tabular">{client.supportPhone}</span>
            </a>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3.5">
          {period}
          {actions && <div className="flex flex-wrap gap-2 sm:ml-auto max-sm:w-full max-sm:*:flex-1">{actions}</div>}
        </div>
      </div>
      {client?.bannerUrl && (
        // The banner keeps its own proportions (no cropping); the tile is as tall as the image.
        <div className="relative hidden w-[21rem] shrink-0 self-center overflow-hidden rounded-card border border-white/10 bg-night shadow-card lg:block xl:w-[25rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
          <img src={client.bannerUrl} alt={`${name} banner`} className="block h-auto w-full" />
          {client.tagline && (
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/90 to-transparent px-4 pb-3 pt-8 text-xs font-medium text-white">{client.tagline}</p>
          )}
        </div>
      )}
    </section>
  );
}

