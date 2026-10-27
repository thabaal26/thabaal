import type { Metadata } from "next";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/format";
import { getScope, requireUser } from "@/lib/session";
import type { BillingCycle, BillingProfile, PlanKey } from "@/lib/account-plans";
import { accessState, CYCLES, DAY_MS, GRACE_DAYS, nextStart, periodEnd, phaseOf, purchaseBlock, summarize, timeLeft, timeLeftLabel } from "@/lib/subscription-core";
import { PortalPage } from "../portal-ui";
import { AccountView } from "./account-view";
import { adminQueue } from "@/lib/admin-queue";
import { AdminPlanPanel } from "./admin-plan-panel";
import type { AdminPendingRow, BillingView, HistoryRow, PeriodView } from "./billing-types";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

const label = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy, h:mm a");
const dayLabel = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy");
const rupees = (paise: number) => Math.round(paise) / 100;

function monthStart() {
  return fromZonedTime(`${formatInTimeZone(new Date(), APP_TZ, "yyyy-MM")}-01T00:00:00`, APP_TZ);
}

type Row = Awaited<ReturnType<typeof db.planPurchase.findMany>>[number];

const period = (r: Row & { startsAt: Date; endsAt: Date }): PeriodView => ({
  id: r.id,
  plan: r.plan as PlanKey,
  cycle: r.cycle as BillingCycle,
  amount: rupees(r.amountPaise),
  startsLabel: label(r.startsAt),
  endsLabel: label(r.endsAt),
});

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ pay?: string }> }) {
  const [user, scope] = await Promise.all([requireUser(), getScope()]);
  const now = new Date();
  const clientId = scope.clientId;

  // An admin who hasn't picked a business sees the plan payments waiting across all of them.
  if (!clientId) {
    return (
      <PortalPage title="My account" titleTa="என் கணக்கு" sub="Plan payments waiting to be checked." subTa="சரிபார்க்க காத்திருக்கும் திட்டக் கட்டணங்கள்.">
        {scope.isAdmin ? (
          <AdminPlanPanel rows={await adminQueue(now, null)} clientId={null} clientName={null} hasHistory={false} />
        ) : (
          <p className="muted">Your login isn&apos;t linked to a business.</p>
        )}
      </PortalPage>
    );
  }

  const [client, rows, numbers, staff, campaignsCount, templatesCount] = await Promise.all([
    db.client.findUnique({ where: { id: clientId }, select: { name: true, appearance: true, supportPhone: true, homeCity: true, planRequired: true } }),
    db.planPurchase.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    db.whatsAppNumber.count({ where: { clientId } }),
    db.user.count({ where: { clientId } }),
    db.campaign.count({ where: { clientId, createdAt: { gte: monthStart() } } }),
    db.template.count({ where: { clientId, status: "APPROVED" } }),
  ]);

  const s = summarize(rows, now);
  const access = accessState(rows, client?.planRequired ?? false, now);
  const renewFrom = s.active ?? s.lastEnded;
  const pay = (await searchParams).pay;
  const fixedStart = s.paidThrough && s.paidThrough > now ? nextStart(rows, now) : null;
  const billing: BillingView = {
    status: s.status,
    active: s.active ? { ...period(s.active), leftLabel: timeLeftLabel(s.active.endsAt, now), leftDays: timeLeft(s.active.endsAt, now).days } : null,
    scheduled: s.scheduled ? period(s.scheduled) : null,
    pending: s.pending
      ? {
          id: s.pending.id,
          plan: s.pending.plan as PlanKey,
          cycle: s.pending.cycle as BillingCycle,
          amount: rupees(s.pending.amountPaise),
          utr: s.pending.utr,
          payApp: s.pending.payApp,
          paidOn: s.pending.paidOn,
          submittedLabel: label(s.pending.createdAt),
        }
      : null,
    lastEnded: s.lastEnded ? period(s.lastEnded) : null,
    block: purchaseBlock(rows, now),
    nextStartLabel: fixedStart ? label(fixedStart) : null,
    nextEndLabels: fixedStart ? (Object.fromEntries(CYCLES.map((c) => [c, label(periodEnd(fixedStart, c, APP_TZ))])) as Record<BillingCycle, string>) : null,
    history: rows.map(
      (r): HistoryRow => ({
        id: r.id,
        plan: r.plan as PlanKey,
        cycle: r.cycle as BillingCycle,
        amount: rupees(r.amountPaise),
        phase: phaseOf(r, now),
        method: r.method,
        submittedLabel: dayLabel(r.createdAt),
        utr: r.utr,
        payApp: r.payApp,
        paidOn: r.paidOn,
        startsLabel: r.startsAt ? label(r.startsAt) : null,
        endsLabel: r.endsAt ? label(r.endsAt) : null,
        billNo: r.status === "VERIFIED" ? r.billNo : null,
        billDateLabel: r.decidedAt ? dayLabel(r.decidedAt) : null,
        note: r.note,
      }),
    ),
    canPay: scope.manager,
    todayLabel: dayLabel(now),
    access: {
      state: access.state,
      days: access.days,
      locksOnLabel: access.state === "overdue" && access.endsAt ? label(new Date(access.endsAt.getTime() + GRACE_DAYS * DAY_MS)) : null,
    },
    renew: renewFrom ? { plan: renewFrom.plan as PlanKey, cycle: renewFrom.cycle as BillingCycle } : null,
    isAdmin: scope.isAdmin,
    autoPay: pay === "now" || pay === "ref" ? pay : null,
  };

  const appearance =
    client?.appearance && typeof client.appearance === "object" && !Array.isArray(client.appearance) ? (client.appearance as Record<string, unknown>) : {};
  // Billing details the client saved; otherwise only what the business record already knows (no sample address).
  const billingProfile = (appearance.billingProfile as BillingProfile | undefined) ?? {
    shopName: client?.name ?? "",
    legalName: "",
    contactPerson: user.role === "CLIENT" ? (user.name ?? "") : "",
    mobile: client?.supportPhone ?? "",
    email: user.role === "CLIENT" ? user.email : "",
    businessType: "Proprietor (single owner)",
    address: "",
    area: "",
    city: client?.homeCity ?? "",
    pinCode: "",
    state: "Tamil Nadu",
    gstin: "",
    pan: "",
  };
  const customWorkRequests = Array.isArray(appearance.customWorkRequests) ? (appearance.customWorkRequests as never) : [];

  return (
    <AccountView
      billing={billing}
      usage={{ numbers, staff, campaigns: campaignsCount, templates: templatesCount }}
      billingProfile={billingProfile}
      customWorkRequests={customWorkRequests}
      adminPanel={
        scope.isAdmin ? (
          <AdminPlanPanel
            rows={await adminQueue(now, clientId)}
            clientId={clientId}
            clientName={client?.name ?? null}
            hasHistory={rows.some((r) => r.status === "VERIFIED")}
            planRequired={client?.planRequired ?? false}
            accessLabel={access.state}
          />
        ) : null
      }
    />
  );
}
