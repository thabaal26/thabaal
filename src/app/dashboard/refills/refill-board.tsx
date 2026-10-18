"use client";

import { BellRing, Check, MessageCircle, ShoppingCart } from "@/components/icons";
import { T } from "../portal-ui";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { safeAction, toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { Calendar3D } from "@/components/icons-3d";
import { ColumnChart, type ChartColor } from "@/components/viz";
import { formatValue } from "@/lib/chart-math";
import { cn } from "@/lib/cn";
import { fmtDate, fmtNumber } from "@/lib/format";
import type { RefillDue } from "@/lib/refill-forecast";
import { sendRefillNudge } from "../actions/refills";

const OVERDUE: ChartColor = "red";
const TODAY: ChartColor = "gold";
const SOON: ChartColor = "emerald";
const LATER: ChartColor = "neutral";

type Bucket = { key: string; label: string; sub: string; test: (d: number) => boolean; color: ChartColor };

/** One column per day for the next two weeks, with overdue and later at the ends. */
function buckets(today: Date): Bucket[] {
  const days: Bucket[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86_400_000);
    return {
      key: `d${i}`,
      label: i === 0 ? "Today" : fmtDate(d, "EEE"),
      sub: fmtDate(d, "d MMM"),
      test: (n: number) => n === i,
      color: i === 0 ? TODAY : SOON,
    };
  });
  return [
    { key: "over", label: "Overdue", sub: "past due", test: (n) => n < 0, color: OVERDUE },
    ...days,
    { key: "later", label: "Later", sub: "14+ days", test: (n) => n >= 14, color: LATER },
  ];
}

