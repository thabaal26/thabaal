import { Globe, Phone, Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { ReactNode } from "react";
import { APP_TZ, fmtNumber } from "@/lib/format";

function greeting(now = new Date()) {
  const h = Number(formatInTimeZone(now, APP_TZ, "H"));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/** First thing a client sees after signing in: their own banner, name and numbers. */
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
    <section className="mb-6 overflow-hidden rounded-3xl bg-night text-white shadow-pop">
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="relative flex flex-col justify-between gap-6 p-6 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-64 rounded-full bg-glow/20 blur-3xl" />
          <div className="relative">
            <p className="text-sm font-medium text-glow">வணக்கம் 🙏 · {greeting()}</p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Welcome back, {client.name}</h1>
            <p className="mt-2 max-w-md text-sm text-white/70">
              {client.tagline ? `${client.tagline.replace(/[.!]?\s*$/, ".")} ` : ""}Here is how your WhatsApp campaigns are reaching your customers.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 ring-1 ring-white/10 sm:px-3 sm:py-1.5">
              <Users className="size-3.5 text-glow" /> {fmtNumber(customers)} customers
            </span>
            {client.website && (
              <a href={client.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 ring-1 ring-white/10 sm:px-3 sm:py-1.5 transition hover:bg-white/20">
                <Globe className="size-3.5 text-glow" /> {host(client.website)}
              </a>
            )}
            {client.supportPhone && (
              <a href={`tel:${client.supportPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 ring-1 ring-white/10 sm:px-3 sm:py-1.5 transition hover:bg-white/20">
                <Phone className="size-3.5 text-glow" /> {client.supportPhone}
              </a>
            )}
          </div>
          {actions && <div className="relative flex flex-wrap gap-2">{actions}</div>}
        </div>
        {client.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- admin-supplied banner of any size
          <img src={client.bannerUrl} alt={`${client.name} banner`} className="aspect-[1.91/1] h-full w-full object-cover md:aspect-auto" />
        )}
      </div>
    </section>
  );
}
