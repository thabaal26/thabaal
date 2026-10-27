import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { CYCLE_NAMES, PLANS, inr, type BillingCycle } from "@/lib/account-plans";
import { adminQueue } from "@/lib/admin-queue";
import { db } from "@/lib/db";
import { THABAAL_INBOX } from "@/lib/email";
import { APP_TZ } from "@/lib/format";
import { getScope } from "@/lib/session";
import { PendingRow } from "../account/admin-plan-panel";
import { Pill, PortalPage } from "../portal-ui";
import { listSignups } from "@/lib/meta-signup";
import { AttachSignup } from "./attach-signup";
import { OpenBusiness } from "./open-business";

export const metadata: Metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const when = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy, h:mm a");
const planName = (k: string) => PLANS.find((p) => p.k === k)?.n ?? k;
const cycleName = (c: string) => CYCLE_NAMES[c as BillingCycle]?.en ?? c;
const NEW_DAYS = 30;

/**
 * Thabaal admin only: everything that needs the owner's eye in one place. Plan payments clients sent for checking
 * (each is also emailed to the Thabaal inbox), businesses that signed up themselves, and what was decided lately.
 */
export default async function RequestsPage() {
  const scope = await getScope();
  if (!scope.isAdmin) redirect("/dashboard");

  const now = new Date();
  const metaReady = Boolean(process.env.META_SYSTEM_USER_TOKEN?.trim() && process.env.META_APP_SECRET?.trim());
  const since = new Date(now.getTime() - NEW_DAYS * 86_400_000);
  const [queue, signups, choices, fresh, decided] = await Promise.all([
    adminQueue(now, null),
    listSignups(),
    db.client.findMany({ select: { id: true, name: true, _count: { select: { numbers: true } } }, orderBy: { name: "asc" } }),
    db.client.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        homeCity: true,
        createdAt: true,
        planPurchases: { select: { status: true, plan: true, cycle: true } },
        users: { where: { role: "CLIENT" }, orderBy: { createdAt: "asc" }, take: 1, select: { name: true, email: true } },
      },
    }),
    db.planPurchase.findMany({
      where: { status: { in: ["VERIFIED", "REJECTED"] } },
      orderBy: { decidedAt: "desc" },
      take: 10,
      include: { client: { select: { name: true } } },
    }),
  ]);

  return (
    <PortalPage title="Requests" titleTa="கோரிக்கைகள்" sub="Payments to check and new businesses. New payments are also emailed to your inbox." subTa="சரிபார்க்க வேண்டிய பணம் மற்றும் புதிய வணிகங்கள். புதிய பணம் உங்கள் மின்னஞ்சலுக்கும் வரும்.">
      <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--bar2)" }}>
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>Payments to check</h2>
            <p className="muted small">
              Match each UPI reference with your bank entry before pressing verify. Each one was also emailed to {THABAAL_INBOX}.
            </p>
          </div>
          <Pill tone={queue.length ? "warn" : "ok"}>{queue.length ? `${queue.length} waiting` : "Nothing waiting"}</Pill>
        </div>
        {queue.length > 0 ? (
          <div className="list">
            {queue.map((r) => (
              <PendingRow key={r.id} row={r} showClient />
            ))}
          </div>
        ) : (
          <p className="muted small">When a business presses &ldquo;Send for checking&rdquo;, it appears here straight away.</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>New WhatsApp accounts</h2>
            <p className="muted small">
              Businesses that finished Meta&apos;s sign-up link and shared their WhatsApp account with Thabaal. Attach each one to its business. A
              business that already has a number connected can&apos;t be picked.
            </p>
          </div>
          <Pill tone={signups.some((s) => s.status === "NEW") ? "warn" : "ok"}>
            {signups.some((s) => s.status === "NEW") ? `${signups.filter((s) => s.status === "NEW").length} waiting` : "Nothing waiting"}
          </Pill>
        </div>
        {!metaReady && (
          <p className="muted small" style={{ marginBottom: 8 }}>
            Attach is switched off until <b>META_SYSTEM_USER_TOKEN</b> (Thabaal&apos;s system user token from Meta) is added in Vercel. New accounts are still listed here.
          </p>
        )}
        {signups.length > 0 ? (
          <div className="list">
            {signups.map((s) => {
              const who = choices.find((c) => c.id === s.clientId)?.name;
              return (
                <div key={s.id} className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div className="grow" style={{ minWidth: 220 }}>
                    <div className="t">
                      <b>WhatsApp account {s.wabaId}</b>
                    </div>
                    <div className="muted small">
                      Customer business {s.ownerBusinessId ?? "unknown"} · received {when(new Date(s.createdAt))}
                      {s.status === "ATTACHED" ? ` · attached to ${who ?? "a business"}` : s.status === "IGNORED" ? " · hidden" : ""}
                    </div>
                  </div>
                  {s.status === "NEW" ? (
                    <AttachSignup signupId={s.id} choices={choices.map((c) => ({ id: c.id, name: c.name, numbers: c._count.numbers }))} ready={metaReady} />
                  ) : (
                    <Pill tone={s.status === "ATTACHED" ? "ok" : "mute"}>{s.status === "ATTACHED" ? "Attached" : "Hidden"}</Pill>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">When a business completes the Meta sign-up link, its WhatsApp account appears here.</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>New businesses</h2>
            <p className="muted small">Signed up in the last {NEW_DAYS} days, with the owner login that was created.</p>
          </div>
          <Pill tone="info">{String(fresh.length)}</Pill>
        </div>
        {fresh.length > 0 ? (
          <div className="list">
            {fresh.map((c) => {
              const owner = c.users[0];
              const active = c.planPurchases.some((p) => p.status === "VERIFIED");
              const waiting = c.planPurchases.some((p) => p.status === "PENDING");
              const tone = active ? "ok" : waiting ? "warn" : "mute";
              const state = active ? "Plan active" : waiting ? "Payment waiting for you" : "Has not paid yet";
              return (
                <div key={c.id} className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div className="grow" style={{ minWidth: 220 }}>
                    <div className="t">
                      <b>{c.name}</b>
                      {c.homeCity ? ` · ${c.homeCity}` : ""}
                    </div>
                    <div className="muted small">
                      {owner ? `${owner.name ?? "Owner"} <${owner.email}>` : "No owner login yet"} · signed up {when(c.createdAt)}
                    </div>
                  </div>
                  <Pill tone={tone}>{state}</Pill>
                  <OpenBusiness clientId={c.id} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">No new businesses in the last {NEW_DAYS} days.</p>
        )}
      </div>

      <div className="card">
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>Recently checked</h2>
            <p className="muted small">The last payments you verified or turned down.</p>
          </div>
        </div>
        {decided.length > 0 ? (
          <div className="list">
            {decided.map((p) => (
              <div key={p.id} className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                <div className="grow" style={{ minWidth: 220 }}>
                  <div className="t">
                    <b>{p.client.name}</b> · {planName(p.plan)} · {cycleName(p.cycle)} · {inr(p.amountPaise / 100)}
                  </div>
                  <div className="muted small">
                    UPI reference {p.utr ?? "-"} · {p.status === "VERIFIED" ? "verified" : "turned down"}
                    {p.decidedBy ? ` by ${p.decidedBy}` : ""}
                    {p.decidedAt ? ` on ${when(p.decidedAt)}` : ""}
                  </div>
                </div>
                <Pill tone={p.status === "VERIFIED" ? "ok" : "bad"}>{p.status === "VERIFIED" ? "Verified" : "Turned down"}</Pill>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">Nothing checked yet.</p>
        )}
      </div>
    </PortalPage>
  );
}
