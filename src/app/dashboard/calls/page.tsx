import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";

export const metadata: Metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

const STATUS = {
  RINGING: { tone: "amber", label: "Ringing", icon: PhoneIncoming },
  ANSWERED: { tone: "green", label: "On call", icon: PhoneCall },
  ENDED: { tone: "gray", label: "Answered", icon: PhoneCall },
  MISSED: { tone: "red", label: "Missed", icon: PhoneMissed },
  REJECTED: { tone: "gray", label: "Declined", icon: PhoneOff },
} as const;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function CallsPage() {
  const scope = await getScope();
  const calls = await db.call.findMany({
    where: owned(scope),
    include: { customer: { select: { id: true, name: true } }, sender: { select: { label: true } } },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader
        title="Calls"
        description="WhatsApp voice calls with customers. Keep the portal open in a tab: incoming calls ring here. To call a customer, open their page and use Call on WhatsApp."
      />
      {calls.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {calls.map((c) => {
              const s = STATUS[c.status];
              const outgoing = c.direction === "OUTGOING";
              const Icon = outgoing && c.status !== "MISSED" ? PhoneOutgoing : s.icon;
              const label = outgoing ? { RINGING: "Ringing", ANSWERED: "On call", ENDED: "Connected", MISSED: "No answer", REJECTED: "Declined" }[c.status] : s.label;
              return (
                <li key={c.id} className={cn("relative flex items-start gap-3 px-4 py-3 sm:px-5", c.customer && "transition-colors hover:bg-canvas/70 active:bg-sunken")}>
                  <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full", c.status === "MISSED" ? "bg-danger-bg text-danger" : "bg-brand-soft text-brand-deep")}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {c.customer ? (
                          <Link href={`/dashboard/customers/${c.customer.id}`} className="font-medium text-ink after:absolute after:inset-0 hover:underline">
                            {c.customer.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">{c.callerName || "Unknown caller"}</span>
                        )}
                        <p className="tabular text-xs text-muted">{formatPhone(c.fromPhone)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge tone={s.tone}>{label}</Badge>
                        {outgoing && <Badge tone="blue">Outgoing</Badge>}
                      </div>
                    </div>
                    <p className="tabular mt-1 text-xs text-muted">
                      {fmtDate(c.startedAt, "EEE d MMM, h:mm a")}
                      {c.duration != null && c.status === "ENDED" && <> · {mmss(c.duration)}</>}
                      {c.answeredBy && <> · {outgoing ? "called" : "answered"} by {c.answeredBy}</>}
                      {c.sender && <> · {outgoing ? "from" : "to"} {c.sender.label}</>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={<PhoneCall className="size-5" />} title="No calls yet">
            When a customer calls your WhatsApp number, it rings in every open portal tab and shows up here.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
