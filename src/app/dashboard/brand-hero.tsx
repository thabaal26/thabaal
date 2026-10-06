import { Globe, Phone, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ReactNode } from "react";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/10 transition hover:bg-white/20";

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
    <section className="relative mb-5 overflow-hidden rounded-3xl bg-night text-white shadow-pop sm:mb-6">
      {client.bannerUrl && (
        // Phones: a slim strip across the top, so the banner shows without filling the screen.
        // eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size
        <img src={client.bannerUrl} alt={`${client.name} banner`} className="relative h-28 w-full object-cover object-center md:hidden" />
      )}
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 size-56 rounded-full bg-glow/20 blur-3xl max-md:hidden" />
      <div className="relative flex items-stretch">
        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <p className="text-[13px] font-medium text-glow">வணக்கம் 🙏 · {greeting()}</p>
          <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-2xl">Welcome back, {client.name}</h1>
          <p className="mt-1 hidden text-sm text-white/65 sm:line-clamp-1">
            {client.tagline ? `${client.tagline.replace(/[.!]?\s*$/, ".")} ` : ""}Here is how your WhatsApp campaigns are reaching your customers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs sm:mt-4">
            <span className={chip}>
              <Users className="size-3.5 text-glow" /> {fmtNumber(customers)} customers
            </span>
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className={chip}>
                <Globe className="size-3.5 text-glow" /> {host(client.website)}
              </a>
            )}
            {client.supportPhone && (
              <a href={`tel:${client.supportPhone.replace(/\s/g, "")}`} className={chip}>
                <Phone className="size-3.5 text-glow" /> {client.supportPhone}
              </a>
            )}
          </div>
          {actions && <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap">{actions}</div>}
        </div>
        {client.bannerUrl && (
          // The text sets the height; the banner fills the side instead of stretching the strip.
          <div className="relative hidden w-[34%] max-w-md shrink-0 md:block">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size */}
            <img src={client.bannerUrl} alt={`${client.name} banner`} className="absolute inset-0 size-full object-cover object-center" />
          </div>
        )}
      </div>
    </section>
  );
}
