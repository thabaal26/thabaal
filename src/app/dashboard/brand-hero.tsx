import { Globe, Phone, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ReactNode } from "react";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const chip =
  "inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 text-white ring-1 ring-white/15 transition hover:bg-white/20 active:bg-white/25";

/**
 * First thing a client sees after signing in: their name, numbers and banner, kept to a
 * compact strip so the figures below stay on the first screen. Phones show the banner as
 * a slim strip on top; wider screens put it beside the text.
 */
export function BrandHero({
  client,
  customers,
  actions,
}: {
  client: { name: string; tagline: string | null; bannerUrl: string | null; website: string | null; supportPhone: string | null };
  customers: number;
  actions?: ReactNode;
}) {
  return (
    <section aria-labelledby="hero-title" className="surface-dark relative mb-4 overflow-hidden rounded-card bg-night text-white shadow-card sm:mb-6">
      {client.bannerUrl && (
        // Phones: a slim strip across the top, so the banner shows without filling the screen.
        <div className="relative h-28 w-full overflow-hidden md:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
          <img src={client.bannerUrl} alt={`${client.name} banner`} width={800} height={160} className="size-full object-cover object-center" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-night to-transparent" />
        </div>
      )}
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <p className="text-sm font-medium text-glow">
            <span lang="ta">வணக்கம்</span> · {greeting()}
          </p>
          <h1 id="hero-title" className="mt-1 text-hero font-semibold tracking-tight [overflow-wrap:anywhere]">
            Welcome back, {client.name}
          </h1>
          <p className="mt-1 hidden text-sm text-white/75 sm:line-clamp-2">
            {client.tagline ? `${client.tagline.replace(/[.!]?\s*$/, ".")} ` : ""}Here is how your WhatsApp campaigns are reaching your customers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs sm:mt-4">
            <span className={chip}>
              <Users aria-hidden className="size-3.5 text-glow" /> {fmtNumber(customers)} customers
            </span>
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className={chip}>
                <Globe aria-hidden className="size-3.5 text-glow" /> <span className="truncate">{host(client.website)}</span>
              </a>
            )}
            {client.supportPhone && (
              <a href={`tel:${client.supportPhone.replace(/\s/g, "")}`} className={chip}>
                <Phone aria-hidden className="size-3.5 text-glow" /> <span className="tabular">{client.supportPhone}</span>
              </a>
            )}
          </div>
          {actions && <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{actions}</div>}
        </div>
        {client.bannerUrl && (
          // The text sets the height; the banner fills the side instead of stretching the strip.
          <div className="relative hidden w-[36%] max-w-md shrink-0 overflow-hidden md:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
            <img src={client.bannerUrl} alt="" className="absolute inset-0 size-full object-cover object-center" />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-night via-night/60 to-transparent" />
          </div>
        )}
      </div>
    </section>
  );
}
