import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/format";
import { KINDS, OWNER_TEMPLATES } from "@/lib/owner-messages-core";
import { loadOwnerLog, loadOwnerSettings, ownerTargets, ownerTemplateStatus } from "@/lib/owner-messages";
import { requireAdminPage } from "@/lib/session";
import { GRACE_DAYS } from "@/lib/subscription-core";
import { Tabs } from "../nav";
import { Kpis, PageHead, Pill, R, pctOf } from "../ui";
import { AutoSettings, CancelScheduled, SubmitTemplates } from "./auto-settings";
import { SendForm } from "./send-form";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  queued: ["warn", "Waiting"],
  sending: ["warn", "Sending"],
  sent: ["info", "Sent"],
  delivered: ["ok", "Delivered"],
  read: ["ok", "Read"],
  failed: ["bad", "Failed"],
  skipped: ["mute", "Left out"],
};

export default async function MessagesPage() {
  await requireAdminPage();
  const now = new Date();
  const [shops, settings, log, tpl] = await Promise.all([ownerTargets(now), loadOwnerSettings(), loadOwnerLog(now), ownerTemplateStatus()]);
  const when = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM, h:mm a");
  const quiet = `${settings.quietFrom}–${settings.quietTo}${settings.skipSundays ? ", not on Sundays" : ""}`;
  const approved = tpl.templates.length > 0 && tpl.templates.every((t) => t.status === "APPROVED");

  const logPanel = (
    <>
      <Kpis
        className="mb16"
        items={[
          { label: "Sent this month", value: String(log.sentMonth), note: log.simulatedMonth ? `${log.simulatedMonth} ${log.simulatedMonth === 1 ? "was a test send" : "were test sends"}, not on WhatsApp` : "to business owners", tone: "mute" },
          { label: "Read", value: `${pctOf(log.read, log.real)}%`, note: "of what reached WhatsApp", tone: "mute" },
          { label: "Failed", value: String(log.failedMonth), note: "this month", tone: log.failedMonth ? "dn" : "mute" },
          { label: "Meta charges", value: R(log.cost), note: "estimated, on your own number", tone: "mute" },
        ]}
      />
      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table className="dt">
            <thead>
              <tr>
                <th>Date</th>
                <th>Message</th>
                <th>Kind</th>
                <th className="num">Shops</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {log.messages.map((m) => {
                const n = (s: string[]) => m.to.filter((t) => s.includes(t.status)).length;
                const reached = n(["sent", "delivered", "read"]);
                const result =
                  m.status === "cancelled"
                    ? "Cancelled"
                    : m.status === "scheduled"
                      ? `Goes ${when(m.sendAt)}`
                      : [reached && `${reached} sent`, n(["read"]) && `${n(["read"])} read`, n(["failed"]) && `${n(["failed"])} failed`, n(["queued", "sending"]) && `${n(["queued", "sending"])} waiting`]
                          .filter(Boolean)
                          .join(" · ") || "Nothing sent";
                const tone = m.status === "cancelled" ? "mute" : m.status === "scheduled" || m.status === "sending" ? "warn" : n(["failed"]) ? "bad" : "ok";
                return (
                  <tr key={m.id}>
                    <td className="muted small">{when(m.createdAt)}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 260, maxWidth: 520 }}>
                      <details>
                        <summary style={{ cursor: "pointer" }}>
                          <b>{m.text.length > 60 ? `${m.text.slice(0, 60)}…` : m.text}</b>
                          {m.auto && <span className="muted small"> · automatic</span>}
                        </summary>
                        <div className="list" style={{ marginTop: 8 }}>
                          {m.to.map((t) => (
                            <div className="row" key={t.id}>
                              <div className="grow">
                                <div className="t">{t.client.name}</div>
                                <div className="muted small">
                                  {t.text}
                                  {t.reason ? ` · ${t.reason}` : ""}
                                  {t.simulated ? " · test send, not on WhatsApp" : ""}
                                </div>
                              </div>
                              <Pill tone={(STATUS[t.status]?.[0] ?? "mute") as never}>{STATUS[t.status]?.[1] ?? t.status}</Pill>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td>
                      <span className="pill">{KINDS.find((k) => k.k === m.kind)?.log ?? m.kind}</span>
                    </td>
                    <td className="num">{m.to.filter((t) => t.status !== "skipped").length}</td>
                    <td>
                      <Pill tone={tone as never}>{result}</Pill>
                    </td>
                    <td className="num">{m.status === "scheduled" && <CancelScheduled id={m.id} />}</td>
                  </tr>
                );
              })}
              {!log.messages.length && (
                <tr>
                  <td colSpan={6} className="muted small">
                    Nothing sent yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const autoPanel = (
    <>
      <AutoSettings initial={settings} grace={GRACE_DAYS} />
      <div className="card">
        <div className="hd">
          <div>
            <h2>Thabaal&apos;s WhatsApp templates</h2>
            <p>Owners get these from your own number. WhatsApp needs both approved before anything reaches them.</p>
          </div>
          {tpl.live && !approved && <SubmitTemplates />}
        </div>
        {!tpl.live ? (
          <p className="muted small">
            Thabaal&apos;s own WhatsApp number isn&apos;t set up here (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID). Until it is, messages
            are saved but marked failed, and nothing reaches WhatsApp.
          </p>
        ) : "error" in tpl && tpl.error ? (
          <p className="muted small">Couldn&apos;t read the templates from Meta: {tpl.error}</p>
        ) : (
          <div className="list">
            {tpl.templates.map((t) => (
              <div className="row" key={t.name}>
                <div className="grow">
                  <div className="t">{t.name}</div>
                  <div className="muted small">
                    {t.name === OWNER_TEMPLATES.update.name ? "Payment reminders and overdue warnings (utility)" : "Offers, win-back and news (marketing)"}
                  </div>
                </div>
                <Pill tone={t.status === "APPROVED" ? "ok" : t.status === "REJECTED" ? "bad" : "warn"}>{t.status}</Pill>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <PageHead title="Messages" sub="Reminders, offers and news to business owners, from one place." />
      <Tabs
        tabs={[
          { id: "send", label: "Send a message", panel: <SendForm shops={shops} quiet={quiet} /> },
          { id: "auto", label: "Automatic messages", panel: autoPanel },
          { id: "log", label: "What was sent", count: log.messages.filter((m) => m.status === "scheduled").length, panel: logPanel },
        ]}
      />
    </>
  );
}
