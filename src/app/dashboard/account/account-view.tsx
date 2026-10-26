"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/intent-link";
import { Copy, ExternalLink, FileText, Inbox, Megaphone, MessageCircle, Printer, Users, X } from "@/components/icons";
import { toast } from "@/components/toast";
import { PortalPage, Pill, T } from "../portal-ui";
import {
  ADDONS,
  BillingCycle,
  BillingProfile,
  CYCLE_NAMES,
  CYCLE_SUFFIX,
  INDIAN_STATES,
  PLAN_COMPARISON_ROWS,
  PlanKey,
  PLANS,
  QR_CODES,
  SUPPLIER_INFO,
  inr,
  inrDec,
  numberToWordsINR,
} from "@/lib/account-plans";
import { saveBillingDetails, sendPlanPayment, submitCustomWorkRequest, withdrawPlanPayment } from "../actions/account";
import type { AccessState } from "@/lib/subscription-core";
import type { BillingView, HistoryRow } from "./billing-types";
import "./account.css";

export type AccountViewProps = {
  /** Plan periods and payments, built on the server from stored timestamps (page.tsx). */
  billing: BillingView;
  usage: {
    numbers: number;
    staff: number;
    campaigns: number;
    templates: number;
  };
  billingProfile: BillingProfile;
  customWorkRequests?: Array<{
    t: string;
    d: string;
    u: string;
    p: string;
    on: string;
    st: string;
  }>;
  /** Thabaal admin's payment checks, shown above everything else. */
  adminPanel?: ReactNode;
};

const CYCLE_LENGTH: Record<BillingCycle, string> = { m: "1 month", q: "3 months", y: "12 months" };
const planOf = (k: string | null | undefined) => PLANS.find((p) => p.k === k) ?? null;

const ACCESS_LABEL: Record<AccessState, string> = {
  ok: "paid",
  due: "due soon",
  overdue: "overdue",
  locked: "locked",
  new: "never paid",
  unmanaged: "no plan required yet",
};

const PHASE: Record<HistoryRow["phase"], { label: string; tone: "ok" | "warn" | "bad" | "info" | "mute" }> = {
  awaiting_verification: { label: "Awaiting verification", tone: "warn" },
  scheduled: { label: "Paid · starts later", tone: "info" },
  active: { label: "Active", tone: "ok" },
  ended: { label: "Ended", tone: "mute" },
  rejected: { label: "Not received", tone: "bad" },
  cancelled: { label: "Withdrawn", tone: "mute" },
};

