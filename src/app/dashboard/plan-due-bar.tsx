"use client";

// The plan notice above every page except My account (which shows its own): due soon, overdue, or, for a Thabaal
// admin looking at a business, that its logins are locked. Built from the server's access state (layout.tsx).

import Link from "@/components/intent-link";
import { usePathname } from "next/navigation";
import { openWhenLocked } from "@/lib/plan-lock-paths";
import type { AccessState } from "@/lib/subscription-core";

export function PlanDueBar({ state, days, amount, isAdmin }: { state: AccessState; days: number; amount: string | null; isAdmin: boolean }) {
  const path = usePathname();
  if (path.startsWith("/dashboard/account")) return null;
  if (isAdmin) {
    if (state !== "locked" && state !== "new" && state !== "overdue") return null;
    return (
      <div className="duebar bad">
        <div className="grow">
          <b>{state === "overdue" ? "This business's plan payment is overdue." : "This business is locked for an unpaid plan."}</b>{" "}
          {state === "overdue" ? "It locks soon unless a payment is verified." : "Its logins see only Home, My account and Settings. You see everything."}
        </div>
        <Link className="btn sm" href="/dashboard/account">
          Plan payments
        </Link>
      </div>
    );
  }
  if (state === "locked" || state === "new") {
    // Closed sections show the full lock box instead (plan-lock.tsx).
    if (!openWhenLocked(path)) return null;
    return (
      <div className="duebar bad">
        <div className="grow">
          <b>{state === "new" ? "Pay to start using thabaal." : "thabaal is paused: this period's plan payment hasn't been received."}</b> Only Home,
          My account and Settings open until the payment is verified. Nothing is deleted.
        </div>
        <Link className="btn sm primary" href="/dashboard/account?pay=now">
          {amount ? `Pay ${amount}` : "Choose a plan"}
        </Link>
      </div>
    );
  }
  if (state !== "due" && state !== "overdue") return null;
  return (
    <div className={`duebar ${state === "overdue" ? "bad" : "warn"}`}>
      <div className="grow">
        {state === "overdue" ? (
          <>
            <b>Payment is overdue.</b> thabaal will pause until this period&apos;s payment is received.
          </>
        ) : (
          <>
            <b>
              Payment due in {days} day{days === 1 ? "" : "s"}.
            </b>{" "}
            Pay now so nothing stops.
          </>
        )}
      </div>
      <Link className="btn sm primary" href="/dashboard/account?pay=now">
        {amount ? `Pay ${amount}` : "Pay now"}
      </Link>
    </div>
  );
}
