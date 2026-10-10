import { CircleAlert, CircleCheck, Globe, Phone, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ReactNode } from "react";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const chip = "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-xs font-medium text-ink-2 shadow-xs transition hover:border-line-2 hover:text-ink";

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
    <section aria-labelledby="hero-title" className="mb-5 flex flex-col gap-5 md:flex-row md:items-stretch md:justify-between sm:mb-6">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-muted">
          <span lang="ta">வணக்கம்</span> · {greeting()}, {name}
        </p>
        <h1 id="hero-title" className="mt-1.5 text-[1.75rem] font-semibold leading-[1.15] tracking-tight text-ink sm:text-[2.125rem]">
          {issues === 0 ? (
            <>
              <CircleCheck aria-hidden className="mr-2 inline size-7 -translate-y-0.5 text-success-solid sm:size-8" />
              Everything&apos;s running <span className="text-brand">smoothly.</span>
            </>
          ) : (
            <>
              <CircleAlert aria-hidden className="mr-2 inline size-7 -translate-y-0.5 text-danger-solid sm:size-8" />
              {issues} thing{issues === 1 ? " needs" : "s need"} <span className="text-danger">your attention.</span>
            </>
          )}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={chip}>
            <Users aria-hidden className="size-3.5 text-muted" /> {fmtNumber(customers)} customers
          </span>
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {period}
          {actions && <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:*:flex-1">{actions}</div>}
        </div>
      </div>
      {client?.bannerUrl && (
        <div className="relative hidden w-[22rem] shrink-0 overflow-hidden rounded-card bg-night shadow-card ring-1 ring-line lg:block xl:w-[26rem]">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
          <img src={client.bannerUrl} alt={`${name} banner`} className="absolute inset-0 size-full object-cover" />
          {client.tagline && (
            <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night/85 to-transparent px-4 pb-3 pt-8 text-xs font-medium text-white">{client.tagline}</p>
          )}
        </div>
      )}
    </section>
  );
}
