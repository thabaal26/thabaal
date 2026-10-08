import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
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
                <li key={c.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-deep">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {c.customer ? (
                        <Link href={`/dashboard/customers/${c.customer.id}`} className="font-medium hover:underline">{c.customer.name}</Link>
                      ) : (
                        <span className="font-medium">{c.callerName || "Unknown caller"}</span>
                      )}
                      <span className="tabular text-xs text-muted">{formatPhone(c.fromPhone)}</span>
                      <Badge tone={s.tone}>{label}</Badge>
                      {outgoing && <Badge tone="blue">Outgoing</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted">
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
