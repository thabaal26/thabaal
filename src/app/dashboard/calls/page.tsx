import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { PortalPage, Pill, type PillTone } from "../portal-ui";
import { CHATS_SUB, CHATS_SUB_TA, InboxTabs } from "../replies/inbox-tabs";

export const metadata: Metadata = { title: "Calls" };
export const dynamic = "force-dynamic";

const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} m ${s % 60} s` : `${s} s`);

/** Chats › Calls: WhatsApp voice calls from the call log (portal design). */
export default async function CallsPage() {
  const scope = await getScope();
  const calls = await db.call.findMany({
    where: owned(scope),
    include: { customer: { select: { id: true, name: true } }, sender: { select: { label: true } } },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const answered = calls.filter((c) => c.status === "ENDED" || c.status === "ANSWERED");
  const connected = answered.length;
  const answeredIn = answered.filter((c) => c.direction !== "OUTGOING").length;
  const missed = calls.filter((c) => c.status === "MISSED").length;
  const declined = calls.filter((c) => c.status === "REJECTED").length;

  const result = (c: (typeof calls)[number]): { label: string; tone: PillTone } => {
    const out = c.direction === "OUTGOING";
    switch (c.status) {
      case "RINGING":
        return { label: "Ringing", tone: "warn" };
      case "ANSWERED":
        return { label: "On call", tone: "ok" };
      case "ENDED":
        return { label: out ? "Connected" : "Answered", tone: "ok" };
      case "MISSED":
        return { label: out ? "No answer" : "Missed", tone: "bad" };
      default:
        return { label: "Declined", tone: "mute" };
    }
  };

  return (
    <PortalPage title="Chats" titleTa="அரட்டை" sub={CHATS_SUB} subTa={CHATS_SUB_TA}>
      <InboxTabs active="calls" />

      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="l">Connected</div>
          <div className="v">{connected}</div>
        </div>
        <div className="card stat">
          <div className="l">Answered</div>
          <div className="v">{answeredIn}</div>
        </div>
        <div className="card stat">
          <div className="l">Missed</div>
          <div className="v">{missed}</div>
          {missed > 0 && <div className="d down">Call these back</div>}
        </div>
        <div className="card stat">
          <div className="l">Declined</div>
          <div className="v">{declined}</div>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <div>
            <h2>Call log</h2>
            <p>Incoming calls ring here. To call a customer, open their chat and tap “Call on WhatsApp”.</p>
          </div>
        </div>
        {calls.length ? (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>When</th>
                  <th>Direction</th>
                  <th>Result</th>
                  <th>Duration</th>
                  <th>Answered by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const r = result(c);
                  const out = c.direction === "OUTGOING";
                  const callBack = c.customer && (c.status === "MISSED" || c.status === "REJECTED");
                  return (
                    <tr key={c.id}>
                      <td>
                        {c.customer ? (
                          <Link href={`/dashboard/customers/${c.customer.id}`} style={{ fontWeight: 600, textDecoration: "none" }}>
                            {c.customer.name}
                          </Link>
                        ) : (
                          <b>{c.callerName || "Unknown caller"}</b>
                        )}
                        <div className="muted small">{formatPhone(c.fromPhone)}</div>
                      </td>
                      <td className="muted small">{fmtDate(c.startedAt, "d MMM, h:mm a")}</td>
                      <td>{out ? "Outgoing" : "Incoming"}</td>
                      <td>
                        <Pill tone={r.tone}>{r.label}</Pill>
                      </td>
                      <td>{c.duration != null && c.status === "ENDED" ? dur(c.duration) : "–"}</td>
                      <td>{c.answeredBy || "–"}</td>
                      <td>
                        {callBack && (
                          <Link className="btn sm" href={`/dashboard/customers/${c.customer!.id}#call`}>
                            Call back
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">When a customer calls your WhatsApp number, it rings in every open portal tab and shows up here.</p>
        )}
      </div>
    </PortalPage>
  );
}
