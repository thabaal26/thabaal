import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { PLANS } from "@/lib/account-plans";
import { APP_TZ } from "@/lib/format";
import { daysTo, isOpenStage, LEAD_STAGES, stageName } from "@/lib/lead-stages";
import { dayKey, loadLead, loadLeads, todayKey } from "@/lib/leads";
import { loadPlanPrices } from "@/lib/plan-prices-server";
import { requireAdminPage } from "@/lib/session";
import { PageHead, Pill, R } from "../../ui";
import { CallForm, ConvertForm, FollowUpForm, StageButtons } from "../lead-actions";
import { LeadDialog } from "../lead-form";

export const metadata: Metadata = { title: "Enquiry" };
export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, string> = { created: "ok", converted: "ok", stage: "", call: "", next: "", edit: "" };

/** One enquiry in full: what they told us, moving it along, the next step and everything that has happened. */
export default async function EnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdminPage();
  const { id } = await params;
  const [lead, { team }, prices] = await Promise.all([loadLead(id), loadLeads(), loadPlanPrices()]);
  if (!lead) notFound();
  const today = todayKey();
  const next = dayKey(lead.nextOn);
  const d = isOpenStage(lead.stage) ? daysTo(next, today) : null;
  const stage = LEAD_STAGES.find((s) => s.k === lead.stage);
  const plan = PLANS.find((p) => p.k === lead.plan);
  const owner = lead.owner ? lead.owner.name || lead.owner.email : null;
  const when = (t: Date) => formatInTimeZone(t, APP_TZ, "d MMM yyyy, h:mm a");
  const hello = `Vanakkam${lead.person ? ` ${lead.person}` : ""}, this is thabaal. You asked about running ${lead.shop} on WhatsApp. Shall I show you how it works in 10 minutes?`;

  return (
    <>
      <PageHead
        title={lead.shop}
        sub={[lead.person, lead.town, lead.phone].filter(Boolean).join(" · ")}
        tools={
          <>
            <Link className="btn sm" href="/admin/enquiries">
              All enquiries
            </Link>
            <LeadDialog
              team={team}
              me={me.id}
              lead={{
                id: lead.id,
                shop: lead.shop,
                person: lead.person ?? "",
                phone: lead.phone,
                town: lead.town ?? "",
                sells: lead.sells ?? "",
                source: lead.source,
                plan: lead.plan ?? "",
                ownerId: lead.ownerId ?? "",
                note: lead.note ?? "",
              }}
            />
          </>
        }
      />
      <div className="tools mb16" style={{ flexWrap: "wrap" }}>
        <span className="pill" style={{ background: "transparent", border: `1.5px solid ${stage?.color ?? "var(--line)"}` }}>
          {stageName(lead.stage)}
        </span>
        {plan && <span className="pill">Asked about {plan.n}</span>}
        {lead.client && <Pill tone="ok">Business: {lead.client.name}</Pill>}
        <span className="muted small">
          From {lead.source} on {formatInTimeZone(lead.createdAt, APP_TZ, "d MMM yyyy")}
        </span>
      </div>

      <div className="g2x">
        <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="kpi" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
            <div className="card">
              <div className="l">They would pay</div>
              <div className="v">{plan ? R(prices[plan.k].m) : "—"}</div>
              <div className="d mute">{plan ? "a month, if they join" : "no plan picked yet"}</div>
            </div>
            <div className="card">
              <div className="l">Next follow-up</div>
              <div className="v" style={{ fontSize: 17 }}>
                {next && isOpenStage(lead.stage) ? formatInTimeZone(new Date(`${next}T12:00:00Z`), "UTC", "d MMM yyyy") : "Not set"}
              </div>
              <div className={`d ${d !== null && d < 0 ? "dn" : "mute"}`}>
                {d === null ? (isOpenStage(lead.stage) ? "set one below" : "closed") : d < 0 ? `${-d} days late` : d === 0 ? "today" : `in ${d} days`}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>What they told us</h2>
              </div>
            </div>
            <div className="list">
              <div className="row">
                <div className="grow muted">What they sell</div>
                <b>{lead.sells ?? "—"}</b>
              </div>
              <div className="row">
                <div className="grow muted">Where the enquiry came from</div>
                <b>{lead.source}</b>
              </div>
              <div className="row">
                <div className="grow muted">Looking after it</div>
                <b>{owner ?? "Nobody yet"}</b>
              </div>
              <div className="row">
                <div className="grow muted">Phone</div>
                <b>{lead.phone}</b>
              </div>
            </div>
            {lead.note && (
              <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 14 }}>
                <div className="muted small" style={{ marginBottom: 4 }}>
                  In their words
                </div>
                <b style={{ whiteSpace: "pre-wrap" }}>{lead.note}</b>
              </div>
            )}
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Move it along</h2>
              </div>
            </div>
            <StageButtons id={lead.id} stage={lead.stage} locked={!!lead.clientId} />
          </div>

          {lead.stage === "won" && !lead.clientId && (
            <div className="card" style={{ borderLeft: "6px solid var(--bar4)" }}>
              <div className="hd">
                <div>
                  <h2>Make it a business</h2>
                  <p>They said yes. Add them to All clients without typing it all again.</p>
                </div>
              </div>
              <ConvertForm id={lead.id} shop={lead.shop} town={lead.town ?? ""} />
            </div>
          )}
          {lead.client && (
            <div className="card">
              <div className="hd">
                <div>
                  <h2>The business</h2>
                  <p>This enquiry became {lead.client.name}.</p>
                </div>
                <Link className="btn sm primary" href={`/admin/clients/${lead.client.id}`}>
                  Open the business
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="hd">
              <div>
                <h2>Next step</h2>
              </div>
              <a className="btn sm primary" href={`https://wa.me/91${lead.phone}?text=${encodeURIComponent(hello)}`} target="_blank" rel="noopener noreferrer">
                WhatsApp them
              </a>
            </div>
            <CallForm id={lead.id} open={isOpenStage(lead.stage)} today={today} />
            {isOpenStage(lead.stage) && (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <FollowUpForm id={lead.id} current={next} today={today} />
              </div>
            )}
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>What has happened</h2>
              </div>
            </div>
            <div className="tl">
              {lead.activity.map((a) => (
                <div key={a.id} className={`e ${KIND_TONE[a.kind] ?? ""}`}>
                  <b style={{ whiteSpace: "pre-wrap" }}>{a.kind === "call" ? `Call: ${a.text}` : a.text}</b>
                  <div className="d">
                    {when(a.createdAt)} · {a.by}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
