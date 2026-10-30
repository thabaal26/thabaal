"use server";

import { revalidatePath } from "next/cache";
import { getScope, requireUser } from "@/lib/session";
import {
  cancelAutoRenew,
  confirmOrderCheckout,
  confirmSubscriptionCheckout,
  startOrder,
  startPlanSubscription,
  startTestSubscription,
  type CheckoutStart,
  type Result,
} from "@/lib/razorpay-billing";

/** Who is paying. View-only ("help a client") sessions have no manager rights, so they can't pay. */
async function who() {
  const [scope, user] = await Promise.all([getScope(), requireUser()]);
  return { clientId: scope.clientId, name: user.name || user.email, canManage: scope.manager && !scope.viewOnly, isAdmin: user.role === "ADMIN" };
}

function refresh<T extends { ok: boolean }>(r: T): T {
  if (r.ok) {
    revalidatePath("/dashboard/account");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
  }
  return r;
}

export async function rzpStartPlan(plan: string, cycle: string): Promise<CheckoutStart> {
  return startPlanSubscription(await who(), plan, cycle);
}

export async function rzpStartRecharge(amount: number): Promise<CheckoutStart> {
  return startOrder(await who(), "wallet", amount);
}

export async function rzpConfirm(input: { kind: "subscription" | "order"; id: string; paymentId: string; signature: string }): Promise<Result> {
  const w = await who();
  const clean = (s: string) => String(s ?? "").trim().slice(0, 100);
  const r =
    input.kind === "subscription"
      ? await confirmSubscriptionCheckout(w, { subscriptionId: clean(input.id), paymentId: clean(input.paymentId), signature: clean(input.signature) })
      : await confirmOrderCheckout(w, { orderId: clean(input.id), paymentId: clean(input.paymentId), signature: clean(input.signature) });
  return refresh(r);
}

export async function rzpCancelAutoRenew(): Promise<Result> {
  return refresh(await cancelAutoRenew(await who(), "plan"));
}

/* Thabaal admin: ₹1 live tests that grant nothing. */
export async function rzpTestOrder(): Promise<CheckoutStart> {
  return startOrder(await who(), "test", 1);
}
export async function rzpTestSubscription(): Promise<CheckoutStart> {
  return startTestSubscription(await who());
}
export async function rzpCancelTest(): Promise<Result> {
  return refresh(await cancelAutoRenew(await who(), "test"));
}
