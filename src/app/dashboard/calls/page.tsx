import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { Phone3D } from "@/components/icons-3d";
import { Badge, Card, CardHeader, EmptyState, IconCube, PageHeader, Stat } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
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

  const connectedCount = calls.filter((c) => c.status === "ENDED" || c.status === "ANSWERED").length;
  const missedCount = calls.filter((c) => c.status === "MISSED" || c.status === "REJECTED").length;
  const outgoingCount = calls.filter((c) => c.direction === "OUTGOING").length;

  return (
    <>
      <PageHeader
        title="Calls"
        description="WhatsApp voice calls with customers. Keep the portal open in a tab: incoming calls ring here. To call a customer, open their page and use Call on WhatsApp."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Total calls" value={fmtNumber(calls.length)} sub="Recent call log" icon={<Phone3D />} tone="info" />
        <Stat
          label="Connected"
          value={fmtNumber(connectedCount)}
          sub="Answered on WhatsApp"
          icon={<PhoneIncoming />}
          tone="brand"
          meter={calls.length > 0 ? Math.round((connectedCount / calls.length) * 100) : 0}
        />
        <Stat
          label="Missed / Declined"
          value={fmtNumber(missedCount)}
          sub={missedCount > 0 ? "Follow up with customer" : "No missed calls"}
          icon={<PhoneMissed />}
          tone={missedCount > 0 ? "rose" : "gold"}
        />
        <Stat label="Outgoing" value={fmtNumber(outgoingCount)} sub="Placed from the portal" icon={<PhoneOutgoing />} tone="violet" />
      </div>

      {calls.length ? (
        <Card className="card-3d overflow-hidden">
          <CardHeader tone="brand" icon={<Phone3D />} title="Call history" description="Tap a customer to open their profile and conversation" />
          <ul className="divide-y divide-line">
            {calls.map((c) => {
              const s = STATUS[c.status];
              const outgoing = c.direction === "OUTGOING";
              const Icon = outgoing && c.status !== "MISSED" ? PhoneOutgoing : s.icon;
              const label = outgoing ? { RINGING: "Ringing", ANSWERED: "On call", ENDED: "Connected", MISSED: "No answer", REJECTED: "Declined" }[c.status] : s.label;
              return (
                <li key={c.id} className={cn("relative flex items-start gap-3 px-4 py-3.5 sm:px-5", c.customer && "transition-colors hover:bg-subtle active:bg-sunken")}>
                  <IconCube tone={c.status === "MISSED" ? "rose" : "brand"} size="md">
                    <Icon />
                  </IconCube>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {c.customer ? (
                          <Link href={`/dashboard/customers/${c.customer.id}`} className="font-semibold text-ink after:absolute after:inset-0 hover:underline">
                            {c.customer.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-ink">{c.callerName || "Unknown caller"}</span>
                        )}
                        <p className="tabular text-xs text-muted">{formatPhone(c.fromPhone)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <Badge tone={s.tone} dot>{label}</Badge>
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
        <Card className="card-3d">
          <EmptyState icon={<Phone3D className="size-5" />} title="No calls yet">
            When a customer calls your WhatsApp number, it rings in every open portal tab and shows up here.
          </EmptyState>
        </Card>
      )}
    </>
  );
}

