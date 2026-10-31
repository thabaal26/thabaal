"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trophy } from "@/components/icons";
import { Sparkles3D } from "@/components/icons-3d";
import { safeAction, toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LOYALTY_RULE_LIMITS, type LoyaltyRules } from "@/lib/loyalty";
import { saveLoyaltyAutoRedeem, saveLoyaltyRules, setOrderPointsAction } from "../actions/orders";

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
      toastResult(await safeAction(() => setOrderPointsAction(orderId, value)));
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
      const r = await safeAction(() => saveLoyaltyAutoRedeem(next));
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

const whole = (v: string, lim: { min: number; max: number }) => /^\d+$/.test(v.trim()) && Number(v) >= lim.min && Number(v) <= lim.max;

/** One earning rule: a switch, what it does, and its number. */
function RuleRow({
  id,
  title,
  hint,
  on,
  onToggle,
  disabled,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-control border border-line p-3 transition", on ? "bg-panel" : "bg-canvas/60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id={`${id}-label`} className="text-sm font-semibold text-ink">
            {title}
          </p>
          <p className="text-xs text-muted">{hint}</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-labelledby={`${id}-label`} className="sw shrink-0" disabled={disabled} onClick={onToggle} />
      </div>
      <div className={cn("mt-2.5 flex flex-wrap items-center gap-2 text-sm text-ink", !on && "opacity-50")}>{children}</div>
    </div>
  );
}

/**
 * Payments › Settings: how customers earn points. Two rules, each with an on/off switch and its own number:
 * 1 point for every ₹N of bought orders, and a bonus for every repeat order. Saved together.
 */
export function LoyaltyRulesSetting({ rules }: { rules: LoyaltyRules }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [earnOn, setEarnOn] = useState(rules.earnOn);
  const [rpp, setRpp] = useState(String(rules.rupeesPerPoint));
  const [repeatOn, setRepeatOn] = useState(rules.repeatOn);
  const [bonus, setBonus] = useState(String(rules.repeatBonus));

  const rppOk = whole(rpp, LOYALTY_RULE_LIMITS.rupeesPerPoint);
  const bonusOk = whole(bonus, LOYALTY_RULE_LIMITS.repeatBonus);
  const changed = earnOn !== rules.earnOn || repeatOn !== rules.repeatOn || Number(rpp) !== rules.rupeesPerPoint || Number(bonus) !== rules.repeatBonus;
  const canSave = changed && rppOk && bonusOk && !pending;

  const save = () =>
    start(async () => {
      const r = await safeAction(() => saveLoyaltyRules({ earnOn, rupeesPerPoint: Number(rpp), repeatOn, repeatBonus: Number(bonus) }));
      toastResult(r);
      if (r.ok) router.refresh();
    });
  const undo = () => {
    setEarnOn(rules.earnOn);
    setRpp(String(rules.rupeesPerPoint));
    setRepeatOn(rules.repeatOn);
    setBonus(String(rules.repeatBonus));
  };

  const input = "field h-9 min-h-9 w-24 py-0 text-sm tabular";
  return (
    <Card className="card-3d">
      <CardHeader
        tone="gold"
        icon={<Sparkles3D />}
        title="How customers earn points"
        description="Your shop's own rules. Turn each one on or off and set its number."
        action={
          <Badge tone={earnOn || repeatOn ? "green" : "gray"} className="shrink-0">
            {earnOn || repeatOn ? "Earning on" : "Earning off"}
          </Badge>
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        <RuleRow
          id="loyalty-earn"
          title="Points for spend"
          hint="Points on every confirmed or paid order, by the amount spent."
          on={earnOn}
          onToggle={() => setEarnOn((v) => !v)}
          disabled={pending}
        >
          <span>1 point for every ₹</span>
          <input
            type="number"
            inputMode="numeric"
            min={LOYALTY_RULE_LIMITS.rupeesPerPoint.min}
            max={LOYALTY_RULE_LIMITS.rupeesPerPoint.max}
            step={1}
            aria-label="Rupees spent for 1 point"
            aria-invalid={!rppOk}
            className={input}
            value={rpp}
            disabled={!earnOn || pending}
            onChange={(e) => setRpp(e.target.value)}
          />
          {earnOn && !rppOk && <span className="w-full text-xs text-danger">Enter a whole number from 1 to 1,00,000.</span>}
        </RuleRow>
        <RuleRow
          id="loyalty-repeat"
          title="Repeat-order bonus"
          hint="Extra points for every order after a customer's first."
          on={repeatOn}
          onToggle={() => setRepeatOn((v) => !v)}
          disabled={pending}
        >
          <span>+</span>
          <input
            type="number"
            inputMode="numeric"
            min={LOYALTY_RULE_LIMITS.repeatBonus.min}
            max={LOYALTY_RULE_LIMITS.repeatBonus.max}
            step={1}
            aria-label="Bonus points per repeat order"
            aria-invalid={!bonusOk}
            className={input}
            value={bonus}
            disabled={!repeatOn || pending}
            onChange={(e) => setBonus(e.target.value)}
          />
          <span>points for every repeat order</span>
          {repeatOn && !bonusOk && <span className="w-full text-xs text-danger">Enter a whole number from 1 to 10,000.</span>}
        </RuleRow>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
          <li>Balances are worked out from each customer&apos;s orders, so a change applies to every customer, past orders included.</li>
          <li>Points already used on orders stay used. Hand-given points, and what points are worth (100 points = ₹50 off), don&apos;t change.</li>
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" loading={pending} disabled={!canSave} onClick={save}>
            Save rules
          </Button>
          {changed && !pending && (
            <Button size="sm" variant="secondary" onClick={undo}>
              Undo changes
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