export function AccountView({ billing, usage, billingProfile: initialProfile, customWorkRequests: initialCW = [], adminPanel }: AccountViewProps) {
  const router = useRouter();
  const notify = (text: string, ok = true) => toast(ok, text);
  const [busy, startBusy] = useTransition();

  // Active Tab: 'sub' (My plan) | 'plans' (Change plan) | 'pay' (Payments) | 'acct' (Business & help)
  // Arriving from a closed section's lock screen (?pay=now or ?pay=ref) opens the payment steps straight away.
  const canAutoPay = billing.autoPay !== null && billing.canPay && !billing.block;
  const [activeTab, setActiveTab] = useState<"sub" | "plans" | "pay" | "acct">(canAutoPay && !billing.renew ? "plans" : "sub");

  // The plan in force now comes only from a verified period covering this moment (server). Clicking a plan
  // never changes it: it opens the purchase steps below, which end in a payment waiting to be verified.
  const active = billing.active;
  const curPlan = planOf(active?.plan);
  const currentPlanKey: PlanKey | null = curPlan?.k ?? null;
  const currentCycle: BillingCycle | null = active?.cycle ?? null;
  const [viewCycle, setViewCycle] = useState<BillingCycle>(currentCycle ?? "m");

  // Billing and profile state
  const [biz, setBiz] = useState<BillingProfile>(initialProfile);
  const [savingBiz, setSavingBiz] = useState(false);
  const [bizMsg, setBizMsg] = useState("");

  // Custom work list
  const [cwList, setCwList] = useState(initialCW);

  // Purchase steps: 1 confirm what is bought and when it starts, 2 pay by UPI, 3 send the UPI reference.
  const [buy, setBuy] = useState<{ plan: PlanKey; cycle: BillingCycle } | null>(canAutoPay && billing.renew ? billing.renew : null);
  const [buyStep, setBuyStep] = useState<1 | 2 | 3>(billing.autoPay === "ref" ? 3 : 1);
  const [utrNumber, setUtrNumber] = useState("");
  const [payDate, setPayDate] = useState(billing.todayLabel);
  const [payApp, setPayApp] = useState("GPay");

  // Bill viewer
  const [billRow, setBillRow] = useState<HistoryRow | null>(null);

  // Custom work modal
  const [cwModalOpen, setCwModalOpen] = useState(false);
  const [cwCategory, setCwCategory] = useState("More capacity (campaigns, templates, numbers)");
  const [cwDescription, setCwDescription] = useState("");
  const [cwUrgency, setCwUrgency] = useState("Within a month");
  const [cwPhone, setCwPhone] = useState(initialProfile.mobile || "");

  // Stop / pause modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("Too costly for now");

  const buyPlan = planOf(buy?.plan);
  const buyPrice = buyPlan && buy ? buyPlan.p[buy.cycle] : 0;
  const canStartPurchase = billing.canPay && !billing.block;
  // The newest payment (history is newest first), to tell the client when their last one wasn't found.
  const latestRejected = billing.history[0]?.phase === "rejected" ? billing.history[0] : null;

  /** Opens the purchase steps for a plan and cycle. Nothing is saved until the UPI reference is sent. */
  const openBuy = (plan: PlanKey, cycle: BillingCycle) => {
    if (!billing.canPay) {
      notify("Only the business owner or a manager can pay for the plan.", false);
      return;
    }
    if (billing.block) {
      notify(billing.block.message, false);
      return;
    }
    setBuy({ plan, cycle });
    setBuyStep(1);
    setUtrNumber("");
  };
  const closeBuy = () => setBuy(null);

  /** Pay for the next period of the plan in force, or the last one (or pick one when there is none). */
  const renew = billing.renew;
  const payNext = () => {
    if (renew) openBuy(renew.plan, renew.cycle);
    else setActiveTab("plans");
  };

  // Where the account stands for access (server: lib/subscription-core.ts accessState). Thabaal admins can preview
  // what the owner sees in each state; the preview only changes this page, never the business's real access.
  const [sim, setSim] = useState<AccessState | "">("");
  const shown: AccessState = sim || billing.access.state;
  const [lockDismissed, setLockDismissed] = useState(canAutoPay);
  const lockShown = (shown === "locked" || shown === "new") && (sim !== "" || !lockDismissed);
  const renewPlan = planOf(renew?.plan) ?? (sim ? planOf("growth") : null);
  const renewCycle: BillingCycle = renew?.cycle ?? "m";
  const renewPrice = renewPlan ? renewPlan.p[renewCycle] : null;
  const dueDays = sim === "due" ? 3 : billing.access.days;

  /** "I have already paid": straight to the step that takes the UPI reference. */
  const alreadyPaid = () => {
    if (!renew) {
      setActiveTab("plans");
      notify("Pick the plan you paid for, then send the reference.");
      return;
    }
    openBuy(renew.plan, renew.cycle);
    setBuyStep(3);
  };


  // Send the UPI reference: recorded as waiting to be checked. The plan doesn't change.
  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!buy) return;
    const ref = utrNumber.trim().replace(/\s+/g, "");
    if (!/^[A-Za-z0-9]{6,22}$/.test(ref)) {
      notify("Please check the UPI reference (UTR): 6 to 22 letters or digits.", false);
      return;
    }
    startBusy(async () => {
      const res = await sendPlanPayment({ plan: buy.plan, cycle: buy.cycle, utr: ref, payApp, paidOn: payDate });
      notify(res.message, res.ok);
      if (res.ok) {
        setBuy(null);
        setActiveTab("sub");
        window.scrollTo({ top: 0, behavior: "smooth" });
        router.refresh();
      }
    });
  };

  const handleWithdraw = (id: string) => {
    startBusy(async () => {
      const res = await withdrawPlanPayment(id);
      notify(res.message, res.ok);
      if (res.ok) router.refresh();
    });
  };

  // Save billing details form
  const handleSaveBiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!biz.shopName?.trim() || !biz.mobile?.trim()) {
      setBizMsg("Please fill the shop name and mobile number.");
      return;
    }
    setSavingBiz(true);
    const res = await saveBillingDetails(biz);
    setSavingBiz(false);
    if (res.ok) {
      setBizMsg("Saved. These will print on your bills.");
      notify("Billing details saved");
    } else {
      setBizMsg(res.message || "Failed to save details");
    }
  };

  /** Sends a request to Thabaal (custom work, add-ons, stopping). Nothing changes until Thabaal acts on it. */
  const sendRequest = async (category: string, description: string, urgency = "Within a month", phone = cwPhone) => {
    const res = await submitCustomWorkRequest({ category, description, urgency, phone });
    if (res.ok) {
      setCwList((list) => [
        { t: category, d: description, u: urgency, p: phone, on: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), st: "Sent" },
        ...list,
      ]);
    }
    return res;
  };

  // Submit custom work request
  const handleCustomWorkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cwDescription.trim()) {
      notify("Please explain what you need in your own words.", false);
      return;
    }
    const res = await sendRequest(cwCategory, cwDescription.trim(), cwUrgency, cwPhone);
    notify(res.message ?? (res.ok ? "Request sent." : "Could not send the request."), res.ok);
    if (res.ok) {
      setCwModalOpen(false);
      setCwDescription("");
    }
  };

  const requestAddon = async (what: string, price: string) => {
    const res = await sendRequest(`Add-on: ${what}`, `Please add ${what} (${price}). Limits change once the add-on is paid and confirmed.`);
    notify(res.ok ? `Request sent for ${what}. Your limits change only after it is paid and confirmed.` : (res.message ?? "Could not send the request."), res.ok);
  };

  // QR Code and UPI link for the plan being bought: the amount is the plan's price for that cycle.
  const qrDataUrl = buy ? (QR_CODES[`${buy.plan}-${buy.cycle}`] ?? null) : null;
  const upiDeepLink =
    buy && buyPlan
      ? `upi://pay?pa=${encodeURIComponent(SUPPLIER_INFO.vpa)}&pn=${encodeURIComponent(SUPPLIER_INFO.legal)}&cu=INR&am=${buyPrice.toFixed(
          2,
        )}&tn=${encodeURIComponent(`thabaal ${buyPlan.n} ${CYCLE_NAMES[buy.cycle].en}`)}`
      : "#";

  // Limits come only from the plan in force now.
  const limits = curPlan?.lim ?? null;
  const isStaffFull = limits ? usage.staff >= limits.staff : false;
  const isCampNearLimit = limits ? usage.campaigns / limits.camp >= 0.8 : false;

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => notify(`${label} copied`),
        () => notify(`${label}: ${text}`),
      );
    } else {
      notify(`${label}: ${text}`);
    }
  };

  /** When a payment for `cycle` would start and end, from the server's dates. */
  const timing = (cycle: BillingCycle) =>
    billing.nextStartLabel && billing.nextEndLabels
      ? { starts: billing.nextStartLabel, ends: billing.nextEndLabels[cycle], fixed: true }
      : { starts: "the moment Thabaal verifies your payment", ends: `${CYCLE_LENGTH[cycle]} after that`, fixed: false };

  const pendingPlan = planOf(billing.pending?.plan);
  const scheduledPlan = planOf(billing.scheduled?.plan);
  const endedPlan = planOf(billing.lastEnded?.plan);

  return (
    <PortalPage
      title="My account"
      titleTa="என் கணக்கு"
      sub="Your plan, payments and invoices."
      subTa="உங்கள் திட்டம், கட்டணங்கள் மற்றும் ரசீதுகள்."
      actions={
        billing.canPay && !billing.block ? (
          <button type="button" className="btn primary" onClick={payNext}>
            <T ta="கட்டணம் செலுத்து">{active ? "Pay for next period" : "Choose a plan"}</T>
          </button>
        ) : null
      }
    >
      <div className="acct">
      {adminPanel}

      {/* Where the account stands: every line here comes from stored, verified dates. */}
      {billing.pending && (
        <div className="duebar warn">
          <div className="grow">
            <b>We are checking your payment.</b> {pendingPlan?.n} · {CYCLE_NAMES[billing.pending.cycle].en} · {inr(billing.pending.amount)}, UPI reference{" "}
            {billing.pending.utr}, sent {billing.pending.submittedLabel}. It is not counted as paid until Thabaal verifies it, usually
            within one working day. {active ? `Your ${curPlan?.n} plan keeps working as it is.` : ""}
          </div>
          {billing.canPay && (
            <button type="button" className="btn sm" disabled={busy} onClick={() => handleWithdraw(billing.pending!.id)}>
              Withdraw
            </button>
          )}
        </div>
      )}
      {billing.scheduled && (
        <div className="duebar info">
          <div className="grow">
            <b>
              {scheduledPlan?.n} ({CYCLE_NAMES[billing.scheduled.cycle].en}) is paid and verified.
            </b>{" "}
            It starts {billing.scheduled.startsLabel} and runs to {billing.scheduled.endsLabel}.
            {active ? ` Until then you stay on ${curPlan?.n}.` : ""}
          </div>
        </div>
      )}
      {latestRejected && (
        <div className="duebar bad">
          <div className="grow">
            <b>We could not find your payment</b> with UPI reference {latestRejected.utr}
            {latestRejected.note ? `: ${latestRejected.note}` : ""}. Check the reference in your UPI app and send it again, or
            WhatsApp us on 6379140626.
          </div>
        </div>
      )}
      {shown === "due" && (
        <div className="duebar warn">
          <div className="grow">
            <b>
              Payment due in {dueDays} day{dueDays === 1 ? "" : "s"}.
            </b>{" "}
            Pay now so nothing stops. The new period starts exactly when this one ends{active ? ` (${active.endsLabel})` : ""}.
          </div>
          {billing.canPay && !billing.block && renewPrice !== null && (
            <button type="button" className="btn sm primary" onClick={payNext}>
              Pay {inr(renewPrice)}
            </button>
          )}
        </div>
      )}
      {shown === "overdue" && (
        <div className="duebar bad">
          <div className="grow">
            <b>Payment is overdue.</b> thabaal will pause{billing.access.locksOnLabel && !sim ? ` on ${billing.access.locksOnLabel}` : ""} until this
            period&apos;s payment is received.
          </div>
          {billing.canPay && !billing.block && renewPrice !== null && (
            <button type="button" className="btn sm primary" onClick={payNext}>
              Pay {inr(renewPrice)}
            </button>
          )}
        </div>
      )}
      {(shown === "locked" || shown === "new") && (
        <div className="duebar bad">
          <div className="grow">
            <b>{shown === "new" ? "Pay to start using thabaal." : "thabaal is paused."}</b> Only Home, My account and Settings open until your
            payment is verified. Nothing is deleted.
          </div>
          {billing.canPay && !billing.block && (
            <button type="button" className="btn sm primary" onClick={payNext}>
              {renewPrice !== null ? `Pay ${inr(renewPrice)}` : "Choose a plan"}
            </button>
          )}
        </div>
      )}
      {shown === "unmanaged" && !billing.pending && (
        <div className="duebar info">
          <div className="grow">
            <b>No paid plan is on record for this business yet.</b> Choose a plan and pay by UPI. It starts when Thabaal verifies the payment.
          </div>
          {billing.canPay && !billing.block && (
            <button type="button" className="btn sm primary" onClick={() => setActiveTab("plans")}>
              See plans
            </button>
          )}
        </div>
      )}

      {/* Locked or never paid: the same box the closed sections show (plan-lock.tsx), with the payment steps here. */}
      {lockShown && (
        <div className="lockwrap" role="dialog" aria-modal="true" aria-labelledby="ac-lock-title">
          <div className="lockbox">
            <div className="ic" aria-hidden>
              !
            </div>
            <h2 id="ac-lock-title">{shown === "new" ? "Pay to start using thabaal" : "Your plan payment is due"}</h2>
            <p className="muted">
              {shown === "new"
                ? "Your account is ready. Make the first payment and everything opens up as soon as thabaal verifies it."
                : "We have not received this period's payment, so thabaal is paused. Pay now and it opens again as soon as we confirm."}
            </p>
            <div className="amt">{renewPrice !== null ? inr(renewPrice) : `From ${inr(PLANS[0].p.m)}`}</div>
            <div className="muted small">{renewPlan ? `${renewPlan.n} plan` : "a month"}</div>
            {billing.pending && !sim ? (
              <p className="small" style={{ marginTop: 16 }}>
                <b>We are checking your payment</b> (UPI reference {billing.pending.utr}). thabaal opens as soon as it is verified, usually within one
                working day.
              </p>
            ) : null}
            <div className="acts">
              {(sim || (!billing.pending && billing.canPay)) && (
                <>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => {
                      if (sim) return notify("Preview only: this opens the UPI payment for the shop owner.");
                      setLockDismissed(true);
                      payNext();
                    }}
                  >
                    Pay now by UPI
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (sim) return notify("Preview only: this asks the shop owner for the UPI reference.");
                      setLockDismissed(true);
                      alreadyPaid();
                    }}
                  >
                    I have already paid
                  </button>
                </>
              )}
              {!sim && !billing.pending && !billing.canPay && <p className="muted small">Ask the business owner to pay for the plan.</p>}
              <a className="btn ghost" href="https://wa.me/916379140626?text=Hi%20thabaal%2C%20I%20need%20help%20with%20my%20payment" target="_blank" rel="noopener noreferrer">
                WhatsApp thabaal · 6379140626
              </a>
              {sim ? (
                <button type="button" className="btn ghost" onClick={() => setSim("")}>
                  Close preview and go back
                </button>
              ) : (
                <button type="button" className="btn ghost" onClick={() => setLockDismissed(true)}>
                  Not now, show my account
                </button>
              )}
            </div>
            <p className="fine">
              Nothing is deleted. Your customers, orders and products are safe and come back the moment the payment is confirmed.
              <br />
              Messages keep arriving on WhatsApp while thabaal is paused, so pay soon to avoid missing orders.
            </p>
          </div>
        </div>
      )}

      {/* Tabs List */}
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "sub"}
          onClick={() => setActiveTab("sub")}
        >
          <T ta="என் திட்டம்">My plan</T>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "plans"}
          onClick={() => setActiveTab("plans")}
        >
          <T ta="திட்டம் மாற்று">Change plan</T>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pay"}
          onClick={() => setActiveTab("pay")}
        >
          <T ta="பணம் & ரசீதுகள்">Payments and invoices</T>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "acct"}
          onClick={() => setActiveTab("acct")}
        >
          <T ta="வணிகம் & உதவி">Business and help</T>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MY PLAN (sub)                                                      */}
      {/* ========================================================================= */}
      {activeTab === "sub" && (
        <section>
          {/* Thabaal admin only: see this page as the shop owner would in each state. Changes nothing for real. */}
          {billing.isAdmin && (
            <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--bar2)" }}>
              <div className="hd" style={{ marginBottom: 0, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 17 }}>Preview: what the shop owner sees</h2>
                  <p className="muted small">
                    Thabaal admin only. It changes this page for you, not the business&apos;s real access (now: {ACCESS_LABEL[billing.access.state]}).
                  </p>
                </div>
                <div className="seg" role="group" aria-label="Preview the account state">
                  {(
                    [
                      ["ok", "Paid"],
                      ["due", "Due soon"],
                      ["overdue", "Overdue"],
                      ["locked", "Locked"],
                      ["new", "Never paid"],
                    ] as [AccessState, string][]
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={shown === v}
                      onClick={() => {
                        setSim(v);
                        notify(`Preview: ${label.toLowerCase()}`);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Usage capacity alert */}
          {isStaffFull && limits && (
            <div className="alert">
              <div className="grow">
                <b>All {limits.staff} staff logins are in use.</b>
                <div className="muted small">
                  To add another person, ask for an extra login at ₹{ADDONS.staff.price} a month
                  {currentPlanKey !== "business" ? " or move to a bigger plan." : "."}
                </div>
              </div>
              <button type="button" className="btn sm primary" onClick={() => requestAddon("one extra staff login", `₹${ADDONS.staff.price} a month`)}>
                Ask for a login
              </button>
            </div>
          )}
          {!isStaffFull && isCampNearLimit && limits && (
            <div className="alert">
              <div className="grow">
                <b>
                  You have used {usage.campaigns} of {limits.camp} campaigns this month.
                </b>
                <div className="muted small">A bigger plan gives you more campaigns.</div>
              </div>
              <button type="button" className="btn sm primary" onClick={() => setActiveTab("plans")}>
                See plans
              </button>
            </div>
          )}

          {/* Hero Section */}
          <div className="hero">
            <div className="card">
              {active && curPlan ? (
                <>
                  <div className="plan-h">
                    <span className="pn">
                      <T ta={curPlan.nTa}>{curPlan.n}</T>
                    </span>
                    <Pill tone="ok">Active</Pill>
                  </div>
                  <div className="muted" style={{ margin: "4px 0 14px" }}>
                    <T ta={curPlan.tagTa}>{curPlan.tag}</T>
                  </div>
                  <div className="big">
                    <span>{inr(active.amount)}</span>{" "}
                    <small className="muted" style={{ fontSize: 15, fontWeight: 500 }}>
                      <T ta={`${CYCLE_SUFFIX[active.cycle].ta}, கூடுதல் கட்டணம் இல்லை`}>{`${CYCLE_SUFFIX[active.cycle].en}, no extra charges`}</T>
                    </small>
                  </div>
                  <div className="list" style={{ margin: "10px 0 16px" }}>
                    <div className="row">
                      <div className="grow muted small">Paid through</div>
                      <b>{active.endsLabel}</b>
                    </div>
                    <div className="row">
                      <div className="grow muted small">Time left</div>
                      <b>{active.leftLabel}</b>
                    </div>
                    <div className="row">
                      <div className="grow muted small">This period started</div>
                      <span>{active.startsLabel}</span>
                    </div>
                  </div>
                  <p className="muted small" style={{ marginBottom: 14 }}>
                    thabaal never takes money automatically. Pay for the next period any time; it starts exactly when this one ends.
                  </p>
                </>
              ) : (
                <>
                  <div className="plan-h">
                    <span className="pn">
                      <T ta="செயலில் உள்ள திட்டம் இல்லை">No active plan</T>
                    </span>
                    <Pill tone={billing.status === "expired" ? "bad" : "mute"}>{billing.status === "expired" ? "Ended" : "Not started"}</Pill>
                  </div>
                  <p className="muted" style={{ margin: "6px 0 16px" }}>
                    {billing.status === "expired" && endedPlan && billing.lastEnded
                      ? `Your ${endedPlan.n} plan ended on ${billing.lastEnded.endsLabel}.`
                      : "No paid period is on record for this business yet."}{" "}
                    A new plan starts when Thabaal verifies your payment.
                  </p>
                </>
              )}
              <div className="tools">
                <button type="button" className="btn primary" onClick={() => setActiveTab("plans")}>
                  <T ta="திட்டம் மாற்று">{active ? "Change plan" : "Choose a plan"}</T>
                </button>
                <button type="button" className="btn" onClick={() => setActiveTab("pay")}>
                  <T ta="ரசீதுகள்">Payments and bills</T>
                </button>
              </div>
            </div>

            <div className="due">
              {billing.scheduled && scheduledPlan ? (
                <div>
                  <div className="l">Next period · paid</div>
                  <div className="v">{scheduledPlan.n}</div>
                  <div className="l">
                    {CYCLE_NAMES[billing.scheduled.cycle].en} · starts {billing.scheduled.startsLabel}
                  </div>
                  <div className="l">ends {billing.scheduled.endsLabel}</div>
                </div>
              ) : billing.pending && pendingPlan ? (
                <div>
                  <div className="l">Payment being checked</div>
                  <div className="v">{inr(billing.pending.amount)}</div>
                  <div className="l">
                    {pendingPlan.n} · {CYCLE_NAMES[billing.pending.cycle].en} · reference {billing.pending.utr}
                  </div>
                  <div className="l">
                    {billing.nextStartLabel ? `If verified, starts ${billing.nextStartLabel}` : "Starts when Thabaal verifies it"}
                  </div>
                </div>
              ) : active && curPlan ? (
                <>
                  <div>
                    <div className="l">Next period</div>
                    <div className="v">{inr(curPlan.p[active.cycle])}</div>
                    <div className="l">
                      Pay before {active.endsLabel} · {active.leftLabel}
                    </div>
                  </div>
                  {billing.canPay && (
                    <button type="button" className="btn primary" onClick={payNext}>
                      <T ta="கட்டணம் செலுத்து">Pay now</T>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <div className="l">To start</div>
                    <div className="v">Pick a plan</div>
                    <div className="l">From {inr(PLANS[0].p.m)} a month</div>
                  </div>
                  <button type="button" className="btn primary" onClick={() => setActiveTab("plans")}>
                    See plans
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Real Usage Meters: limits are the plan in force now */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="hd">
              <div>
                <h2>
                  <T ta="பயன்பாடு விவரங்கள்">What you are using</T>
                </h2>
                <p>
                  {limits ? (
                    <T ta="இந்த மாதத்தில் உங்கள் திட்டத்தின் பயன்பாடு அளவு.">How much of your plan is used this month.</T>
                  ) : (
                    "There is no plan in force, so no limits are shown."
                  )}
                </p>
              </div>
            </div>
            <div className="grid g2">
              {[
                { label: "WhatsApp numbers", labelTa: "வாட்ஸ்அப் எண்கள்", used: usage.numbers, limit: limits?.num ?? null, Icon: MessageCircle, k: "wa" },
                { label: "Staff logins", labelTa: "ஊழியர் கணக்குகள்", used: usage.staff, limit: limits?.staff ?? null, Icon: Users, k: "staff" },
                { label: "Campaigns this month", labelTa: "மாதப் பிரச்சாரங்கள்", used: usage.campaigns, limit: limits?.camp ?? null, Icon: Megaphone, k: "camp" },
                { label: "Active templates", labelTa: "செயலில் உள்ள டெம்ப்ளேட்கள்", used: usage.templates, limit: limits?.tmpl ?? null, Icon: FileText, k: "tmpl" },
              ].map((m, idx) => {
                const pct = m.limit ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0;
                const tone = pct >= 100 ? "hot" : pct >= 80 ? "mid" : "";
                return (
                  <div key={idx} className={`meter ${tone}`}>
                    <span className={`mic ${m.k}`} aria-hidden>
                      <m.Icon className="size-5" />
                    </span>
                    <div className="mbody">
                    <div className="top2">
                      <span>
                        <T ta={m.labelTa}>{m.label}</T>
                      </span>
                      <span>{m.limit ? `${m.used} of ${m.limit}` : `${m.used} in use`}</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                    {m.limit ? <div className="mpct small muted">{pct}%</div> : null}
                    {pct >= 100 ? (
                      <div className="small" style={{ color: "var(--bad)", marginTop: 4 }}>
                        <T ta="முழுதும் முடிந்தது. கூடுதல் சேர்க்கவும் அல்லது பெரிய திட்டத்திற்கு மாறவும்.">Full. Add more or move to a bigger plan.</T>
                      </div>
                    ) : pct >= 80 ? (
                      <div className="small muted" style={{ marginTop: 4 }}>
                        <T ta="கிட்டத்தட்ட முடிவடைகிறது">Almost full</T>
                      </div>
                    ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add-ons and Long-term savings */}
          <div className="grid g2" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="hd">
                <div>
                  <h2>
                    <T ta="கூடுதல் வசதிகள்">Add-ons</T>
                  </h2>
                  <p>
                    <T ta="கூடுதல் தேவைப்படுகிறதா? திட்டத்தை மாற்றாமல் கேட்கவும்.">
                      Need a little more? Ask for it without changing your plan. It is added once paid and confirmed.
                    </T>
                  </p>
                </div>
              </div>
              <div className="list">
                <div className="row">
                  <div className="grow">
                    <div className="t">
                      <T ta="கூடுதல் ஊழியர் கணக்கு">Extra staff login</T>
                    </div>
                    <div className="muted small">
                      ₹{ADDONS.staff.price} {ADDONS.staff.per}
                    </div>
                  </div>
                  <button type="button" className="btn sm" onClick={() => requestAddon("one extra staff login", `₹${ADDONS.staff.price} a month`)}>
                    <T ta="கேட்கவும்">Ask for one</T>
                  </button>
                </div>

                <div className="row">
                  <div className="grow">
                    <div className="t">
                      <T ta="கூடுதல் வாட்ஸ்அப் எண்">Extra WhatsApp number</T>
                    </div>
                    <div className="muted small">
                      ₹{ADDONS.number.price} {ADDONS.number.per}
                    </div>
                  </div>
                  <button type="button" className="btn sm" onClick={() => requestAddon("one extra WhatsApp number", `₹${ADDONS.number.price} a month`)}>
                    <T ta="கேட்கவும்">Ask for one</T>
                  </button>
                </div>

                <div className="row">
                  <div className="grow">
                    <div className="t">
                      <T ta="மெட்டா சரிபார்ப்பு, டெம்ப்ளேட்கள் & பட்டியல் பதிவேற்றம்">Done-for-you setup (Meta verification & catalogue)</T>
                    </div>
                    <div className="muted small">₹{ADDONS.metaSetupMonthly.price} one-time on monthly. Free on 3 or 12 months.</div>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => requestAddon("done-for-you setup", `₹${ADDONS.metaSetupMonthly.price} once on monthly, free on 3 or 12 months`)}
                  >
                    <T ta="கோரிக்கை விடு">Request</T>
                  </button>
                </div>
              </div>
            </div>

            {/* Save with a longer plan */}
            {curPlan && active && (
              <div className="card">
                <div className="hd">
                  <div>
                    <h2>
                      <T ta="நீண்ட கால திட்டத்தில் சேமிப்பு">Save with a longer plan</T>
                    </h2>
                    <p>
                      <T ta="3 அல்லது 12 மாதங்களை ஒன்றாக செலுத்தி பணத்தை மிச்சப்படுத்துங்கள்.">
                        Pay for 3 or 12 months together and pay less. It starts when your current period ends.
                      </T>
                    </p>
                  </div>
                </div>
                <div className="list">
                  {[
                    {
                      cycle: "q" as BillingCycle,
                      title: "3 months together · save 10%",
                      titleTa: "3 மாதங்கள் ஒன்றாக · 10% சேமிப்பு",
                      price: curPlan.p.q,
                      savings: curPlan.p.m * 3 - curPlan.p.q,
                    },
                    {
                      cycle: "y" as BillingCycle,
                      title: "12 months together · save 20%",
                      titleTa: "12 மாதங்கள் ஒன்றாக · 20% சேமிப்பு",
                      price: curPlan.p.y,
                      savings: curPlan.p.m * 12 - curPlan.p.y,
                    },
                  ].map((item) => {
                    const isCurrent = currentCycle === item.cycle;
                    return (
                      <div key={item.cycle} className="row">
                        <div className="grow">
                          <div className="t">
                            <T ta={item.titleTa}>{item.title}</T>: {inr(item.price)}
                          </div>
                          <div className="muted small">
                            {isCurrent ? (
                              <T ta="நீங்கள் இந்த திட்டத்தில் உள்ளீர்கள்.">You are on this billing.</T>
                            ) : (
                              <T ta={`மாதந்தோறும் செலுத்துவதை விட ${inr(item.savings)} சேமிக்கிறீர்கள்.`}>You save {inr(item.savings)} compared with paying monthly.</T>
                            )}
                          </div>
                        </div>
                        {isCurrent ? (
                          <Pill tone="ok">Current</Pill>
                        ) : (
                          <button type="button" className="btn sm" disabled={!canStartPurchase} onClick={() => openBuy(curPlan.k, item.cycle)}>
                            <T ta="மாற்று">Switch</T>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CHANGE PLAN (plans)                                                */}
      {/* ========================================================================= */}
      {activeTab === "plans" && (
        <section>
          <div className="tools" style={{ justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="t" style={{ fontWeight: 600 }}>
                <T ta="செலுத்தும் காலத்தைத் தேர்வுசெய்க">Pick how you want to pay</T>
              </div>
              <div className="muted small">
                <T ta="அனைத்து விலைகளிலும் ஜிஎஸ்டி சேர்க்கப்பட்டுள்ளது. மெட்டா கட்டணங்கள் தனி.">
                  All prices are final. WhatsApp message charges are separate, at Meta&apos;s own rate.
                </T>
              </div>
            </div>
            <div className="seg">
              <button
                type="button"
                aria-pressed={viewCycle === "m"}
                onClick={() => setViewCycle("m")}
              >
                <T ta="மாதந்தோறும்">Monthly</T>
              </button>
              <button
                type="button"
                aria-pressed={viewCycle === "q"}
                onClick={() => setViewCycle("q")}
              >
                <T ta="3 மாதங்கள் · 10% சேமிப்பு">3 months · save 10%</T>
              </button>
              <button
                type="button"
                aria-pressed={viewCycle === "y"}
                onClick={() => setViewCycle("y")}
              >
                <T ta="12 மாதங்கள் · 20% சேமிப்பு">12 months · save 20%</T>
              </button>
            </div>
          </div>

          {/* What paying for a plan does, before any button */}
          <div className={`duebar ${billing.block ? "warn" : "info"}`} style={{ marginTop: 4 }}>
            <div className="grow">
              {billing.block ? (
                <>
                  <b>One payment at a time.</b> {billing.block.message}
                </>
              ) : !billing.canPay ? (
                <>Only the business owner or a manager can pay for the plan.</>
              ) : billing.nextStartLabel ? (
                <>
                  <b>Choosing a plan here does not change your plan today.</b> You pay first; once Thabaal verifies the payment, the plan you chose
                  starts {billing.nextStartLabel}, when your paid period ends, and runs its full length. Until then {curPlan ? curPlan.n : "your current plan"} stays as it is.
                </>
              ) : (
                <>
                  <b>Choosing a plan here does not change anything by itself.</b> You pay first; the plan starts when Thabaal verifies the payment and runs
                  its full length from then.
                </>
              )}
            </div>
          </div>

          {/* 3 Plan Cards */}
          <div className="plans" style={{ marginTop: 14 }}>
            {PLANS.map((plan, i) => {
              const isCur = plan.k === currentPlanKey && currentCycle === viewCycle;
              const curIndex = PLANS.findIndex((p) => p.k === currentPlanKey);
              const price = plan.p[viewCycle];
              const savings =
                viewCycle === "m" ? 0 : plan.p.m * (viewCycle === "q" ? 3 : 12) - price;
              const approxMonthly =
                viewCycle === "m" ? 0 : Math.round(price / (viewCycle === "q" ? 3 : 12));

              return (
                <div
                  key={plan.k}
                  className={`plan ${plan.k === currentPlanKey ? "cur" : ""} ${
                    plan.pop && plan.k !== currentPlanKey ? "pop" : ""
                  }`}
                >
                  {plan.k === currentPlanKey ? (
                    <span className="pill ok tag">
                      <T ta="உங்கள் திட்டம்">Your plan</T>
                    </span>
                  ) : plan.pop ? (
                    <span className="pill warn tag">
                      <T ta="மிகவும் பிரபலம்">Most popular</T>
                    </span>
                  ) : null}

                  <div>
                    <h2>
                      <T ta={plan.nTa}>{plan.n}</T>
                    </h2>
                    <p className="muted small">
                      <T ta={plan.tagTa}>{plan.tag}</T>
                    </p>
                  </div>

                  <div>
                    <div className="pr">
                      {inr(price)}{" "}
                      <small>
                        <T ta={CYCLE_SUFFIX[viewCycle].ta}>{CYCLE_SUFFIX[viewCycle].en}</T>
                      </small>
                    </div>
                    {approxMonthly > 0 ? (
                      <div className="muted small">About {inr(approxMonthly)} a month</div>
                    ) : (
                      <div className="muted small">No extra charges</div>
                    )}
                    <div className="save">
                      {savings > 0 ? `Saves ${inr(savings)} vs monthly` : ""}
                    </div>
                  </div>

                  <ul>
                    {plan.f.map((feature, fIdx) => (
                      <li key={fIdx}>
                        <T ta={plan.fTa[fIdx]}>{feature}</T>
                      </li>
                    ))}
                  </ul>
                  {billing.scheduled && billing.scheduled.plan === plan.k && billing.scheduled.cycle === viewCycle && (
                    <div className="muted small">Paid · starts {billing.scheduled.startsLabel}</div>
                  )}
                  <button
                    type="button"
                    className={`btn ${isCur || !currentPlanKey || i > curIndex ? "primary" : ""}`}
                    disabled={!canStartPurchase}
                    onClick={() => openBuy(plan.k, viewCycle)}
                  >
                    <T
                      ta={
                        isCur
                          ? "அடுத்த காலத்திற்கு செலுத்து"
                          : !currentPlanKey
                            ? `தேர்வு செய் (${plan.nTa})`
                            : plan.k === currentPlanKey
                              ? "பில்லிங் மாற்று"
                              : i > curIndex
                                ? `மேம்படுத்து (${plan.nTa})`
                                : `மாற்று (${plan.nTa})`
                      }
                    >
                      {isCur
                        ? "Pay for next period"
                        : !currentPlanKey
                          ? `Choose ${plan.n}`
                          : plan.k === currentPlanKey
                            ? "Switch billing"
                            : i > curIndex
                              ? `Upgrade to ${plan.n}`
                              : `Move to ${plan.n}`}
                    </T>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Comparison Table */}
          <div className="card" style={{ marginTop: 16, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "18px 20px 6px" }}>
              <h2>
                <T ta="திட்டங்களின் ஒப்பீடு">Compare plans side by side</T>
              </h2>
              <p className="muted small">
                <T ta="அனைத்து திட்டங்களிலும் வரம்பற்ற வாடிக்கையாளர்கள், வாட்ஸ்அப் அமைப்பு மற்றும் ஆதரவு அடங்கும்.">
                  Every plan includes unlimited customers, official WhatsApp setup, onboarding, a shared inbox, and product and order tools.
                </T>
              </p>
            </div>
            <div className="tw">
              <table className="cmp">
                <thead>
                  <tr>
                    <th>
                      <T ta="அம்சம்">Feature</T>
                    </th>
                    {PLANS.map((p) => (
                      <th
                        key={p.k}
                        className={`c ${p.k === currentPlanKey ? "cur" : ""}`}
                      >
                        <T ta={p.nTa}>{p.n}</T>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_COMPARISON_ROWS.map((row, rIdx) => (
                    <tr key={rIdx}>
                      <td>
                        <T ta={row.fTa}>{row.f}</T>
                      </td>
                      <td className={`c ${currentPlanKey === "starter" ? "cur" : ""}`}>
                        {row.s}
                      </td>
                      <td className={`c ${currentPlanKey === "growth" ? "cur" : ""}`}>
                        {row.g}
                      </td>
                      <td className={`c ${currentPlanKey === "business" ? "cur" : ""}`}>
                        {row.b}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PAYMENTS AND INVOICES (pay)                                        */}
      {/* ========================================================================= */}
      {activeTab === "pay" && (
        <section>
          <div className="grid g2">
            <div className="card">
              <div className="hd">
                <div>
                  <h2>
                    <T ta="தபாஅல் கட்டணம் செலுத்துதல்">Pay for thabaal</T>
                  </h2>
                  <p>
                    <T ta="UPI மூலம் செலுத்துங்கள். அடுத்த வேலை நாளுக்குள் உறுதி செய்யப்படும்.">
                      Pay by UPI. We confirm it by the next working day. A payment counts only after it is verified.
                    </T>
                  </p>
                </div>
              </div>
              <div className="stat" style={{ marginBottom: 12 }}>
                <div className="l">
                  <T ta="செலுத்தப்பட்ட காலம்">Paid through</T>
                </div>
                <div className="v">{billing.scheduled ? billing.scheduled.endsLabel : active ? active.endsLabel : "No active plan"}</div>
                <div className="d muted">
                  {billing.scheduled && scheduledPlan
                    ? `${curPlan ? `${curPlan.n} to ${active?.endsLabel}, then ` : ""}${scheduledPlan.n} from ${billing.scheduled.startsLabel}`
                    : active
                      ? active.leftLabel
                      : billing.lastEnded
                        ? `Last plan ended ${billing.lastEnded.endsLabel}`
                        : "Nothing paid on record yet"}
                </div>
              </div>
              <div className="tools">
                <button type="button" className="btn primary" disabled={!canStartPurchase} onClick={payNext}>
                  <T ta="கட்டணம் செலுத்து">{active ? "Pay for next period" : "Choose a plan"}</T>
                </button>
              </div>
              {billing.block && (
                <p className="muted small" style={{ marginTop: 10 }}>
                  {billing.block.message}
                </p>
              )}
              <div className="list" style={{ marginTop: 16 }}>
                <div className="row">
                  <div className="grow">
                    <div className="t">
                      <T ta="செலுத்தும் முறை">How you pay</T>
                    </div>
                    <div className="muted small">
                      <T ta="CupNSaucerLLP-க்கு UPI மூலம்: QR குறியீட்டை ஸ்கேன் செய்து, UTR எண்ணை எங்களுக்குத் தெரிவிக்கவும்.">
                        By UPI to CupNSaucerLLP: pick the plan, scan the code, which already carries the amount, then send us the reference number.
                      </T>
                    </div>
                  </div>
                </div>
                <div className="row">
                  <div className="grow">
                    <div className="t">
                      <T ta="முன்கூட்டியே செலுத்துதல்">Paying early</T>
                    </div>
                    <div className="muted small">
                      An early payment never shortens your current plan. Once verified, it is booked to start the moment your paid period ends, and runs
                      the full 1, 3 or 12 months from then.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="hd">
                <div>
                  <h2>
                    <T ta="வாட்ஸ்அப் செய்தி கட்டணங்கள்">WhatsApp message charges</T>
                  </h2>
                  <p>
                    <T ta="இது உங்கள் தபாஅல் திட்டத்திற்கு அப்பாற்பட்டது.">This is separate from your thabaal plan.</T>
                  </p>
                </div>
              </div>
              <p className="muted small" style={{ marginBottom: 12 }}>
                <T ta="நீங்கள் அனுப்பும் செய்திகளுக்கு மெட்டா நேரடியாகக் கட்டணம் விதிக்கிறது. தபாஅல் கூடுதல் கட்டணம் எதையும் சேர்ப்பதில்லை.">
                  Meta charges for the messages you send. thabaal adds nothing on top of Meta&apos;s rate. See what you spent, and what it brought back.
                </T>
              </p>
              <div className="tools">
                <Link className="btn sm" href="/dashboard/report">
                  <T ta="அறிக்கைகளில் செலவைப் பார்க்கவும்">See costs in Reports</T>
                </Link>
                <a className="btn sm ok" href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer">
                  <T ta="மெட்டாவில் ரீசார்ஜ் செய்யவும்">Recharge on Meta</T>
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Plan payments: every row is a stored payment, newest first */}
          <div className="card" style={{ marginTop: 16, padding: 0 }}>
            <div style={{ padding: "18px 20px 6px" }}>
              <h2>
                <T ta="கட்டணங்கள் & பில்கள்">Plan payments and bills</T>
              </h2>
              <p className="muted small">
                <T ta="நீங்கள் அனுப்பிய ஒவ்வொரு கட்டணமும் அதன் நிலையும்.">
                  Every plan payment you sent and where it stands. A bill is issued once a payment is verified.
                </T>
              </p>
            </div>
            {billing.history.length === 0 ? (
              <p className="muted small" style={{ padding: "6px 20px 18px" }}>
                No plan payments yet.
              </p>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <T ta="அனுப்பிய தேதி">Sent</T>
                      </th>
                      <th>
                        <T ta="திட்டம்">Plan</T>
                      </th>
                      <th>
                        <T ta="காலம்">Period</T>
                      </th>
                      <th className="num">
                        <T ta="தொகை">Amount</T>
                      </th>
                      <th>
                        <T ta="நிலை">Status</T>
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {billing.history.map((h) => (
                      <tr key={h.id}>
                        <td>
                          {h.submittedLabel}
                          {h.utr && <div className="muted small">Ref {h.utr}</div>}
                        </td>
                        <td>
                          {planOf(h.plan)?.n ?? h.plan}
                          <div className="muted small">{CYCLE_NAMES[h.cycle].en}</div>
                        </td>
                        <td>
                          {h.startsLabel && h.endsLabel ? (
                            <>
                              {h.startsLabel}
                              <div className="muted small">to {h.endsLabel}</div>
                            </>
                          ) : (
                            <span className="muted small">Set when verified</span>
                          )}
                        </td>
                        <td className="num">{inr(h.amount)}</td>
                        <td>
                          <Pill tone={PHASE[h.phase].tone}>{PHASE[h.phase].label}</Pill>
                          {h.phase === "rejected" && h.note && <div className="muted small">{h.note}</div>}
                        </td>
                        <td className="num">
                          {h.billNo ? (
                            <button type="button" className="btn sm" onClick={() => setBillRow(h)}>
                              <T ta="பார்க்க / பதிவிறக்க">View bill</T>
                            </button>
                          ) : h.phase === "awaiting_verification" && billing.canPay ? (
                            <button type="button" className="btn sm" disabled={busy} onClick={() => handleWithdraw(h.id)}>
                              Withdraw
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BUSINESS AND HELP (acct)                                            */}
      {/* ========================================================================= */}
      {activeTab === "acct" && (
        <section>
          <div className="grid g2">
            <div className="stack">
              <div className="card">
                <div className="hd">
                  <div>
                    <h2>
                      <T ta="உங்கள் பில்லிங் விவரங்கள்">Your billing details</T>
                    </h2>
                    <p>
                      <T ta="நாங்கள் அனுப்பும் ஒவ்வொரு பில்லிலும் இவை அச்சிடப்படும். ஒரு முறை நிரப்பவும்.">
                        These print on every bill we send you. Fill them once.
                      </T>
                    </p>
                  </div>
                </div>
                <form onSubmit={handleSaveBiz} className="stack" style={{ gap: 14 }}>
                  <div className="formgrid">
                    <div className="field">
                      <label>
                        <T ta="கடை அல்லது வணிகப் பெயர் *">Shop or business name *</T>
                      </label>
                      <input
                        value={biz.shopName}
                        onChange={(e) => setBiz({ ...biz, shopName: e.target.value })}
                        placeholder="Thenan Oils / Murugan Oil Stores"
                        required
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="சட்டப்பூர்வ பெயர் (வித்தியாசமாக இருந்தால்)">Legal name, if different</T>
                      </label>
                      <input
                        value={biz.legalName ?? ""}
                        onChange={(e) => setBiz({ ...biz, legalName: e.target.value })}
                        placeholder="As in PAN or GST"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="தொடர்பு கொள்ள வேண்டியவர்">Contact person</T>
                      </label>
                      <input
                        value={biz.contactPerson ?? ""}
                        onChange={(e) => setBiz({ ...biz, contactPerson: e.target.value })}
                        placeholder="Name of owner or manager"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="மொபைல் எண் *">Mobile number *</T>
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={biz.mobile}
                        onChange={(e) => setBiz({ ...biz, mobile: e.target.value })}
                        placeholder="98765 43210"
                        required
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="பில்களுக்கான மின்னஞ்சல்">Email for bills</T>
                      </label>
                      <input
                        type="email"
                        value={biz.email ?? ""}
                        onChange={(e) => setBiz({ ...biz, email: e.target.value })}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="வணிக வகை">Type of business</T>
                      </label>
                      <select
                        value={biz.businessType ?? "Proprietor (single owner)"}
                        onChange={(e) => setBiz({ ...biz, businessType: e.target.value })}
                      >
                        <option>Proprietor (single owner)</option>
                        <option>Partnership</option>
                        <option>LLP</option>
                        <option>Private limited</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label>
                      <T ta="கடை முகவரி">Shop address</T>
                    </label>
                    <input
                      value={biz.address ?? ""}
                      onChange={(e) => setBiz({ ...biz, address: e.target.value })}
                      placeholder="Door number and street"
                    />
                  </div>

                  <div className="formgrid">
                    <div className="field">
                      <label>
                        <T ta="பகுதி அல்லது அடையாளம்">Area or landmark</T>
                      </label>
                      <input
                        value={biz.area ?? ""}
                        onChange={(e) => setBiz({ ...biz, area: e.target.value })}
                        placeholder="Anna Nagar / Simmakkal"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="நகரம்">Town or city</T>
                      </label>
                      <input
                        value={biz.city ?? ""}
                        onChange={(e) => setBiz({ ...biz, city: e.target.value })}
                        placeholder="Madurai"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="அஞ்சல் குறியீடு (PIN code)">PIN code</T>
                      </label>
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        value={biz.pinCode ?? ""}
                        onChange={(e) => setBiz({ ...biz, pinCode: e.target.value })}
                        placeholder="625001"
                      />
                    </div>
                    <div className="field">
                      <label>
                        <T ta="மாநிலம்">State</T>
                      </label>
                      <select
                        value={biz.state ?? "Tamil Nadu"}
                        onChange={(e) => setBiz({ ...biz, state: e.target.value })}
                      >
                        {INDIAN_STATES.map(([st]) => (
                          <option key={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>
                        <T ta="ஜிஎஸ்டி எண் (இருந்தால்)">GST number</T>
                      </label>
                      <input
                        value={biz.gstin ?? ""}
                        onChange={(e) => setBiz({ ...biz, gstin: e.target.value })}
                        placeholder="33AAAAA0000A1Z5"
                      />
                      <div className="muted small">
                        <T ta="இல்லை என்றால் காலியாக விடவும். பெரும்பாலான சிறு கடைகளுக்குத் தேவையில்லை.">
                          Leave empty if you do not have one. Most small shops do not.
                        </T>
                      </div>
                    </div>
                    <div className="field">
                      <label>
                        <T ta="பான் (PAN எண்)">PAN</T>
                      </label>
                      <input
                        value={biz.pan ?? ""}
                        onChange={(e) => setBiz({ ...biz, pan: e.target.value })}
                        placeholder="AAAAA0000A"
                      />
                      <div className="muted small">
                        <T ta="உங்கள் கணக்காளர் கேட்டால் மட்டுமே.">Only if your accountant asks for it.</T>
                      </div>
                    </div>
                  </div>

                  <div className="tools">
                    <button type="submit" className="btn primary" disabled={savingBiz}>
                      <T ta="பில்லிங் விவரங்களைச் சேமி">Save billing details</T>
                    </button>
                    {bizMsg && <span className="muted small">{bizMsg}</span>}
                  </div>
                </form>
              </div>
            </div>

            <div className="stack">
              {/* Need help card */}
              <div className="card">
                <div className="hd">
                  <div>
                    <h2>
                      <T ta="உதவி தேவையா?">Need help?</T>
                    </h2>
                    <p>
                      <T ta="தபாஅலில் இருந்து ஒருவர் நேரடியாகப் பதிலளிப்பார்.">
                        A real person from thabaal will answer.
                      </T>
                    </p>
                  </div>
                </div>
                <div className="list">
                  <div className="row">
                    <div className="grow">
                      <div className="t">
                        <T ta="வாட்ஸ்அப்பில் செய்தி அனுப்புங்கள்">Message us on WhatsApp</T>
                      </div>
                      <div className="muted small">
                        6379140626 · <T ta="வேலை நேரங்களில் பதிலளிக்கிறோம்">we reply during shop hours</T>
                      </div>
                    </div>
                    <a
                      className="btn sm ok"
                      href="https://wa.me/916379140626?text=Hi%20thabaal%2C%20I%20need%20help%20with%20my%20account"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="size-4" />
                      <T ta="வாட்ஸ்அப்">WhatsApp</T>
                    </a>
                  </div>

                  <div className="row">
                    <div className="grow">
                      <div className="t">
                        <T ta="மின்னஞ்சல் அனுப்புங்கள்">Email us</T>
                      </div>
                      <div className="muted small">thabaal26@gmail.com</div>
                    </div>
                    <a className="btn sm" href="mailto:thabaal26@gmail.com">
                      <Inbox className="size-4" />
                      <T ta="மின்னஞ்சல்">Email</T>
                    </a>
                  </div>

                  <div className="row">
                    <div className="grow">
                      <div className="t">
                        <T ta="பிரத்யேக பணிகளைக் கேட்கவும்">Ask for custom work</T>
                      </div>
                      <div className="muted small">
                        <T ta="உங்கள் கடைக்குத் தேவையான புதிய வசதிகள். பேசி திட்டமிட்டு விலையைக் கூறுகிறோம்.">
                          Something your shop needs that the plan does not do. We look at it and send you a written price.
                        </T>
                      </div>
                    </div>
                    <button type="button" className="btn sm" onClick={() => setCwModalOpen(true)}>
                      <T ta="கேட்கவும்">Ask</T>
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom work requests list */}
              {cwList.length > 0 && (
                <div className="card">
                  <div className="hd">
                    <div>
                      <h2>
                        <T ta="உங்கள் பிரத்யேக கோரிக்கைகள்">Your custom work requests</T>
                      </h2>
                      <p>
                        <T ta="நீங்கள் கேட்டதும், அதன் தற்போதைய நிலையும்.">
                          What you asked for, and where it stands.
                        </T>
                      </p>
                    </div>
                  </div>
                  <div className="list">
                    {cwList.map((item, idx) => (
                      <div key={idx} className="row">
                        <div className="grow">
                          <div className="t">{item.t}</div>
                          <div className="muted small">
                            {item.d.length > 90 ? item.d.slice(0, 90) + "…" : item.d}
                          </div>
                          <div className="muted small">
                            Asked on {item.on} · {item.u}
                          </div>
                        </div>
                        <Pill tone="warn">{item.st}</Pill>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stop or pause card */}
              <div className="card">
                <div className="hd">
                  <div>
                    <h2>
                      <T ta="நிறுத்த அல்லது இடைநிறுத்தம் செய்ய">Stop or pause</T>
                    </h2>
                    <p>
                      <T ta="நீங்கள் மீண்டும் வரும்போது உங்கள் தரவுகள் பத்திரமாக இருக்கும்.">
                        Your data stays safe if you come back.
                      </T>
                    </p>
                  </div>
                </div>
                <p className="muted small" style={{ marginBottom: 12 }}>
                  <T ta="திட்டம் பெரிதாகத் தோன்றினால், நீங்கள் முதலில் சிறிய திட்டத்திற்கு மாறலாம்.">
                    If the plan feels too big, you can move to a smaller one first.
                  </T>
                </p>
                <div className="tools">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setActiveTab("plans")}
                  >
                    <T ta="சிறிய திட்டங்களைப் பார்க்கவும்">See smaller plans</T>
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => setCancelModalOpen(true)}
                  >
                    <T ta="நிறுத்த அல்லது இடைநிறுத்தம்">Stop or pause</T>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 1: BUY A PLAN PERIOD — confirm, pay by UPI, send the reference      */}
      {/* Nothing is saved until step 3, and even then the plan doesn't change until */}
      {/* Thabaal verifies the payment.                                              */}
      {/* ========================================================================= */}
      {buy && buyPlan && (
        <div className="lockwrap" role="dialog" aria-modal="true" aria-label="Pay for a plan" style={{ background: "rgba(16,40,59,.65)" }}>
          <div className="card-3d lockbox" style={{ maxWidth: 560, textAlign: "left", padding: 24 }}>
            {buyStep === 1 && (
              <div>
                <div className="hd" style={{ marginBottom: 12 }}>
                  <h2 style={{ fontSize: 20 }}>
                    {!currentPlanKey
                      ? `Choose ${buyPlan.n}`
                      : buyPlan.k === currentPlanKey
                        ? buy.cycle === currentCycle
                          ? `Pay for your next ${buyPlan.n} period`
                          : `Change how you pay for ${buyPlan.n}`
                        : PLANS.findIndex((p) => p.k === buyPlan.k) > PLANS.findIndex((p) => p.k === currentPlanKey)
                          ? `Upgrade to ${buyPlan.n}`
                          : `Move to ${buyPlan.n}`}
                  </h2>
                  <button type="button" className="btn sm ghost" aria-label="Close" onClick={closeBuy}>
                    <X className="size-4" />
                  </button>
                </div>

                <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginBottom: 16 }}>
                  <div className="row">
                    <div className="grow muted">Now</div>
                    <b>{active && curPlan ? `${curPlan.n} · paid through ${active.endsLabel}` : "No active plan"}</b>
                  </div>
                  {active && (
                    <div className="row">
                      <div className="grow muted">Time left</div>
                      <b>{active.leftLabel}</b>
                    </div>
                  )}
                  <div className="row">
                    <div className="grow muted">You are buying</div>
                    <b>
                      {buyPlan.n} · {CYCLE_LENGTH[buy.cycle]}
                    </b>
                  </div>
                  <div className="row">
                    <div className="grow muted">Price</div>
                    <b>
                      {inr(buyPrice)} {CYCLE_SUFFIX[buy.cycle].en}
                    </b>
                  </div>
                  <div className="row">
                    <div className="grow muted">Starts</div>
                    <b>{timing(buy.cycle).starts}</b>
                  </div>
                  <div className="row">
                    <div className="grow muted">Ends</div>
                    <b>{timing(buy.cycle).ends}</b>
                  </div>
                </div>

                <p className="small muted" style={{ marginBottom: 10 }}>
                  {timing(buy.cycle).fixed
                    ? `Your ${curPlan?.n ?? "current"} plan and everything in it stay exactly as they are until ${billing.nextStartLabel}. Once Thabaal verifies this payment, ${buyPlan.n} is booked to start at that moment and runs the full ${CYCLE_LENGTH[buy.cycle]}. Paying early never shortens your current period.`
                    : `Once Thabaal verifies this payment, ${buyPlan.n} starts and runs the full ${CYCLE_LENGTH[buy.cycle]} from that moment.`}{" "}
                  Sending a payment reference does not count as paid until it is verified.
                </p>

                {/* Capacity check against the plan being bought */}
                {(() => {
                  const warnings: string[] = [];
                  if (usage.staff > buyPlan.lim.staff)
                    warnings.push(`You have ${usage.staff} staff logins and ${buyPlan.n} allows ${buyPlan.lim.staff}. Remove ${usage.staff - buyPlan.lim.staff} before it starts.`);
                  if (usage.numbers > buyPlan.lim.num)
                    warnings.push(`You use ${usage.numbers} WhatsApp numbers and ${buyPlan.n} allows ${buyPlan.lim.num}. Remove ${usage.numbers - buyPlan.lim.num} before it starts.`);
                  return warnings.length ? (
                    <p className="small" style={{ color: "var(--bad)", marginBottom: 14 }}>
                      {warnings.join(" ")}
                    </p>
                  ) : null;
                })()}

                <div className="acts" style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={closeBuy}>
                    Not now
                  </button>
                  <button type="button" className="btn primary" onClick={() => setBuyStep(2)}>
                    Continue to payment
                  </button>
                </div>
              </div>
            )}

            {buyStep === 2 && (
              <div>
                <div className="hd" style={{ marginBottom: 10 }}>
                  <h2 style={{ fontSize: 20 }}>
                    <T ta="தபாஅல் கட்டணம் செலுத்துதல்">Pay for thabaal</T>
                  </h2>
                  <button type="button" className="btn sm ghost" aria-label="Close" onClick={closeBuy}>
                    <X className="size-4" />
                  </button>
                </div>
                <div className="stat" style={{ marginBottom: 14 }}>
                  <div className="l">
                    {buyPlan.n} plan · {CYCLE_NAMES[buy.cycle].en}
                  </div>
                  <div className="v">{inr(buyPrice)}</div>
                  <div className="d muted">No extra charges · GST included</div>
                </div>

                <div className="card" style={{ background: "var(--soft)", boxShadow: "none", textAlign: "center", padding: 18 }}>
                  {qrDataUrl && (
                    <>
                      <div className="muted small" style={{ marginBottom: 10 }}>
                        Scan with GPay, PhonePe, Paytm or any UPI app
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URL */}
                      <img
                        src={qrDataUrl}
                        alt={`UPI QR code for ${inr(buyPrice)}`}
                        style={{ width: 168, height: 168, borderRadius: 12, background: "#fff", padding: 6, margin: "0 auto", display: "block" }}
                      />
                      <div className="muted small" style={{ marginTop: 8 }}>
                        The amount is already in the code. Nothing to type.
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: 14 }}>
                    <div className="muted small">Or pay {inr(buyPrice)} directly to this UPI ID</div>
                    <div className="tools" style={{ justifyContent: "center", marginTop: 6 }}>
                      <b style={{ fontSize: 17 }}>{SUPPLIER_INFO.vpa}</b>
                      <button type="button" className="btn sm" onClick={() => handleCopy(SUPPLIER_INFO.vpa, "UPI ID")}>
                        <Copy className="size-3.5" />
                        Copy
                      </button>
                    </div>
                  </div>
                  <a className="btn primary" href={upiDeepLink} style={{ marginTop: 16, display: "inline-flex", width: "100%", justifyContent: "center" }}>
                    Open my UPI app
                  </a>
                </div>

                <div className="acts" style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={() => setBuyStep(1)}>
                    Back
                  </button>
                  <button type="button" className="btn primary" onClick={() => setBuyStep(3)}>
                    I have paid
                  </button>
                </div>
              </div>
            )}

            {buyStep === 3 && (
              <form onSubmit={handlePaymentSubmit}>
                <div className="hd" style={{ marginBottom: 10 }}>
                  <h2 style={{ fontSize: 20 }}>
                    <T ta="கட்டண விவரங்களைத் தெரிவிக்கவும்">Tell us about the payment</T>
                  </h2>
                  <button type="button" className="btn sm ghost" aria-label="Close" onClick={closeBuy}>
                    <X className="size-4" />
                  </button>
                </div>
                <p className="muted small" style={{ marginBottom: 14 }}>
                  For {buyPlan.n} · {CYCLE_LENGTH[buy.cycle]} · {inr(buyPrice)}. Your UPI app shows a reference or UTR number after a successful payment. It is
                  usually 12 digits.
                </p>

                <div className="stack" style={{ gap: 14 }}>
                  <div className="field">
                    <label htmlFor="ac-utr">UPI reference number (UTR) *</label>
                    <input
                      id="ac-utr"
                      autoComplete="off"
                      maxLength={22}
                      placeholder="123456789012"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="ac-paydate">Date you paid</label>
                    <input id="ac-paydate" value={payDate} onChange={(e) => setPayDate(e.target.value)} maxLength={40} />
                  </div>
                  <div className="field">
                    <label htmlFor="ac-payapp">Which app did you use?</label>
                    <select id="ac-payapp" value={payApp} onChange={(e) => setPayApp(e.target.value)}>
                      <option>GPay</option>
                      <option>PhonePe</option>
                      <option>Paytm</option>
                      <option>Bank app</option>
                      <option>Other UPI app</option>
                    </select>
                  </div>
                </div>

                <p className="small muted" style={{ marginTop: 14 }}>
                  We check our bank entry and verify it within one working day. Until then it shows as &ldquo;awaiting verification&rdquo; and nothing
                  about your plan changes.
                </p>

                <div className="acts" style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="btn" onClick={() => setBuyStep(2)}>
                    Back
                  </button>
                  <button type="submit" className="btn primary" disabled={busy}>
                    {busy ? "Sending..." : "Send for checking"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 2: BILL VIEWER — only for verified payments                         */}
      {/* ========================================================================= */}
      {billRow && billRow.billNo && (
        <div className="lockwrap" role="dialog" aria-modal="true" aria-label="Bill" style={{ background: "rgba(16,40,59,.65)" }}>
          <div className="card-3d lockbox" style={{ maxWidth: 740, textAlign: "left", padding: 24 }}>
            <div className="hd" style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 20 }}>{SUPPLIER_INFO.gstin ? "Tax Invoice" : "Bill of Supply"}</h2>
              <div className="tools">
                <button type="button" className="btn sm primary" onClick={() => setTimeout(() => window.print(), 100)}>
                  <Printer className="size-3.5" />
                  Print or save as PDF
                </button>
                <button type="button" className="btn sm ghost" aria-label="Close" onClick={() => setBillRow(null)}>
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div style={{ border: "1.5px solid var(--line)", borderRadius: 12, padding: 18, background: "#fff", overflow: "auto", maxHeight: "70vh" }}>
              <div className="inv">
                <div className="ih">
                  <div>
                    <div className="ttl">{SUPPLIER_INFO.gstin ? "Tax Invoice" : "Bill of Supply"}</div>
                    <div style={{ marginTop: 4, fontWeight: 700, fontSize: 15 }}>{SUPPLIER_INFO.name}</div>
                    <div style={{ color: "#5A6B7B" }}>
                      {SUPPLIER_INFO.legal} · {SUPPLIER_INFO.addr}
                    </div>
                    <div style={{ color: "#5A6B7B" }}>
                      State: {SUPPLIER_INFO.state} ({SUPPLIER_INFO.code})
                    </div>
                    <div style={{ color: "#5A6B7B" }}>
                      {SUPPLIER_INFO.phone} · {SUPPLIER_INFO.email}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="lab">Bill no.</div>
                    <div style={{ fontWeight: 700 }}>{billRow.billNo}</div>
                    <div className="lab" style={{ marginTop: 8 }}>
                      Date
                    </div>
                    <div style={{ fontWeight: 700 }}>{billRow.billDateLabel}</div>
                  </div>
                </div>

                <div className="two2">
                  <div>
                    <div className="lab">Billed to</div>
                    <div style={{ fontWeight: 700 }}>{biz.shopName || "Your business name"}</div>
                    {biz.legalName && <div style={{ color: "#5A6B7B" }}>{biz.legalName}</div>}
                    {biz.address && <div style={{ color: "#5A6B7B" }}>{biz.address}</div>}
                    <div style={{ color: "#5A6B7B" }}>
                      {biz.state || "Tamil Nadu"} ({INDIAN_STATES.find(([s]) => s === (biz.state || "Tamil Nadu"))?.[1] || "33"})
                    </div>
                    {biz.contactPerson && <div style={{ color: "#5A6B7B" }}>Contact: {biz.contactPerson}</div>}
                    {biz.mobile && <div style={{ color: "#5A6B7B" }}>{biz.mobile}</div>}
                    {biz.gstin && <div>GSTIN: {biz.gstin}</div>}
                    {biz.pan && <div style={{ color: "#5A6B7B" }}>PAN: {biz.pan}</div>}
                  </div>
                  <div>
                    <div className="lab">Supply to</div>
                    <div>
                      {biz.state || "Tamil Nadu"} ({INDIAN_STATES.find(([s]) => s === (biz.state || "Tamil Nadu"))?.[1] || "33"})
                    </div>
                    <div className="lab" style={{ marginTop: 8 }}>
                      Plan period
                    </div>
                    <div>
                      {billRow.startsLabel} to {billRow.endsLabel}
                    </div>
                    <div className="lab" style={{ marginTop: 8 }}>
                      Payment
                    </div>
                    <div>{billRow.method === "UPI" ? `UPI · reference ${billRow.utr}` : "Recorded by thabaal"}</div>
                  </div>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="r">Period</th>
                      <th className="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <b>thabaal {planOf(billRow.plan)?.n ?? billRow.plan} plan</b>
                        <br />
                        <span style={{ color: "#5A6B7B" }}>WhatsApp business dashboard subscription</span>
                      </td>
                      <td className="r">{CYCLE_LENGTH[billRow.cycle]}</td>
                      <td className="r">{inrDec(billRow.amount)}</td>
                    </tr>
                    <tr className="tot">
                      <td colSpan={2}>Total</td>
                      <td className="r">{inrDec(billRow.amount)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="words">
                  <b>Amount in words:</b> Rupees {numberToWordsINR(billRow.amount)} only
                </div>
                {!SUPPLIER_INFO.gstin && (
                  <div className="words" style={{ marginTop: 4, color: "#5A6B7B" }}>
                    <b>GST is not charged on this bill.</b> {SUPPLIER_INFO.legal} is not registered under GST, so no tax is collected and no input tax
                    credit is available on this amount.
                  </div>
                )}
                <div className="words" style={{ marginTop: 4, color: "#5A6B7B" }}>
                  This bill covers the thabaal subscription only. WhatsApp message charges are billed by Meta directly at their own rates.
                </div>

                <div className="sign">
                  <div style={{ textAlign: "left", alignSelf: "flex-end", color: "#5A6B7B" }}>This is a computer-generated bill.</div>
                  <div>
                    <div style={{ height: "15mm" }} />
                    <div className="ln" />
                    <div style={{ marginTop: 4 }}>For {SUPPLIER_INFO.legal}</div>
                    <div style={{ color: "#5A6B7B" }}>{SUPPLIER_INFO.sigrole}</div>
                  </div>
                </div>

                <div className="note">Subject to {SUPPLIER_INFO.state} jurisdiction. Please quote the bill number for any query.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 4: CUSTOM WORK REQUEST (ac-cw2)                                    */}
      {/* ========================================================================= */}
      {cwModalOpen && (
        <div className="lockwrap" role="dialog" aria-modal="true" style={{ background: "rgba(16,40,59,.65)" }}>
          <div className="card-3d lockbox" style={{ maxWidth: 580, textAlign: "left", padding: 24 }}>
            <div className="hd" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 20 }}>
                <T ta="பிரத்யேக பணிகளைக் கேட்கவும்">Ask for custom work</T>
              </h2>
              <button type="button" className="btn sm ghost" onClick={() => setCwModalOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Tell us what you need. We look at how your shop works and send you a written price and a date before any work starts. There is no charge for asking.
            </p>

            <form onSubmit={handleCustomWorkSubmit} className="stack" style={{ gap: 14 }}>
              <div className="field">
                <label>What do you need?</label>
                <select value={cwCategory} onChange={(e) => setCwCategory(e.target.value)}>
                  <option>More capacity (campaigns, templates, numbers)</option>
                  <option>Setup special to my business (custom fields, approvals, follow-ups)</option>
                  <option>Connect thabaal to a tool I already use</option>
                  <option>A report or export I need</option>
                  <option>Something else</option>
                </select>
              </div>

              <div className="field">
                <label>Explain it in your own words *</label>
                <textarea
                  rows={4}
                  placeholder="Example: my customers order by the tin, and I need the tin size on every order slip."
                  value={cwDescription}
                  onChange={(e) => setCwDescription(e.target.value)}
                  required
                />
              </div>

              <div className="formgrid">
                <div className="field">
                  <label>How soon do you need it?</label>
                  <select value={cwUrgency} onChange={(e) => setCwUrgency(e.target.value)}>
                    <option>No hurry</option>
                    <option>Within a month</option>
                    <option>This month, it is urgent</option>
                  </select>
                </div>
                <div className="field">
                  <label>Best number to call</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={cwPhone}
                    onChange={(e) => setCwPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="acts" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setCwModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary">
                  Send the request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 5: STOP OR PAUSE — there is no automatic charge to cancel            */}
      {/* ========================================================================= */}
      {cancelModalOpen && (
        <div className="lockwrap" role="dialog" aria-modal="true" aria-label="Stop or pause" style={{ background: "rgba(16,40,59,.65)" }}>
          <div className="card-3d lockbox" style={{ maxWidth: 500, textAlign: "left", padding: 24 }}>
            <div className="hd" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 20 }}>
                <T ta="நிறுத்த அல்லது இடைநிறுத்தம் செய்ய">Stop or pause</T>
              </h2>
              <button type="button" className="btn sm ghost" aria-label="Close" onClick={() => setCancelModalOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <p className="muted small" style={{ marginBottom: 14 }}>
              thabaal never takes money automatically, so there is nothing to cancel.{" "}
              {active ? `Your plan stays as it is until ${active.endsLabel} and ends then unless you pay for another period.` : "No plan is running now."}{" "}
              {billing.scheduled ? `A period you already paid for starts ${billing.scheduled.startsLabel}; ask us if you want it refunded.` : ""} Your
              customers, orders and products are kept.
            </p>

            <div className="field" style={{ marginBottom: 18 }}>
              <label htmlFor="ac-stop-reason">Tell us why (helps us improve)</label>
              <select id="ac-stop-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
                <option>Too costly for now</option>
                <option>Not using it enough</option>
                <option>Missing a feature I need</option>
                <option>Closing or pausing my business</option>
                <option>Other</option>
              </select>
            </div>

            <div className="acts" style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="btn" onClick={() => setCancelModalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  const res = await sendRequest("Stop or pause my plan", `Reason: ${cancelReason}. Please don't remind me to renew.`, "No hurry");
                  notify(res.ok ? "Noted. We will not remind you to renew." : (res.message ?? "Could not send the request."), res.ok);
                  if (res.ok) setCancelModalOpen(false);
                }}
              >
                Tell thabaal I am stopping
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PortalPage>
  );
}
