import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { loadClientRows, loadHistory, planName, type ClientRow, type Tone } from "@/lib/admin-data";
import { APP_TZ } from "@/lib/format";
import { listSignups } from "@/lib/meta-signup";
import { requireAdminPage } from "@/lib/session";
import { BarChart, Donut, HBars, K, Kpis, LineChart, N, PageHead, R, pctOf } from "./ui";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

type Todo = { tone: Tone; title: string; sub: string; action: string; href: string; weight: number };

/** What needs the admin today, worst first. Built only from records: payments, plan dates, numbers, sends. */
function needsYou(rows: ClientRow[], newAccounts: number): Todo[] {
  const out: Todo[] = [];
  for (const r of rows) {
    const page = `/admin/clients/${r.id}`;
    if (r.pending)
      out.push({ tone: "warn", weight: 90, title: `Confirm payment from ${r.name}`, sub: `${R(r.pending.amount)} · UPI reference ${r.pending.utr ?? "not given"}`, action: "Check", href: "/admin/payments" });
    if (r.state === "locked" || r.state === "overdue")
      out.push({
        tone: "bad",
        weight: r.state === "locked" ? 100 : 95,
        title: `${r.name} has not paid`,
        sub: `${planName(r.plan)} · ${R(r.renewal)} · ${r.state === "locked" ? `app locked, ended ${r.days} days ago` : `ended ${r.days} day${r.days === 1 ? "" : "s"} ago`}`,
        action: "Chase",
        href: page,
      });
    if (r.state === "new" && !r.pending)
      out.push({ tone: "bad", weight: 80, title: `${r.name} has never paid`, sub: "Needs a paid plan to use thabaal, so the app is closed for them", action: "Open", href: page });
    if (r.state === "due")
      out.push({ tone: "warn", weight: 60, title: `${r.name} renews in ${r.days} day${r.days === 1 ? "" : "s"}`, sub: `${planName(r.plan)} · ${R(r.renewal)}`, action: "Open", href: page });
    if (!r.connected && (r.state === "ok" || r.state === "due"))
      out.push({ tone: "warn", weight: 70, title: `${r.name} pays but has no WhatsApp number`, sub: `${N(r.customers)} customers waiting · connect their number`, action: "Connect", href: page });
    if (r.numbersRed) out.push({ tone: "bad", weight: 85, title: `${r.name}: a number is rated red by Meta`, sub: "Sending from it is paused to protect it", action: "Open", href: page });
    const tried = r.messages30.sent + r.messages30.failed;
    if (tried >= 10 && r.messages30.failed / tried > 0.15)
      out.push({ tone: "warn", weight: 50, title: `${r.name}: ${pctOf(r.messages30.failed, tried)}% of messages failed`, sub: `${N(r.messages30.failed)} of ${N(tried)} in the last 30 days`, action: "Open", href: page });
    const lim = r.limits;
    if (lim && r.plan !== "business" && (r.usage.campaignsMonth >= lim.camp * 0.9 || r.usage.staff >= lim.staff))
      out.push({ tone: "ok", weight: 30, title: `${r.name} is outgrowing ${planName(r.plan)}`, sub: `${r.usage.campaignsMonth} of ${lim.camp} campaigns · ${r.usage.staff} of ${lim.staff} logins`, action: "Open", href: page });
  }
  if (newAccounts)
    out.push({ tone: "warn", weight: 75, title: `${newAccounts} new WhatsApp account${newAccounts === 1 ? "" : "s"} to attach`, sub: "Finished Meta's sign-up and shared their account with Thabaal", action: "Attach", href: "/admin/clients#new-accounts" });
  return out.sort((a, b) => b.weight - a.weight);
}

