import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { cycleName, loadClientRows, planName } from "@/lib/admin-data";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/format";
import { listSignups, recentConnectStarts } from "@/lib/meta-signup";
import { requireAdminPage } from "@/lib/session";
import { NewClientForm } from "../../dashboard/clients/client-forms";
import { AttachSignup } from "../../dashboard/requests/attach-signup";
import { Kpis, PageHead, Pill, R } from "../ui";
import { ClientsTable, type TableRow } from "./clients-table";

export const metadata: Metadata = { title: "All clients" };
export const dynamic = "force-dynamic";

const ago = (d: Date | null, now: Date) => {
  if (!d) return "No activity yet";
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : formatInTimeZone(d, APP_TZ, "d MMM yyyy");
};

export default async function ClientsPage() {
  await requireAdminPage();
  const now = new Date();
  const metaReady = Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim() && process.env.META_APP_SECRET?.trim());
  const [{ rows }, signups, starts, choices] = await Promise.all([
    loadClientRows(now),
    listSignups().catch(() => []),
    recentConnectStarts().catch(() => []),
    db.client.findMany({ select: { id: true, name: true, _count: { select: { numbers: true } } }, orderBy: { name: "asc" } }),
  ]);
  const fresh = signups.filter((s) => s.status === "NEW");
  const waiting = starts.map((s) => choices.find((c) => c.id === s.clientId)).filter((c): c is (typeof choices)[number] => Boolean(c && c._count.numbers === 0));
  const suggestedId = waiting.length === 1 ? waiting[0].id : undefined;

  const paying = rows.filter((r) => r.state === "ok" || r.state === "due");
  const atRisk = rows.filter((r) => r.health === "bad");
  const upgrade = rows.filter((r) => r.limits && r.plan !== "business" && (r.usage.campaignsMonth >= r.limits.camp * 0.9 || r.usage.staff >= r.limits.staff));
  const table: TableRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sub: [r.owner?.name, r.city].filter(Boolean).join(" · ") || "No owner login yet",
    plan: r.plan,
    planLabel: planName(r.plan),
    cycleLabel: r.cycle ? cycleName(r.cycle) : r.state === "unmanaged" ? "set up before plans" : "–",
    state: r.state,
    stateTone: r.stateTone,
    stateLabel: r.stateLabel,
    monthly: r.monthly,
    renewal: r.renewal,
    camp: r.usage.campaignsMonth,
    campLimit: r.limits?.camp ?? null,
    tmpl: r.usage.templates,
    tmplLimit: r.limits?.tmpl ?? null,
    sales: r.salesTotal,
    health: r.health,
    healthLabel: r.healthLabel,
    risk: r.risk,
    last: ago(r.lastActivity, now),
    created: r.createdAt.getTime(),
  }));

  return (
    <>
      <PageHead title="All clients" sub="Every business on thabaal, what they pay and how much they use it." tools={<NewClientForm />} />

      <Kpis
        className="mb16"
        items={[
          { label: "Businesses on thabaal", value: String(rows.length), note: `${paying.length} paying now`, tone: "mute" },
          { label: "Average per paying business", value: paying.length ? R(paying.reduce((s, r) => s + r.monthly, 0) / paying.length) : "–", note: "a month", tone: "mute" },
          { label: "At risk", value: String(atRisk.length), note: "unpaid, not connected or quiet", tone: atRisk.length ? "dn" : "up" },
          { label: "Ready to upgrade", value: String(upgrade.length), note: "at 90% of a plan limit", tone: upgrade.length ? "up" : "mute" },
        ]}
      />

      {signups.length > 0 && (
        <div className="card mb16" id="new-accounts" style={{ borderLeft: `6px solid var(--${fresh.length ? "bar2" : "line"})` }}>
          <div className="hd">
            <div>
              <h2 style={{ fontSize: 17 }}>New WhatsApp accounts</h2>
              <p className="muted small">
                Businesses that finished Meta&apos;s sign-up link and shared their WhatsApp account with Thabaal. Attach each one to its business.
              </p>
            </div>
            <Pill tone={fresh.length ? "warn" : "ok"}>{fresh.length ? `${fresh.length} waiting` : "Nothing waiting"}</Pill>
          </div>
          {!metaReady && (
            <p className="muted small" style={{ marginBottom: 8 }}>
              Attach is off until <b>META_SYSTEM_USER_TOKEN</b> is added in Vercel. New accounts are still listed here.
            </p>
          )}
          {waiting.length > 0 && (
            <p className="muted small" style={{ marginBottom: 8 }}>
              Pressed Connect in the last 6 hours (not connected yet): {waiting.map((c) => c.name).join(", ")}.{suggestedId ? " Picked for you below." : ""}
            </p>
          )}
          <div className="list">
            {signups.map((s) => (
              <div key={s.id} className="row">
                <div className="grow">
                  <div className="t">WhatsApp account {s.wabaId}</div>
                  <div className="muted small">
                    Customer business {s.ownerBusinessId ?? "unknown"} · received {formatInTimeZone(new Date(s.createdAt), APP_TZ, "d MMM yyyy, h:mm a")}
                    {s.status === "ATTACHED" ? ` · attached to ${choices.find((c) => c.id === s.clientId)?.name ?? "a business"}` : s.status === "IGNORED" ? " · hidden" : ""}
                  </div>
                </div>
                {s.status === "NEW" ? (
                  <AttachSignup signupId={s.id} choices={choices.map((c) => ({ id: c.id, name: c.name, numbers: c._count.numbers }))} ready={metaReady} suggestedId={suggestedId} />
                ) : (
                  <Pill tone={s.status === "ATTACHED" ? "ok" : "mute"}>{s.status === "ATTACHED" ? "Attached" : "Hidden"}</Pill>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ClientsTable rows={table} />
    </>
  );
}
