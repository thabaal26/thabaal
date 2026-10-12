import { BellRing, CalendarClock, Repeat, TriangleAlert } from "@/components/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Callout, PageHeader, PickClientNotice, Stat, buttonClass } from "@/components/ui";
import { formatValue } from "@/lib/chart-math";
import { fmtNumber } from "@/lib/format";
import { refillForecast } from "@/lib/refill-forecast";
import { getScope } from "@/lib/session";
import { RefillBoard } from "./refill-board";

export const metadata: Metadata = { title: "Reorders" };
export const dynamic = "force-dynamic";

export default async function RefillsPage() {
  const scope = await getScope();
  const header = (
    <PageHeader
      title="Reorder calendar"
      description="When each buyer is likely to run out, from how often they reorder. Remind them a day or two before."
      actions={
        <Link href="/dashboard/customers?tag=lapsed" className={buttonClass("secondary")}>
          Lapsed buyers
        </Link>
      }
    />
  );
  if (!scope.clientId) {
    return (
      <>
        {header}
        <PickClientNotice what="reorder calendar" />
      </>
    );
  }

  const now = new Date();
  const f = await refillForecast(scope.clientId, now);
  const overdue = f.due.filter((d) => d.daysLeft < 0);
  const week = f.due.filter((d) => d.daysLeft >= 0 && d.daysLeft <= 7);
  const own = f.due.filter((d) => d.cycleSource === "own");
  const typical = own.length ? Math.round(own.reduce((n, d) => n + d.cycleDays, 0) / own.length) : f.defaultCycle;

  return (
    <>
      {header}

      {!f.refillAutoOn && scope.canManage && (
        <Callout tone="info" icon={<BellRing />} className="mb-5" title="Automatic reorder reminders are off">
          Pick a reminder template and the number of days in <Link href="/dashboard/campaigns">Campaigns → Reorder reminders</Link>. Until then you can remind
          customers one by one from this page{f.refillTemplateName ? "" : " once a template is chosen"}.
        </Callout>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 sm:gap-4 xl:grid-cols-4">
        <Stat label="Due this week" value={fmtNumber(week.length)} sub={`about ${formatValue(week.reduce((n, d) => n + d.avgOrder, 0), "inr")} in reorders`} icon={<CalendarClock />} tone="brand" />
        <Stat label="Overdue" value={fmtNumber(overdue.length)} sub={`about ${formatValue(overdue.reduce((n, d) => n + d.avgOrder, 0), "inr")} not yet reordered`} icon={<TriangleAlert />} tone="amber" />
        <Stat label="Typical reorder" value={`${typical} days`} sub={own.length ? `from ${fmtNumber(own.length)} repeat buyers` : `default setting`} icon={<Repeat />} tone="info" />
        <Stat
          label="Lapsed"
          value={fmtNumber(f.lapsedCount)}
          sub={`no order in ${f.lapsedDays}+ days · win-back`}
          icon={<BellRing />}
          tone="violet"
          href="/dashboard/customers?tag=lapsed"
        />
      </div>

      {f.due.length ? (
        <RefillBoard rows={f.due} today={now} canSend={scope.canManage} templateName={f.refillTemplateName} />
      ) : (
        <Callout tone="info" icon={<CalendarClock />} title="No reorders to forecast yet">
          Once customers have paid orders, they show up here on the day they&apos;re likely to need more.
        </Callout>
      )}
    </>
  );
}
