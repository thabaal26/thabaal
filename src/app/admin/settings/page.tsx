import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, SUPPLIER_INFO } from "@/lib/account-plans";
import { loadClientRows } from "@/lib/admin-data";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";
import { GRACE_DAYS, WARN_DAYS } from "@/lib/subscription-core";
import { PaymentSettingsForm } from "../../dashboard/wallet/wallet-forms";
import { OpenPortalSettings } from "../support/support-tools";
import { ComingNext, PageHead, Pill, R } from "../ui";
import { PlanRequiredToggle } from "./plan-toggle";
import { razorpayStatus } from "@/lib/razorpay-billing";
import { RazorpayTest } from "./razorpay-test";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const [{ rows }, setting, admins, rzp] = await Promise.all([
    loadClientRows(),
    db.setting.findUnique({ where: { id: 1 } }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    razorpayStatus(),
  ]);
  const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const paying = rows.filter((r) => r.state === "ok" || r.state === "due");

  return (
    <>
      <PageHead title="Settings" sub="Plans, how businesses pay, what happens when they don't, and your team." tools={<OpenPortalSettings />} />
      <div className="g2x">
        <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="hd">
              <div>
                <h2>Razorpay</h2>
                <p>Plan auto-renew and wallet recharges. Keys live in Vercel; only the key type is shown here.</p>
              </div>
              {rzp.configured ? <Pill tone={rzp.mode === "live" ? "ok" : "warn"}>{rzp.mode === "live" ? "Live" : "Test mode"}</Pill> : <Pill tone="bad">Not set up</Pill>}
            </div>
            <div className="list">
              <div className="row">
                <div className="grow muted">API key</div>
                <b>{rzp.keyIdHint ?? "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing"}</b>
              </div>
              <div className="row">
                <div className="grow muted">Webhook secret</div>
                {rzp.webhookSecret ? <Pill tone="ok">Set</Pill> : <Pill tone="bad">RAZORPAY_WEBHOOK_SECRET missing</Pill>}
              </div>
              <div className="row">
                <div className="grow muted">Last webhook</div>
                <b>{rzp.events[0] ? `${rzp.events[0].event} · ${when(rzp.events[0].createdAt)}` : "None received yet"}</b>
              </div>
            </div>
            {rzp.configured && (
              <div style={{ marginTop: 14 }}>
                <p className="muted small" style={{ marginBottom: 8 }}>
                  Live test: pays ₹1 with the real keys, checks the signature and the webhook, and changes no business. Refund it from the Razorpay dashboard.
                </p>
                <RazorpayTest hasTestSub={rzp.recent.some((r) => r.purpose === "test" && r.kind === "subscription" && ["authenticated", "active", "pending", "halted"].includes(r.status))} />
              </div>
            )}
            {rzp.recent.length > 0 && (
              <div className="tw" style={{ marginTop: 14 }}>
                <table className="dt">
                  <thead>
                    <tr>
                      <th>What</th>
                      <th>Business</th>
                      <th className="num">Amount</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rzp.recent.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <b>{r.purpose === "test" ? "Test" : r.purpose === "wallet" ? "Wallet recharge" : `Plan ${r.plan ?? ""}`}</b>
                          <div className="muted small">{r.kind === "subscription" ? "Auto-renew" : "One-time"} · {r.rzpId}</div>
                          {r.note && <div className="muted small">{r.note}</div>}
                        </td>
                        <td>{rows.find((c) => c.id === r.clientId)?.name ?? (r.clientId ? "—" : "Thabaal")}</td>
                        <td className="num">{R(r.amountPaise / 100)}</td>
                        <td>
                          <Pill tone={["paid", "active", "authenticated"].includes(r.status) ? "ok" : ["failed", "halted", "pending"].includes(r.status) ? "bad" : "info"}>{r.status}</Pill>
                        </td>
                        <td className="muted small">{when(r.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Plans and prices</h2>
                <p>What a new business is offered, GST included. Businesses already on a plan keep the price they paid.</p>
              </div>
            </div>
            <div className="tw">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th className="num">Monthly</th>
                    <th className="num">3 months</th>
                    <th className="num">12 months</th>
                    <th className="num">Paying now</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANS.map((p) => (
                    <tr key={p.k}>
                      <td>
                        <b>{p.n}</b>
                        <div className="muted small">
                          {p.lim.num} numbers · {p.lim.staff} logins · {p.lim.camp} campaigns · {p.lim.tmpl} templates
                        </div>
                      </td>
                      <td className="num">{R(p.p.m)}</td>
                      <td className="num">{R(p.p.q)}</td>
                      <td className="num">{R(p.p.y)}</td>
                      <td className="num">{paying.filter((r) => r.plan === p.k).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Prices are set in the app&apos;s code today (lib/account-plans.ts), the same list the website and My account show. Editing them here comes in phase 2.
            </p>
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Ways a business can pay</h2>
                <p>Online through Razorpay (added straight away), or by UPI to {SUPPLIER_INFO.vpa} with a reference you confirm under Payments.</p>
              </div>
            </div>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Wallet recharges (for businesses billed through the Thabaal wallet) use the details below. GST stays off until Thabaal&apos;s GSTIN is active.
            </p>
            <PaymentSettingsForm
              initial={{ upiId: setting?.walletUpiId ?? "", payee: setting?.walletPayee ?? "", gstEnabled: setting?.gstEnabled ?? false, gstin: setting?.gstin ?? "" }}
            />
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Billing identity</h2>
                <p>Printed on every bill a business downloads.</p>
              </div>
            </div>
            <div className="list">
              <div className="row">
                <div className="grow muted">Business name</div>
                <b>{SUPPLIER_INFO.legal}</b>
              </div>
              <div className="row">
                <div className="grow muted">Place</div>
                <b>{SUPPLIER_INFO.addr}</b>
              </div>
              <div className="row">
                <div className="grow muted">GST</div>
                {setting?.gstEnabled && setting.gstin ? <b>{setting.gstin}</b> : <Pill tone="warn">Not registered</Pill>}
              </div>
              <div className="row">
                <div className="grow muted">Document type</div>
                <b>{setting?.gstEnabled && setting.gstin ? "Tax invoice" : "Bill of Supply"}</b>
              </div>
              <div className="row">
                <div className="grow muted">WhatsApp / phone</div>
                <b>{SUPPLIER_INFO.phone}</b>
              </div>
              <div className="row">
                <div className="grow muted">Email</div>
                <b>{SUPPLIER_INFO.email}</b>
              </div>
            </div>
          </div>
        </div>

        <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="hd">
              <div>
                <h2>What happens when a business does not pay</h2>
              </div>
            </div>
            <div className="list">
              <div className="row">
                <div className="grow">
                  <div className="t">Warning before the plan ends</div>
                  <div className="muted small">The owner sees a reminder bar this many days before the end.</div>
                </div>
                <b>{WARN_DAYS} days</b>
              </div>
              <div className="row">
                <div className="grow">
                  <div className="t">Grace days for everyone</div>
                  <div className="muted small">Everything keeps working this long after the plan ends, with a red warning. Then the app locks.</div>
                </div>
                <b>{GRACE_DAYS} days</b>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <ComingNext title="Coming in phase 2" items={["Change the grace days here", "A longer grace period for one business you trust", "One switch to stop locking anybody"]}>
                These rules are fixed in the app today (lib/subscription-core.ts).
              </ComingNext>
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Needs a paid plan</h2>
                <p>Switched on, the business must pay to use thabaal. Off means nothing is ever locked for it.</p>
              </div>
            </div>
            <div className="list">
              {rows.map((r) => (
                <div className="row" key={r.id}>
                  <div className="grow">
                    <div className="t">
                      <Link href={`/admin/clients/${r.id}`}>{r.name}</Link>
                    </div>
                    <div className="muted small">
                      <Pill tone={r.stateTone}>{r.stateLabel}</Pill>
                    </div>
                  </div>
                  <PlanRequiredToggle clientId={r.id} name={r.name} required={r.planRequired} />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Who can sign in here</h2>
                <p>Admin logins see every business and this panel.</p>
              </div>
            </div>
            <div className="list">
              {admins.map((a) => (
                <div className="row" key={a.id}>
                  <div className="grow">
                    <div className="t">{a.name || a.email}</div>
                    <div className="muted small">{a.email}</div>
                  </div>
                  <Pill tone="info">Admin</Pill>
                </div>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Inviting another admin from here comes in phase 2. Today admin logins are created on the server.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
