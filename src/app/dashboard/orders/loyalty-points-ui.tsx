"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trophy } from "@/components/icons";
import { Sparkles3D } from "@/components/icons-3d";
import { safeAction, toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { LOYALTY_RULE_LIMITS, type LoyaltyRules } from "@/lib/loyalty";
import { saveLoyaltyAutoRedeem, saveLoyaltyRedeemOn, saveLoyaltyRules, setOrderPointsAction } from "../actions/orders";

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
  /** The most the customer could take off this order now, in ₹ (0 = not enough points, or using points is off). */
  max: number;
  /** The customer's points not yet used. */
  balance: number;
  /** Unpaid, not cancelled, and this person may edit orders. */
  canChange: boolean;
  /** A payment request already went out, so it needs sending again after a change. */
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
    <div className="points-row" data-points={applied > 0 ? "used" : "available"} style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--ok-bg)" }}>
      <Trophy aria-hidden className="size-4 shrink-0" style={{ color: "var(--ok)" }} />
      <span style={{ flex: "1 1 220px", minWidth: 0, fontSize: 13.5 }}>
        {applied > 0 ? (
          <>
            Loyalty points used: <b>{applied * 2} pts</b> · <b style={{ color: "var(--ok)" }}>−{inr(applied)}</b>
          </>
        ) : (
          <>
            Can use up to <b>{inr(max)}</b> in loyalty points <span className="muted">({balance} pts)</span>
          </>
        )}
      </span>
      {canChange && (
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {applied > 0 ? (
            <button type="button" className="btn sm" disabled={pending} onClick={() => run(0)}>
              Remove points
            </button>
          ) : (
            <>
              {steps.length > 1 && (
                <select aria-label="Points discount" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: "auto", minHeight: 34, padding: "4px 34px 4px 10px", fontSize: 13.5 }}>
                  {steps.map((v) => (
                    <option key={v} value={v}>
                      {inr(v)} ({v * 2} pts)
                    </option>
                  ))}
                </select>
              )}
              {/* Not the yellow button: the order's next step stays the one main action on the card. */}
              <button type="button" className="btn sm" disabled={pending} onClick={() => run(amount)} style={{ fontWeight: 700 }}>
                {pending ? "Using…" : `Use ${inr(amount)}`}
              </button>
            </>
          )}
        </span>
      )}
      {canChange && paymentSent && (
        <span className="muted small" style={{ flexBasis: "100%" }}>
          The payment link already went: after a change, send it again so they pay the new total.
        </span>
      )}
    </div>
  );
}

/**
 * Payments › Settings › Loyalty points at checkout. First, whether customers can use their points at all (off: points
 * still add up, but nobody can use them and no message offers them). Then, when on, how: automatically on every new
 * order, or by hand with the Use button on each unpaid order.
 */
export function LoyaltyRedeemSetting({ on, redeemOn }: { on: boolean; redeemOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(on);
  const [canUse, setCanUse] = useState(redeemOn);

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
  const toggleUse = () => {
    const next = !canUse;
    setCanUse(next);
    start(async () => {
      const r = await safeAction(() => saveLoyaltyRedeemOn(next));
      toastResult(r);
      if (!r.ok) setCanUse(!next);
      router.refresh();
    });
  };

  return (
    <Card className="card-3d" id="points-at-checkout">
      <CardHeader
        tone="gold"
        icon={<Sparkles3D />}
        title="Loyalty points at checkout"
        description="Whether customers can use their points as a discount, and if so, automatically or only when you use them."
        action={
          <Badge tone={!canUse ? "gray" : value ? "green" : "blue"} className="shrink-0">
            {!canUse ? "Off" : value ? "Automatic" : "By hand"}
          </Badge>
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        <div className={cn("rounded-control border border-line p-3 transition", canUse ? "bg-panel" : "bg-canvas/60")}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p id="points-use-label" className="text-sm font-semibold text-ink">
                Customers can use their points
              </p>
              <p className="text-xs text-muted">
                {canUse
                  ? "Points come off orders as a discount (100 points = ₹50)."
                  : "Off: points still add up on every order by your rules above, but nobody can use them and no message offers them."}
              </p>
            </div>
            <button type="button" role="switch" aria-checked={canUse} aria-labelledby="points-use-label" className="sw shrink-0" disabled={pending} onClick={toggleUse} />
          </div>
        </div>
        {canUse && (
          <>
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
                <b className="text-ink">Automatic:</b> when a cart arrives or you add an order, the customer&apos;s points come off before the
                payment request goes out (up to ₹250, in ₹25 steps, never more than the items). The WhatsApp order and payment messages show
                the points used and the lower total.
              </li>
              <li>
                <b className="text-ink">By hand:</b> each unpaid order in Orders shows what the customer can use, with a <b className="text-ink">Use</b>{" "}
                button. If the payment link already went, send it again so they pay the new total.
              </li>
              <li>Either way you can remove points from an unpaid order, and a cancelled order gives its points back.</li>
            </ul>
          </>
        )}
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
