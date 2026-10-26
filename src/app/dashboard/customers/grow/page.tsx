import { Download, QrCode } from "@/components/icons";
import { MapPin3D, Sparkles3D } from "@/components/icons-3d";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import QR from "qrcode";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { Card, CardHeader, EmptyState, PageHeader, PickClientNotice } from "@/components/ui";
import { buttonClass } from "@/components/ui-classes";
import { T } from "../../portal-ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { joinLink, joinText } from "@/lib/optin";
import { clientNumbers, numberLabel } from "@/lib/senders";
import { getScope } from "@/lib/session";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Get more customers" };
export const dynamic = "force-dynamic";

/** Where a QR code or link is placed; becomes the customer's tag (joined-van) so you can see what works. */
const SOURCES = [
  { key: "shop", label: "Shop counter" },
  { key: "van", label: "Delivery van" },
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "flyer", label: "Flyers & bills" },
];

export default async function GrowPage({ searchParams }: PageProps<"/dashboard/customers/grow">) {
  const locked = await planGate();
  if (locked) return locked;
  const scope = await getScope();
  if (!scope.clientId) return <><PageHeader title="Get more customers" /><PickClientNotice what="opt-in QR codes" /></>;
  const raw = await searchParams;
  const pick = typeof raw.source === "string" ? raw.source.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) : "";
  const source = pick || SOURCES[0].key;

  const [numbers, joined] = await Promise.all([
    clientNumbers(scope.clientId),
    db.customer.groupBy({ by: ["optInSource"], where: { clientId: scope.clientId, optInSource: { startsWith: "WhatsApp JOIN" } }, _count: true }),
  ]);
  const number = numbers.find((n) => n.isDefault) ?? numbers[0];
  const digits = number?.displayPhone?.replace(/\D/g, "");

  const back = { href: "/dashboard/customers", label: "Customers" };
  if (!digits) {
    return (
      <>
        <PageHeader title="Get more customers" back={back} />
        <Card className="card-3d"><EmptyState icon={<QrCode className="size-5 shrink-0" />} title="Add a WhatsApp number first">Opt-in codes open a chat with your number. Add one on the Clients page.</EmptyState></Card>
      </>
    );
  }

  const link = joinLink(digits, source);
  const [svg, png] = await Promise.all([
    QR.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    QR.toDataURL(link, { width: 1024, margin: 2, errorCorrectionLevel: "M" }),
  ]);
  const count = (key: string) => joined.find((j) => j.optInSource === `WhatsApp JOIN (${key})`)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Get more customers"
        back={back}
        description="Put a QR code where customers see you. They scan it, send the ready-typed message, and are added here as opted-in customers with a welcome reply."
      />

      <StaggerGroup className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <StaggerItem>
          <Card className="card-3d">
            <CardHeader tone="brand" icon={<MapPin3D />} title="1. Where will this code go?" description="Each place gets its own code, so you can see which one brings customers." />
            <nav aria-label="Where the code goes" className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:p-5">
              {SOURCES.map((s) => (
                <Link
                  key={s.key}
                  href={`?source=${s.key}`}
                  aria-current={source === s.key ? "true" : undefined}
                  className={cn(
                    "rounded-control border px-3 py-2.5 text-sm transition active:scale-[0.98]",
                    source === s.key ? "border-brand/40 bg-brand-soft font-medium text-brand-deep shadow-xs" : "border-line bg-panel text-ink hover:bg-canvas",
                  )}
                >
                  {s.label}
                  <span className={cn("mt-0.5 block text-xs font-normal", source === s.key ? "text-brand-deep" : "text-muted")}>{fmtNumber(count(s.key))} joined</span>
                </Link>
              ))}
            </nav>
            <form className="flex gap-2 border-t border-line p-4 sm:p-5">
              <input name="source" defaultValue={SOURCES.some((s) => s.key === source) ? "" : source} placeholder="Or name your own, e.g. diwali-stall" aria-label="Name your own place" className="field" maxLength={30} />
              <button className={cn(buttonClass("secondary"), "shrink-0")}><T ta="குறியீடு உருவாக்கு">Make code</T></button>
            </form>
            <div className="space-y-2 border-t border-line p-4 text-sm text-ink-2 sm:p-5">
              <p className="font-medium text-ink">What customers see</p>
              <p>WhatsApp opens a chat with {numberLabel(number)} and the message <b className="font-mono">{joinText(source)}</b> already typed. When they send it:</p>
              <ul className="list-disc space-y-1 pl-5 text-muted">
                <li>they&apos;re added to Customers with the tag <b className="font-mono text-ink-2">joined-{source}</b> and marked as opted in (Meta requires this),</li>
                <li>they get a welcome message straight away,</li>
                <li>someone who earlier replied STOP is subscribed again, since they asked to join.</li>
              </ul>
            </div>
          </Card>
        </StaggerItem>

        <StaggerItem>
          <Card className="card-3d lg:sticky lg:top-8">
            <CardHeader tone="gold" icon={<Sparkles3D />} title={`2. Your code: ${source}`} />
            <div className="space-y-4 p-4 sm:p-5">
              {/* Generated locally from our own link, so the markup is safe to inline. */}
              <div role="img" aria-label={`QR code that opens WhatsApp to join (${source})`} className="mx-auto aspect-square w-full max-w-64 rounded-card bg-white p-3 ring-1 ring-line" dangerouslySetInnerHTML={{ __html: svg }} />
              <a href={png} download={`join-${source}-qr.png`} className={cn(buttonClass("primary"), "w-full")}>
                <Download aria-hidden className="size-4 shrink-0" /> Download QR (PNG)
              </a>
              <div>
                <label htmlFor="optin-link" className="mb-1.5 block text-sm font-medium text-ink-2">Link for website, Instagram bio or SMS</label>
                <input id="optin-link" readOnly value={link} className="field font-mono sm:text-xs" />
              </div>
            </div>
          </Card>
        </StaggerItem>
      </StaggerGroup>
    </>
  );
}
