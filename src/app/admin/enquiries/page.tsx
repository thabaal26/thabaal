import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { PLANS } from "@/lib/account-plans";
import { loadClientRows } from "@/lib/admin-data";
import { APP_TZ } from "@/lib/format";
import { daysTo, isOpenStage, leadFunnel, LEAD_SOURCES } from "@/lib/lead-stages";
import { dayKey, loadLeads, todayKey } from "@/lib/leads";
import { loadPlanPrices } from "@/lib/plan-prices-server";
import { requireAdminPage } from "@/lib/session";
import { BarChart, HBars, Kpis, PageHead, Pill, R } from "../ui";
import { LeadDialog } from "./lead-form";
import { LeadsView, type LeadRow } from "./leads-view";

export const metadata: Metadata = { title: "Enquiries" };
export const dynamic = "force-dynamic";

const NEW_DAYS = 30;
const WEEKS = 8;
const SOURCE_COLORS = ["#FFC329", "#20C985", "#2B5C86", "#F46B4E", "#8E5AC6"];

export default async function EnquiriesPage() {
  const me = await requireAdminPage();
  const now = new Date();
  const today = todayKey(now);
  const [{ leads, team }, prices, { rows }] = await Promise.all([loadLeads(), loadPlanPrices(), loadClientRows(now)]);
  const planName = (k: string | null) => PLANS.find((p) => p.k === k)?.n ?? null;

  const view: LeadRow[] = leads.map((l) => ({
    id: l.id,
    shop: l.shop,
    person: l.person,
    town: l.town,
    phone: l.phone,
    sells: l.sells,
    source: l.source,
    plan: l.plan,
    planName: planName(l.plan),
    stage: l.stage,
    nextOn: dayKey(l.nextOn),
    came: formatInTimeZone(l.createdAt, APP_TZ, "d MMM yyyy"),
    ownerId: l.ownerId,
    ownerName: l.owner ? l.owner.name || l.owner.email : null,
    note: l.note,
    clientName: l.client?.name ?? null,
  }));

  const open = leads.filter((l) => isOpenStage(l.stage));
  const waiting = open.filter((l) => (daysTo(dayKey(l.nextOn), today) ?? 1) <= 0).length;
  const won = leads.filter((l) => l.stage === "won").length;
  const lost = leads.filter((l) => l.stage === "lost").length;
  const worth = open.reduce((s, l) => s + (l.plan && l.plan in prices ? prices[l.plan as keyof typeof prices].m : 0), 0);
  const { steps, widest } = leadFunnel(leads);

  // Week by week: enquiries that came in, and enquiries won (by the day they were closed).
  const weekStart = (d: Date) => {
    const day = formatInTimeZone(d, APP_TZ, "yyyy-MM-dd");
    const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
    return new Date(Date.parse(`${day}T00:00:00Z`) - dow * 86_400_000).toISOString().slice(0, 10);
  };
  const thisWeek = weekStart(now);
  const weeks = Array.from({ length: WEEKS }, (_, i) => new Date(Date.parse(`${thisWeek}T00:00:00Z`) - (WEEKS - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10));
  const got = weeks.map((w) => leads.filter((l) => weekStart(l.createdAt) === w).length);
  const wins = weeks.map((w) => leads.filter((l) => l.stage === "won" && l.closedAt && weekStart(l.closedAt) === w).length);

  const sources = LEAD_SOURCES.map((s, i) => [s, leads.filter((l) => l.source === s).length, SOURCE_COLORS[i]] as [string, number, string]).filter((s) => s[1] > 0);
  const people = team.map((t) => {
    const mine = leads.filter((l) => l.ownerId === t.id);
    return {
      ...t,
      handled: mine.length,
      won: mine.filter((l) => l.stage === "won").length,
      late: mine.filter((l) => isOpenStage(l.stage) && (daysTo(dayKey(l.nextOn), today) ?? 0) < 0).length,
    };
  });
  const paying = leads.filter((l) => l.clientId && rows.some((r) => r.id === l.clientId && (r.state === "ok" || r.state === "due"))).length;
  const fresh = rows.filter((r) => r.createdAt.getTime() >= now.getTime() - NEW_DAYS * 86_400_000).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const insights = (
    <>
      <div className="g6 mb16">
        <div className="card">
          <div className="hd">
            <div>
              <h2>From enquiry to paying shop</h2>
              <p>Where people drop off, by the furthest step each enquiry reached. The widest gap is where to spend your time.</p>
            </div>
          </div>
          {leads.length ? (
            <div className="funnel">
              {steps.map(([label, n], i) => {
                const p = Math.round((n / leads.length) * 100);
                return (
                  <div key={label} className="s" style={{ width: `${Math.max(34, p)}%`, background: i === steps.length - 1 ? "var(--bar4)" : undefined }}>
                    {label} <span>{`${n} · ${p}%`}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small">Shows once there are enquiries.</p>
          )}
          <p className="muted small" style={{ marginTop: 12 }}>
            {widest ? `You lose the most people at ${widest[0]}: ${widest[1]} of ${leads.length}. Fix that one step before chasing more enquiries.` : ""}
            {leads.some((l) => l.clientId) ? ` ${paying} of the businesses made from enquiries are paying now.` : ""}
          </p>
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Where they come from</h2>
              <p>Every enquiry so far, by where it came from.</p>
            </div>
          </div>
          <HBars rows={sources} empty="No enquiries yet." />
        </div>
      </div>
      <div className="g6 mb16">
        <div className="card">
          <div className="hd">
            <div>
              <h2>Enquiries and wins, week by week</h2>
              <p>Last {WEEKS} weeks, Monday to Sunday.</p>
            </div>
          </div>
          <BarChart
            labels={weeks.map((w) => formatInTimeZone(new Date(`${w}T12:00:00Z`), "UTC", "d MMM"))}
            series={[
              { name: "Enquiries", vals: got, color: "#FFC329" },
              { name: "Became shops", vals: wins, color: "#20C985" },
            ]}
            h={210}
            label="Enquiries and wins by week"
          />
          <div className="legend">
            <span style={{ ["--c" as string]: "#FFC329" }}>Enquiries</span>
            <span style={{ ["--c" as string]: "#20C985" }}>Became shops</span>
          </div>
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>How the team is doing</h2>
              <p>Enquiries each person follows up.</p>
            </div>
          </div>
          <HBars rows={people.map((p) => [p.name, p.handled, "var(--bar)"])} fmt={(v) => `${v} leads`} />
          <div className="list" style={{ marginTop: 14 }}>
            {people.map((p) => (
              <div className="row" key={p.id}>
                <div className="grow">
                  <div className="t">{p.name}</div>
                  <div className="muted small">
                    {p.won} won · {p.handled} handled
                  </div>
                </div>
                {p.late ? <Pill tone="bad">{`${p.late} late`}</Pill> : <Pill tone="ok">Up to date</Pill>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="hd">
          <div>
            <h2>Signed up on their own in the last {NEW_DAYS} days</h2>
            <p>Businesses that created an account themselves (or were added by you).</p>
          </div>
          <Pill tone="info">{String(fresh.length)}</Pill>
        </div>
        {fresh.length ? (
          <div className="list">
            {fresh.map((r) => (
              <div className="row" key={r.id}>
                <div className="grow">
                  <div className="t">
                    <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                    {r.city ? <span className="muted small"> · {r.city}</span> : null}
                  </div>
                  <div className="muted small">
                    {r.owner ? `${r.owner.name} <${r.owner.email}>` : "No owner login yet"} · joined {formatInTimeZone(r.createdAt, APP_TZ, "d MMM yyyy")}
                  </div>
                </div>
                <Pill tone={r.stateTone}>{r.stateLabel}</Pill>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">No new businesses in the last {NEW_DAYS} days.</p>
        )}
      </div>
    </>
  );

  return (
    <>
      <PageHead title="Enquiries" sub="Everyone who asked about thabaal, and what to do next." />
      <Kpis
        className="mb16"
        items={[
          { label: "Open enquiries", value: String(open.length), note: "in the pipeline now", tone: "mute" },
          { label: "Waiting on you", value: String(waiting), note: waiting ? "follow up today" : "all up to date", tone: waiting ? "dn" : "up" },
          { label: "If they all say yes", value: R(worth), note: "a month, from open enquiries", tone: "mute" },
          {
            label: "Turned into shops",
            value: won + lost ? `${Math.round((won / (won + lost)) * 100)}%` : "—",
            note: `${won} won, ${lost} lost`,
            tone: "up",
          },
        ]}
      />
      <LeadsView leads={view} team={team} today={today} insights={insights} addButton={<LeadDialog team={team} me={me.id} />} />
    </>
  );
}
