"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trophy } from "@/components/icons";
import { Sparkles3D } from "@/components/icons-3d";
import { toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { saveLoyaltyAutoRedeem, setOrderPointsAction } from "../actions/orders";

const inr = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;

/**
 * Loyalty points on one order. Used: how many and the ₹ off, with Remove. Not used yet: what the customer can
 * use (₹25 steps up to the most allowed) and a Use button. Hidden when there is nothing to show or change.
 */
export function OrderPointsControl({
  orderId,
  applied,
  max,
  balance,
  canChange,
  paymentSent,
}: {
  orderId: string;
  /** ₹ already off this order. */
  applied: number;
  /** The most the customer could take off this order now, in ₹ (0 = not enough points). */
  max: number;
  /** The customer's points not yet used. */
  balance: number;
  /** Unpaid, not cancelled, and this person may edit orders. */
  canChange: boolean;
  /** A "Review and pay" request already went out, so it needs sending again after a change. */
  paymentSent: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const steps = Array.from({ length: Math.floor(max / 25) }, (_, k) => (k + 1) * 25);
  const [amount, setAmount] = useState(steps[steps.length - 1] ?? 0);

  if (applied <= 0 && (!canChange || max < 25)) return null;

  const run = (value: number) =>
    start(async () => {
      toastResult(await setOrderPointsAction(orderId, value));
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-success-border/60 bg-success-bg/40 px-2.5 py-1.5 text-xs">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-ink">
        <Trophy aria-hidden className="size-3.5 shrink-0 text-success" />
        {applied > 0 ? (
          <span>
            Loyalty points used: <b className="tabular">{applied * 2} pts</b> · <b className="tabular text-success">−{inr(applied)}</b>
          </span>
        ) : (
          <span>
            Can use up to <b className="tabular">{inr(max)}</b> in points <span className="text-muted">({balance} pts)</span>
          </span>
        )}
      </span>
      {canChange && (
        <span className="flex shrink-0 items-center gap-1.5">
          {applied > 0 ? (
            <Button variant="link" size="sm" className="h-auto px-1 text-xs" disabled={pending} onClick={() => run(0)}>
              Remove
            </Button>
          ) : (
            <>
              {steps.length > 1 && (
                <select
                  aria-label="Points discount"
                  className="field h-8 min-h-8 w-auto py-0 pl-2 pr-7 text-xs"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                >
                  {steps.map((s) => (
                    <option key={s} value={s}>
                      {inr(s)} ({s * 2} pts)
                    </option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="secondary" className="h-8 text-xs" loading={pending} onClick={() => run(amount)}>
                Use {inr(amount)}
              </Button>
            </>
          )}
        </span>
      )}
      {canChange && paymentSent && (
        <p className="w-full text-2xs text-muted">The payment request was already sent. After a change, send it again so they pay the new total.</p>
      )}
    </div>
  );
}

/** Order & Payment Settings: use loyalty points automatically on every new order, or only by hand. */
export function LoyaltyRedeemSetting({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);

  const choose = (next: boolean) => {
    if (next === value) return;
    setValue(next);
    start(async () => {
      const r = await saveLoyaltyAutoRedeem(next);
      toastResult(r);
      if (!r.ok) setValue(!next);
      router.refresh();
    });
  };

  return (
    <Card className="card-3d">
      <CardHeader
        tone="gold"
        icon={<Sparkles3D />}
        title="Loyalty points at checkout"
        description="Choose whether customers' points come off their orders automatically or only when you use them."
        action={
          <Badge tone={value ? "green" : "gray"} className="shrink-0">
            {value ? "Automatic" : "By hand"}
          </Badge>
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        <div role="radiogroup" aria-label="Loyalty points at checkout" className="inline-flex rounded-control border-[1.5px] border-line bg-panel p-[3px]">
          {[
            { id: true, label: "Automatic" },
            { id: false, label: "By hand" },
          ].map((o) => (
            <button
              key={String(o.id)}
              type="button"
              role="radio"
              aria-checked={value === o.id}
              disabled={pending}
              onClick={() => choose(o.id)}
              className={cn(
                "rounded-[9px] px-3.5 py-1.5 text-[13.5px] font-semibold transition disabled:opacity-60",
                value === o.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
          <li>
            <b className="text-ink">Automatic:</b> when a cart arrives or you add an order, the customer&apos;s points come off before the payment
            request goes out (up to ₹250, in ₹25 steps, never more than the items).
          </li>
          <li>
            <b className="text-ink">By hand:</b> each unpaid order shows what the customer can use, with a <b className="text-ink">Use</b> button.
          </li>
          <li>Either way you can remove points from an unpaid order, and a cancelled order gives its points back.</li>
        </ul>
      </div>
    </Card>
  );
}
