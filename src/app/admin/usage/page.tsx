import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { loadClientRows, loadHistory, loadUsage } from "@/lib/admin-data";
import { APP_TZ } from "@/lib/format";
import { requireAdminPage } from "@/lib/session";
import { Tabs } from "../nav";
import { BarChart, ComingNext, HBars, K, Kpis, N, PageHead, Pill, R, pctOf } from "../ui";

export const metadata: Metadata = { title: "Usage and analytics" };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  await requireAdminPage();
  const now = new Date();
  const { rows, purchases } = await loadClientRows(now);
  const [hist, usage] = await Promise.all([loadHistory(purchases, now), loadUsage(now)]);
  const sent = rows.reduce((s, r) => s + r.messages30.sent, 0);
  const read = rows.reduce((s, r) => s + r.messages30.read, 0);
  const replied = rows.reduce((s, r) => s + r.messages30.replied, 0);
  const spend = rows.reduce((s, r) => s + r.spendMonth, 0);
  const maxDay = Math.max(1, ...usage.days.map((d) => d.messages));
  const slipping = [...rows].sort((a, b) => b.risk - a.risk);
  const ago = (d: Date | null) => {
    if (!d) return "Never";
    const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
    return days <= 0 ? "Today" : days === 1 ? "Yesterday" : days < 30 ? `${days} days ago` : formatInTimeZone(d, APP_TZ, "d MMM");
  };

  return (
    <>
      <PageHead title="Usage and analytics" sub="What businesses actually do with thabaal, and what it costs them at Meta." />
      <Kpis
        className="mb16"
        items={[
          { label: "Messages sent", value: N(sent), note: "all businesses, last 30 days", tone: "mute" },
          { label: "Read", value: `${pctOf(read, sent)}%`, note: `${N(read)} read`, tone: "mute" },
          { label: "Replied", value: `${pctOf(replied, sent)}%`, note: `${N(replied)} customer replies`, tone: "mute" },
          { label: "Meta charges", value: R(spend), note: "this month, estimated", tone: "mute", spark: hist.map((h) => h.spend), sparkColor: "#2B5C86" },
        ]}
      />
      <Tabs
        tabs={[
          {
            id: "feat",
            label: "What they use",
            panel: (
              <>
                <div className="card mb16">
                  <div className="hd">
                    <div>
                      <h2>Work done through thabaal</h2>
                      <p>Campaign runs started and templates created, month by month, across all businesses.</p>
                    </div>
                  </div>
                  <BarChart
                    labels={usage.work.map((w) => w.label)}
                    series={[
                      { name: "Campaigns run", vals: usage.work.map((w) => w.campaigns), color: "#FFC329" },
                      { name: "Templates made", vals: usage.work.map((w) => w.templates), color: "var(--bar)" },
                    ]}
                    label="Campaigns and templates by month"
                  />
                  <div className="legend">
                    <span style={{ ["--c" as string]: "#FFC329" }}>Campaigns run</span>
                    <span style={{ ["--c" as string]: "var(--bar)" }}>Templates made</span>
                  </div>
                </div>
                <ComingNext
                  title="Which sections and buttons get used: coming in phase 2"
                  items={["Share of businesses that opened each section this month", "Most pressed buttons across all businesses", "Sign-ins per business and when they last opened the app"]}
                >
                  thabaal does not record page opens or button presses yet, so these charts from the design stay empty rather than show made-up numbers. Phase 2 adds a small activity log.
                </ComingNext>
              </>
            ),
          },
          {
            id: "wa",
            label: "WhatsApp and Meta",
            panel: (
              <>
                <div className="g6 mb16">
                  <div className="card">
                    <div className="hd">
                      <div>
                        <h2>Meta charges by business</h2>
                        <p>This month, estimated from delivery reports at Meta&apos;s India rates (before GST). You take no cut.</p>
                      </div>
                    </div>
                    <HBars
                      fmt={R}
                      empty="No charged messages this month."
                      rows={rows
                        .filter((r) => r.spendMonth > 0)
                        .sort((a, b) => b.spendMonth - a.spendMonth)
                        .map((r) => [r.name, r.spendMonth, "#2B5C86"])}
                    />
                  </div>
                  <div className="card">
                    <div className="hd">
                      <div>
                        <h2>Did the messages work?</h2>
                        <p>Last 30 days, all businesses.</p>
                      </div>
                    </div>
                    <div className="funnel">
                      <div className="s" style={{ width: "100%" }}>
                        Sent <span>{N(sent)}</span>
                      </div>
                      <div className="s" style={{ width: `${Math.max(30, pctOf(read, sent))}%`, background: "var(--info)" }}>
                        Read <span>{pctOf(read, sent)}%</span>
                      </div>
                      <div className="s" style={{ width: `${Math.max(30, pctOf(replied, sent))}%`, background: "var(--ok)" }}>
                        Replied <span>{pctOf(replied, sent)}%</span>
                      </div>
                    </div>
                    <p className="muted small" style={{ marginTop: 12 }}>
                      Replies count every customer message received, so a reply rate can include chats that were not answers to a campaign.
                    </p>
                  </div>
                </div>
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>Sales for every rupee of Meta charges</h2>
                      <p>This month: confirmed and paid orders recorded in thabaal, divided by the estimated Meta charges.</p>
                    </div>
                  </div>
                  <HBars
                    fmt={(n) => `${R(n)} per ₹1`}
                    empty="Needs both sales and charged messages this month."
                    rows={rows
                      .filter((r) => r.spendMonth > 0 && r.salesMonth > 0)
                      .map((r) => [r.name, r.salesMonth / r.spendMonth, "var(--ok)"] as [string, number, string])
                      .sort((a, b) => b[1] - a[1])}
                  />
                </div>
              </>
            ),
          },
          {
            id: "stick",
            label: "Who is slipping",
            panel: (
              <div className="g6">
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: "18px 20px 4px" }}>
                    <h2>Businesses to call this week</h2>
                    <p className="muted small">Unpaid, not connected, or quiet. These leave first.</p>
                  </div>
                  <div className="tw">
                    <table className="dt">
                      <thead>
                        <tr>
                          <th>Business</th>
                          <th>Last activity</th>
                          <th className="num">Sent (30d)</th>
                          <th className="num">Campaigns</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slipping.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                              {r.reasons.length > 0 && <div className="muted small">{r.reasons.join(", ")}</div>}
                            </td>
                            <td className="small">{ago(r.lastActivity)}</td>
                            <td className="num">{N(r.messages30.sent)}</td>
                            <td className="num">{r.usage.campaignsMonth}</td>
                            <td>
                              <Pill tone={r.health}>{r.healthLabel}</Pill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>Messages sent per day</h2>
                      <p>Last 14 days, all businesses. Darker means more messages.</p>
                    </div>
                  </div>
                  <div className="heat">
                    {usage.days.map((d) => (
                      <i
                        key={d.key}
                        title={`${d.date}: ${N(d.messages)} messages from ${d.shops} business${d.shops === 1 ? "" : "es"}`}
                        style={{ background: d.messages ? `rgba(255,195,41,${0.18 + 0.82 * (d.messages / maxDay)})` : undefined }}
                      />
                    ))}
                  </div>
                  <div className="heatlab">
                    {usage.days.map((d) => (
                      <span key={d.key}>{d.label}</span>
                    ))}
                  </div>
                  <h2 style={{ fontSize: 17, margin: "18px 0 8px" }}>Paying businesses, month by month</h2>
                  <BarChart labels={hist.map((h) => h.label)} series={[{ name: "Paying", vals: hist.map((h) => h.paying), color: "#20C985" }]} h={160} label="Paying businesses by month" />
                  <p className="muted small">Spend history: {hist.map((h) => `${h.label} ${K(h.spend)}`).join(" · ")}</p>
                </div>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