const dueText = (d: number) => (d < 0 ? `${Math.abs(d)} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : `Due in ${d} days`);

export function RefillBoard({ rows, today, canSend, templateName }: { rows: RefillDue[]; today: Date; canSend: boolean; templateName: string | null }) {
  const cols = useMemo(() => buckets(today), [today]);
  const [pick, setPick] = useState<string | null>(null);
  const tally = cols.map((c) => {
    const inCol = rows.filter((r) => c.test(r.daysLeft));
    return { ...c, n: inCol.length, value: inCol.reduce((s, r) => s + r.avgOrder, 0) };
  });
  const active = cols.find((c) => c.key === pick);
  const list = active ? rows.filter((r) => active.test(r.daysLeft)) : rows.filter((r) => r.daysLeft < 14);
  const router = useRouter();
  const [bulk, startBulk] = useTransition();
  // Overdue and not yet reminded since their last order.
  const overdue = rows.filter((r) => r.daysLeft < 0 && !(r.reminderSentAt && r.reminderSentAt > r.lastOrderAt));
  const remindAll = () =>
    startBulk(async () => {
      if (!(await confirmAction({ title: `Remind ${overdue.length} overdue customer${overdue.length === 1 ? "" : "s"}?`, message: `Each gets the refill reminder${templateName ? ` (${templateName})` : ""} on WhatsApp. Anyone messaged too recently is skipped.`, confirmLabel: "Remind all" }))) return;
      let sent = 0;
      let problem = "";
      for (const r of overdue) {
        const res = await safeAction(() => sendRefillNudge(r.customerId));
        if (res.ok) sent++;
        else problem ||= res.message;
      }
      toastResult(
        sent === overdue.length
          ? { ok: true, message: `Reminder sent to ${sent} customer${sent === 1 ? "" : "s"}.` }
          : { ok: sent > 0, message: `Reminder sent to ${sent} of ${overdue.length}.${problem ? ` ${problem}` : ""}` },
      );
      router.refresh();
    });

  return (
    <>
      <Card className="card-3d">
        <CardHeader tone="brand" icon={<Calendar3D />} title="Who runs out when" description="Customers due for a reorder per day · tap a day to see them" />
        <div className="p-4 sm:p-5">
          <ColumnChart
            label="Customers due for a reorder per day"
            minWidth={640}
            height={150}
            legend={[
              { label: "Overdue", color: OVERDUE },
              { label: "Today", color: TODAY },
              { label: "Next 2 weeks", color: SOON },
              { label: "Later", color: LATER },
            ]}
            activeKey={pick}
            onColumnClick={(k) => setPick((p) => (p === k ? null : k))}
            columns={tally.map((t) => ({
              key: t.key,
              label: t.label,
              sub: t.sub,
              highlight: t.key === "d0",
              tip: t.n ? `About ${formatValue(t.value, "inr")} in reorders` : undefined,
              parts: [{ key: "n", label: "Customers", value: t.n, color: t.color }],
            }))}
          />
        </div>
      </Card>

      <Card className="card-3d mt-4 sm:mt-5">
        <CardHeader
          tone="gold"
          icon={<BellRing className="size-5" />}
          title={active ? `${active.label} · ${active.sub}` : "Due in the next two weeks"}
          description={active ? `${fmtNumber(list.length)} customer${list.length === 1 ? "" : "s"}` : "Most urgent first · overdue at the top"}
          action={
            active ? (
              <button type="button" onClick={() => setPick(null)} className="inline-flex min-h-10 items-center text-xs font-semibold text-brand-deep hover:underline sm:min-h-0">
                <T>Show all</T>
              </button>
            ) : canSend && overdue.length > 0 ? (
              <Button size="sm" loading={bulk} disabled={!templateName} title={templateName ? undefined : "Choose a reorder template on the Campaigns page first"} onClick={remindAll}>
                <T ta="தாமதமான அனைவருக்கும் நினைவூட்டு">Remind all overdue</T>
              </Button>
            ) : undefined
          }
        />
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <RefillRow key={r.customerId} r={r} canSend={canSend} templateName={templateName} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Calendar3D />} title="Nobody due here">
            Pick another day, or check back after more orders come in.
          </EmptyState>
        )}
      </Card>
    </>
  );
}

function RefillRow({ r, canSend, templateName }: { r: RefillDue; canSend: boolean; templateName: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const tone = r.daysLeft < 0 ? "text-danger" : r.daysLeft === 0 ? "text-warning" : "text-ink-2";

  const send = () =>
    start(async () => {
      let res = await safeAction(() => sendRefillNudge(r.customerId));
      if (!res.ok && res.soft && (await confirmAction(res.message))) res = await sendRefillNudge(r.customerId, true);
      if (res.ok || !res.soft) toastResult(res);
      if (res.ok) {
        setSent(true);
        router.refresh();
      }
    });

  const reminded = sent || (r.reminderSentAt && r.reminderSentAt > r.lastOrderAt);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={`/dashboard/customers/${r.customerId}`} className="font-medium text-ink hover:underline">
            {r.name}
          </Link>
          <span className={cn("text-xs font-semibold", tone)}>{dueText(r.daysLeft)}</span>
          {r.openCart && (
            <Badge tone="amber">
              <ShoppingCart aria-hidden className="mr-1 inline size-3" />
              {r.openCart.ref} unpaid · {formatValue(r.openCart.total, "inr")}
            </Badge>
          )}
          {reminded && <Badge tone="green">Reminded</Badge>}
        </div>
        <p className="mt-0.5 truncate text-sm text-ink-2">{r.items.length ? r.items.join(" · ") : "Items not recorded"}</p>
        <p className="tabular mt-0.5 text-2xs text-muted">
          Every ~{r.cycleDays} days{r.cycleSource === "own" ? ` (their pattern, ${r.orders} orders)` : " (default)"} · last {r.lastOrderRef} on {fmtDate(r.lastOrderAt, "d MMM")} ·
          usually {formatValue(Math.round(r.avgOrder), "inr")}
          {r.area ? ` · ${r.area}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {r.windowOpen && (
          <Link href={`/dashboard/customers/${r.customerId}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line px-3 text-xs font-semibold text-ink-2 hover:bg-subtle">
            <MessageCircle aria-hidden className="size-3.5" /> Reply free
          </Link>
        )}
        {r.openCart && (
          <Link href="/dashboard/orders?show=unpaid" className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-warning-border bg-warning-bg px-3 text-xs font-semibold text-warning hover:brightness-95">
            <ShoppingCart aria-hidden className="size-3.5" /> Follow up cart
          </Link>
        )}
        {canSend && (
          <Button
            size="sm"
            variant={reminded || r.openCart ? "secondary" : "primary"}
            loading={pending}
            disabled={!templateName}
            title={templateName ? `Sends “${templateName}”` : "Choose a reorder template on the Campaigns page first"}
            onClick={send}
          >
            {reminded ? <Check aria-hidden className="size-3.5" /> : <BellRing aria-hidden className="size-3.5" />}
            {reminded ? "Send again" : "Remind"}
          </Button>
        )}
      </div>
    </li>
  );
}
