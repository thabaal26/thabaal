import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { AlertCircle, Calendar, Clock, Repeat } from "@/components/icons";
import { StaggerGroup, StaggerItem } from "@/components/motion";
import { PickClientNotice, Stat } from "@/components/ui";
import { refillForecast } from "@/lib/refill-forecast";
import { getScope } from "@/lib/session";
import { CustomersTabs, CUSTOMERS_SUB, CUSTOMERS_SUB_TA } from "../customers/customers-tabs";
import { inr } from "../portal-format";
import { PortalPage } from "../portal-ui";
import { RefillBoard } from "./refill-board";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Refills" };
export const dynamic = "force-dynamic";

/** Customers › Refills: when each buyer is likely to run out, from how often they reorder. */
export default async function RefillsPage() {
  const locked = await planGate("orders");
  if (locked) return locked;
  const scope = await getScope();
  if (!scope.clientId)
    return (
      <PortalPage title="Customers" titleTa="வாடிக்கையாளர்" sub={CUSTOMERS_SUB} subTa={CUSTOMERS_SUB_TA}>
        <CustomersTabs active="refills" />
        <PickClientNotice what="reorder calendar" />
      </PortalPage>
    );

  const now = new Date();
  const f = await refillForecast(scope.clientId, now);
  const overdue = f.due.filter((d) => d.daysLeft < 0);
  const week = f.due.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7);
  const own = f.due.filter((d) => d.cycleSource === "own");
  const typical = own.length ? Math.round(own.reduce((n, d) => n + d.cycleDays, 0) / own.length) : f.defaultCycle;

  return (
    <PortalPage title="Customers" titleTa="வாடிக்கையாளர்" sub={CUSTOMERS_SUB} subTa={CUSTOMERS_SUB_TA}>
      <CustomersTabs active="refills" />

      {!f.refillAutoOn && scope.canManage && (
        <div className="note" style={{ marginBottom: 14 }}>
          <b>Automatic refill reminders are off.</b> Pick a reminder template and the number of days in{" "}
          <Link className="linkb" href="/dashboard/campaigns?show=auto">
            Campaigns › Automatic messages
          </Link>
          . Until then you can remind customers one by one here{f.refillTemplateName ? "" : " once a template is chosen"}.
        </div>
      )}

      <StaggerGroup className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <StaggerItem index={0} className="h-full">
          <Stat
            label="Due this week"
            value={week.length}
            sub={`about ${inr(week.reduce((n, d) => n + d.avgOrder, 0))} in reorders`}
            icon={<Calendar className="size-4 shrink-0" />}
            tone="info"
          />
        </StaggerItem>
        <StaggerItem index={1} className="h-full">
          <Stat
            label="Overdue"
            value={overdue.length}
            sub={`about ${inr(overdue.reduce((n, d) => n + d.avgOrder, 0))} not yet reordered`}
            icon={<Clock className="size-4 shrink-0" />}
            tone={overdue.length ? "rose" : "brand"}
          />
        </StaggerItem>
        <StaggerItem index={2} className="h-full">
          <Stat
            label="Typical reorder"
            value={`${typical} days`}
            sub={own.length ? `from ${own.length} repeat buyer${own.length === 1 ? "" : "s"}` : "default setting"}
            icon={<Repeat className="size-4 shrink-0" />}
            tone="brand"
          />
        </StaggerItem>
        <StaggerItem index={3} className="h-full">
          <Stat
            label="Lapsed"
            value={f.lapsedCount}
            sub={`no order in ${f.lapsedDays}+ days · win back`}
            icon={<AlertCircle className="size-4 shrink-0" />}
            tone="amber"
            href="/dashboard/customers?tab=groups"
          />
        </StaggerItem>
      </StaggerGroup>

      {f.due.length ? (
        <RefillBoard rows={f.due} today={now} canSend={scope.canManage} templateName={f.refillTemplateName} />
      ) : (
        <section className="card">
          <h2>No refills to forecast yet</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Once customers have paid orders, they show up here on the day they&apos;re likely to need more.
          </p>
        </section>
      )}
    </PortalPage>
  );
}
