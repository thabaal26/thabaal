import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { loadClientRows, planName } from "@/lib/admin-data";
import { CLIENT_COOKIE, VIEW_PREFIX, requireAdminPage } from "@/lib/session";
import { Kpis, N, PageHead, Pill, R } from "../ui";
import { LeaveViewButton, OpenToChange, SupportPicker } from "./support-tools";

export const metadata: Metadata = { title: "Help a client" };
export const dynamic = "force-dynamic";

/**
 * Open any business's own app read-only, exactly as its owner sees it (lib/session.ts: view mode). The frame shows
 * the real dashboard with that business's data; every action that would change something is refused on the server.
 */
export default async function SupportPage() {
  await requireAdminPage();
  const picked = (await cookies()).get(CLIENT_COOKIE)?.value;
  const viewingId = picked?.startsWith(VIEW_PREFIX) ? picked.slice(VIEW_PREFIX.length) : null;
  const { rows } = await loadClientRows();
  const v = viewingId ? rows.find((r) => r.id === viewingId) : undefined;
  const choices = rows.map((r) => ({ id: r.id, name: r.name, sub: [r.owner?.name, r.city].filter(Boolean).join(" · ") }));

  return (
    <>
      <PageHead title="Help a client" sub="Open any business and see their app exactly as they see it." />

      <div className="card mb16">
        <div className="hd" style={{ marginBottom: 10 }}>
          <div>
            <h2>Pick a business to help</h2>
            <p>Type a name, or choose from the list. Their app opens below, read-only.</p>
          </div>
        </div>
        <SupportPicker clients={choices} current={v?.id ?? null} />
      </div>

      {v ? (
        <>
          <div className="card mb16" style={{ borderLeft: "6px solid var(--mango)" }}>
            <div className="hd" style={{ marginBottom: 10 }}>
              <div>
                <h2>{v.name}</h2>
                <p className="muted">
                  {[v.owner?.name, v.city, v.phone].filter(Boolean).join(" · ") || "No owner details saved"} · <Pill tone={v.stateTone}>{v.stateLabel}</Pill>
                </p>
              </div>
              <div className="tools" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link className="btn sm" href={`/admin/clients/${v.id}`}>
                  Client page
                </Link>
                <a className="btn sm" href="/dashboard" target="_blank" rel="noopener noreferrer">
                  Open in a new tab
                </a>
                <OpenToChange clientId={v.id} />
                <LeaveViewButton className="btn sm danger" />
              </div>
            </div>
            <Kpis
              items={[
                { label: "Plan", value: planName(v.plan), note: v.monthly ? `${R(v.monthly)} a month` : v.stateLabel, tone: "mute" },
                { label: "App", value: v.state === "locked" || v.state === "new" ? "Locked" : "Open", note: v.state === "locked" || v.state === "new" ? "only Home, My account and Settings" : "all their sections", tone: v.state === "locked" || v.state === "new" ? "dn" : "up" },
                { label: "WhatsApp", value: v.connected ? "Connected" : "Not connected", note: `${v.usage.numbers} number${v.usage.numbers === 1 ? "" : "s"}`, tone: v.connected ? "up" : "dn" },
                { label: "Customers", value: N(v.customers), note: `${N(v.messages30.sent)} messages in 30 days`, tone: "mute" },
              ]}
            />
            <p className="muted small" style={{ marginTop: 12 }}>
              You are looking at their screen, not changing it. Anything that would change their data is refused. &ldquo;Open to make changes&rdquo; switches to full access instead.
            </p>
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1.5px solid var(--line)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--soft)" }}>
              <span className="dot" style={{ background: "var(--ok)" }} />
              <b>Viewing as the owner of {v.name}</b>
              <span className="pill warn" style={{ marginLeft: "auto" }}>
                View only
              </span>
            </div>
            <iframe title={`${v.name}'s app`} src="/dashboard" style={{ width: "100%", height: "76vh", border: 0, display: "block", background: "var(--bg)" }} />
          </div>
        </>
      ) : (
        <div className="card">
          <div className="hd">
            <div>
              <h2>Nothing open yet</h2>
              <p>Pick a business above and their app appears here.</p>
            </div>
          </div>
          <div className="list">
            <div className="row">
              <div className="grow">
                <div className="t">See exactly what they see</div>
                <div className="muted small">Useful when an owner says a button is missing or an order will not move.</div>
              </div>
            </div>
            <div className="row">
              <div className="grow">
                <div className="t">Check before you call</div>
                <div className="muted small">Their plan, what is paid, and whether the app is locked for them right now.</div>
              </div>
            </div>
            <div className="row">
              <div className="grow">
                <div className="t">You cannot change their data</div>
                <div className="muted small">The view is read-only on the server, so nothing is sent or cancelled by mistake.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