export default async function OverviewPage() {
  await requireAdminPage();
  const now = new Date();
  const { rows, purchases } = await loadClientRows(now);
  const [hist, signups] = await Promise.all([loadHistory(purchases, now), listSignups().catch(() => [])]);
  const newAccounts = signups.filter((s) => s.status === "NEW").length;

  const paying = rows.filter((r) => r.state === "ok" || r.state === "due");
  const mrr = paying.reduce((s, r) => s + r.monthly, 0);
  const unpaid = rows.filter((r) => r.state === "overdue" || r.state === "locked");
  const owed = unpaid.reduce((s, r) => s + r.renewal, 0);
  const neverPaid = rows.filter((r) => r.state === "new");
  const pending = rows.filter((r) => r.pending);
  const pendingAmt = pending.reduce((s, r) => s + (r.pending?.amount ?? 0), 0);
  const sent30 = rows.reduce((s, r) => s + r.messages30.sent, 0);
  const salesMonth = rows.reduce((s, r) => s + r.salesMonth, 0);
  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const todo = needsYou(rows, newAccounts);

  const byPlan = (["starter", "growth", "business"] as const).map((k) => paying.filter((r) => r.plan === k).length);
  const noPlan = rows.length - paying.length;
  const collectedBase = last.collected + pendingAmt + owed;

  return (
    <>
      <PageHead
        title="Overview"
        sub="How thabaal is doing, and who needs you today."
        tools={
          <a className="btn" href="/admin/payments/export">
            Export payments (CSV)
          </a>
        }
      />

      <div className="card mb16" style={{ borderLeft: "6px solid var(--mango)" }}>
        <h2 style={{ fontSize: 22, marginBottom: 6 }}>Today, {formatInTimeZone(now, APP_TZ, "d MMMM yyyy")}</h2>
        <p>
          You have <b>{paying.length} paying {paying.length === 1 ? "business" : "businesses"}</b> bringing in <b>{R(mrr)}</b> a month.{" "}
          {unpaid.length ? (
            <>
              <b>{unpaid.length}</b> {unpaid.length === 1 ? "has" : "have"} not renewed, which is <b>{R(owed)}</b> outside.{" "}
            </>
          ) : (
            "Nobody is behind on a renewal. "
          )}
          {neverPaid.length ? (
            <>
              <b>{neverPaid.length}</b> {neverPaid.length === 1 ? "business needs" : "businesses need"} a plan and never paid.{" "}
            </>
          ) : null}
          Together they sent <b>{N(sent30)}</b> WhatsApp messages in the last 30 days and recorded <b>{K(salesMonth)}</b> in sales this month.
        </p>
      </div>

      <Kpis
        className="mb16"
        items={[
          {
            label: "Monthly revenue",
            value: R(mrr),
            note: prev ? `${mrr - prev.mrr >= 0 ? "+" : "−"}${R(Math.abs(mrr - prev.mrr))} vs last month` : "plans paid now",
            tone: prev && mrr < prev.mrr ? "dn" : "up",
            spark: hist.map((h) => h.mrr),
          },
          { label: "Paying businesses", value: String(paying.length), note: `${rows.length} on thabaal`, tone: "mute", spark: hist.map((h) => h.paying) },
          { label: "Money not collected", value: R(owed), note: unpaid.length ? `${unpaid.length} overdue or locked` : "nothing overdue", tone: unpaid.length ? "dn" : "up", sparkColor: "#C0412A" },
          { label: "Waiting for you", value: String(pending.length), note: pending.length ? `${R(pendingAmt)} to confirm` : "no payments to check", tone: pending.length ? "dn" : "mute" },
        ]}
      />

      <div className="g6 mb16">
        <div className="card">
          <div className="hd">
            <div>
              <h2>Revenue and clients</h2>
              <p>Plans in force each month, counted per month (a yearly plan counts a twelfth).</p>
            </div>
          </div>
          <LineChart labels={hist.map((h) => h.label)} vals={hist.map((h) => h.mrr)} label="Monthly revenue by month" />
          <p className="muted small">Paying businesses: {hist.map((h) => `${h.label} ${h.paying}`).join(" · ")}</p>
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Who is on which plan</h2>
            </div>
          </div>
          <Donut
            label="Plan mix"
            mid={String(rows.length)}
            sub="businesses"
            parts={[
              ["Starter", byPlan[0], "#20C985"],
              ["Growth", byPlan[1], "#FFC329"],
              ["Business", byPlan[2], "var(--bar)"],
              ["No plan in force", noPlan, "#C9B99A"],
            ]}
          />
          <p className="muted small" style={{ marginTop: 12 }}>
            &ldquo;No plan in force&rdquo; covers businesses set up before plans (no plan needed), never paid, or not renewed.
          </p>
        </div>
      </div>

      <div className="g6 mb16">
        <div className="card">
          <div className="hd">
            <div>
              <h2>Needs you today</h2>
              <p>Sorted by what costs the most if ignored.</p>
            </div>
          </div>
          {todo.length ? (
            <div className="list">
              {todo.slice(0, 8).map((t) => (
                <div className="row" key={t.title}>
                  <span className="dot" style={{ background: `var(--${t.tone === "bad" ? "bad" : t.tone === "warn" ? "bar2" : "ok"})` }} />
                  <div className="grow">
                    <div className="t">{t.title}</div>
                    <div className="muted small">{t.sub}</div>
                  </div>
                  <Link className="btn sm" href={t.href}>
                    {t.action}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">Nothing needs you right now.</p>
          )}
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Money this month</h2>
              <p>Received, being checked, and renewals not paid.</p>
            </div>
          </div>
          <Donut
            label="Collections"
            mid={collectedBase ? `${pctOf(last.collected, collectedBase)}%` : "–"}
            sub="received"
            fmt={R}
            parts={[
              ["Received", last.collected, "#20C985"],
              ["Being checked", pendingAmt, "#FFC329"],
              ["Not paid", owed, "#C0412A"],
            ]}
          />
        </div>
      </div>

      <div className="g2x">
        <div className="card">
          <div className="hd">
            <div>
              <h2>WhatsApp spend passing through</h2>
              <p>What businesses pay Meta, estimated from delivery reports at Meta&apos;s India rates (before GST). You add no markup.</p>
            </div>
          </div>
          <BarChart labels={hist.map((h) => h.label)} series={[{ name: "Meta charges", vals: hist.map((h) => h.spend), color: "#2B5C86" }]} fmt={K} label="WhatsApp spend by month" />
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Biggest businesses by their own sales</h2>
              <p>Confirmed and paid orders recorded in thabaal, all time.</p>
            </div>
          </div>
          <HBars
            fmt={K}
            empty="No orders recorded yet."
            rows={rows
              .filter((r) => r.salesTotal > 0)
              .sort((a, b) => b.salesTotal - a.salesTotal)
              .slice(0, 6)
              .map((r) => [r.name, r.salesTotal, "var(--bar)"])}
          />
        </div>
      </div>
    </>
  );
}
