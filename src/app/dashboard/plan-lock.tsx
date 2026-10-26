// The page a locked business sees instead of a closed section (plan not paid; lib/plan-access.ts).
// Home, My account and Settings never call this, so the owner can always reach the payment and their details.

import Link from "@/components/intent-link";
import { redirect } from "next/navigation";
import { PLANS, inr } from "@/lib/account-plans";
import { isSectionEnabled, type ClientSectionId } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { clientAccess } from "@/lib/plan-access";
import { getScope } from "@/lib/session";
import "./account/account.css";

/**
 * Returns the lock screen when the signed-in business is locked, otherwise null (render the page).
 * With `section`, a business that has that section switched off (Clients › sections, e.g. a marketing-only
 * business without Orders) is sent to Home, so the page can't be opened by typing its address.
 */
export async function planGate(section?: ClientSectionId) {
  const scope = await getScope();
  if (section && scope.clientId) {
    const c = await db.client.findUnique({ where: { id: scope.clientId }, select: { disabledSections: true } });
    if (!isSectionEnabled(c?.disabledSections, section)) redirect("/dashboard");
  }
  if (!scope.planLocked || !scope.clientId) return null;
  const access = await clientAccess(scope.clientId);
  const plan = PLANS.find((p) => p.k === access.plan);
  const cycle = access.cycle === "q" || access.cycle === "y" ? access.cycle : "m";
  const isNew = access.state === "new";
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
        <div className="lockbox" role="region" aria-labelledby="plan-lock-title">
          <div className="ic" aria-hidden>
            !
          </div>
          <h2 id="plan-lock-title">{isNew ? "Pay to start using thabaal" : "Your plan payment is due"}</h2>
          <p className="muted">
            {isNew
              ? "Your account is ready. Make the first payment and everything opens up as soon as thabaal verifies it."
              : "We have not received this period's payment, so thabaal is paused. Pay now and it opens again as soon as we confirm."}
          </p>
          <div className="amt">{plan ? inr(plan.p[cycle]) : `From ${inr(PLANS[0].p.m)}`}</div>
          <div className="muted small">{plan ? `${plan.n} plan` : "a month"}</div>
          {access.pending ? (
            <p className="small" style={{ marginTop: 16 }}>
              <b>We are checking your payment</b> (UPI reference {access.pending.utr}). This page opens as soon as thabaal verifies it,
              usually within one working day.
            </p>
          ) : null}
          <div className="acts">
            {!access.pending && scope.manager && (
              <>
                <Link className="btn primary" href="/dashboard/account?pay=now">
                  Pay now by UPI
                </Link>
                <Link className="btn" href="/dashboard/account?pay=ref">
                  I have already paid
                </Link>
              </>
            )}
            {!access.pending && !scope.manager && <p className="muted small">Ask the business owner to pay for the plan in My account.</p>}
            {access.pending && (
              <Link className="btn primary" href="/dashboard/account">
                See my payment
              </Link>
            )}
            <a className="btn ghost" href="https://wa.me/916379140626?text=Hi%20thabaal%2C%20I%20need%20help%20with%20my%20payment" target="_blank" rel="noopener noreferrer">
              WhatsApp thabaal · 6379140626
            </a>
            <Link className="btn ghost" href="/dashboard">
              Go to Home
            </Link>
          </div>
          <p className="fine">
            Nothing is deleted. Your customers, orders and products are safe and come back the moment the payment is confirmed.
            <br />
            Messages keep arriving on WhatsApp while thabaal is paused, so pay soon to avoid missing orders.
          </p>
        </div>
    </div>
  );
}
