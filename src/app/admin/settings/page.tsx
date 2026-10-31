import type { Metadata } from "next";
import Link from "next/link";
import { PLANS, SUPPLIER_INFO } from "@/lib/account-plans";
import { isDefault } from "@/lib/plan-prices";
import { loadPlanPrices } from "@/lib/plan-prices-server";
import { loadClientRows } from "@/lib/admin-data";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/session";
import { GRACE_DAYS, WARN_DAYS } from "@/lib/subscription-core";
import { PaymentSettingsForm } from "../../dashboard/wallet/wallet-forms";
import { OpenPortalSettings } from "../support/support-tools";
import { PageHead, Pill, R } from "../ui";
import { InviteAdmin } from "./invite-admin";
import { PlanRequiredToggle } from "./plan-toggle";
import { PriceEditor } from "./price-editor";
import { razorpayStatus } from "@/lib/razorpay-billing";
import { RazorpayTest } from "./razorpay-test";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const [{ rows }, setting, admins, rzp, prices] = await Promise.all([
    loadClientRows(),
    db.setting.findUnique({ where: { id: 1 } }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    razorpayStatus(),
    loadPlanPrices(),
  ]);
  const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const paying = rows.filter((r) => r.state === "ok" || r.state === "due");

  return (
    <>
      <PageHead title="Settings" sub="Plans and prices, what happens when a business doesn't pay, and your team." tools={<OpenPortalSettings />} />
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
                <p>What a new business is offered, GST included. Changing a price here does not change businesses already subscribed.</p>
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
                      <td className="num">{R(prices[p.k].m)}</td>
                      <td className="num">{R(prices[p.k].q)}</td>
                      <td className="num">{R(prices[p.k].y)}</td>
                      <td className="num">{paying.filter((r) => r.plan === p.k).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tools" style={{ marginTop: 14 }}>
              <PriceEditor prices={prices} />
              <span className="muted small">
                {setting?.planPricesAt && !isDefault(prices)
                  ? `Changed by ${setting.planPricesBy ?? "an admin"} on ${when(setting.planPricesAt)}. The website and My account show these.`
                  : "The original prices. The website and My account show these."}
              </span>
            </div>
          </div>

          <div className="card">
            <div className="hd">
              <div>
                <h2>Wallet recharges and GST</h2>
                <p>Plans are paid only by Razorpay auto-pay. These details are for wallet recharges and the bills.</p>
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
            <p className="muted small" style={{ marginTop: 12 }}>
              Bills change to a GST tax invoice automatically once GST is switched on with a GST number under Wallet recharges and GST.
            </p>
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
            <p className="muted small" style={{ marginTop: 12 }}>
              These are the same for every business. To never lock one business, switch off &ldquo;Needs a paid plan&rdquo; for it below.
            </p>
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
            <div className="tools" style={{ marginTop: 14 }}>
              <InviteAdmin />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
