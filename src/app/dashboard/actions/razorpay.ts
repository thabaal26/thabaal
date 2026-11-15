"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getScope, requireUser } from "@/lib/session";
import {
  cancelAutoRenew,
  confirmOrderCheckout,
  confirmSubscriptionCheckout,
  startOrder,
  startPlanOrder,
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
    revalidatePath("/dashboard/billing");
    revalidatePath("/dashboard/wallet");
    revalidatePath("/dashboard", "layout");
    revalidatePath("/admin", "layout");
  }
  return r;
}

/**
 * The only way a business pays for a plan: a Razorpay subscription (auto-pay) that renews every period until the
 * owner cancels it. Yearly Growth and Business are above the ₹15,000 UPI AutoPay limit, so the owner's bank may ask
 * them to approve each yearly renewal.
 */
export async function rzpStartPlan(plan: string, cycle: string): Promise<CheckoutStart> {
  return startPlanSubscription(await who(), plan, cycle);
}

/**
 * Starts a one-time order for a plan (UPI / GPay / PhonePe / QR / Cards / NetBanking).
 * Works 100% reliably even when the customer's bank does not support recurring UPI AutoPay mandates.
 */
export async function rzpStartPlanOrder(plan: string, cycle: string): Promise<CheckoutStart> {
  return startPlanOrder(await who(), plan, cycle);
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

/** Cancel the plan subscription: no more charges; the period already paid for runs to its end. */
export async function rzpCancelAutoRenew(reasonOrOptions?: string | { reason?: string; immediate?: boolean }): Promise<Result> {
  const why =
    typeof reasonOrOptions === "string"
      ? reasonOrOptions.replace(/\s+/g, " ").trim().slice(0, 80)
      : typeof reasonOrOptions?.reason === "string"
      ? reasonOrOptions.reason.replace(/\s+/g, " ").trim().slice(0, 80)
      : "";
  const immediate = typeof reasonOrOptions === "object" && reasonOrOptions !== null ? !!reasonOrOptions.immediate : false;
  return refresh(await cancelAutoRenew(await who(), "plan", why, { immediate }));
}

/* Thabaal admin: ₹1 live tests that grant nothing. */
export async function rzpTestOrder(): Promise<CheckoutStart> {
  return startOrder(await who(), "test", 1);
}
export async function rzpTestSubscription(): Promise<CheckoutStart> {
  return startTestSubscription(await who());
}
export async function rzpTestWallet(): Promise<CheckoutStart> {
  return startOrder(await who(), "wallet", 1);
}

/** Thabaal admin: offer (or stop offering) the ₹1 test package to one business. */
export async function rzpSetTestPackage(clientId: string, on: boolean): Promise<Result> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, message: "Only Thabaal can change this." };
  const c = await db.client.findUnique({ where: { id: clientId }, select: { appearance: true } });
  if (!c) return { ok: false, message: "Business not found." };
  const a = c.appearance && typeof c.appearance === "object" && !Array.isArray(c.appearance) ? (c.appearance as Record<string, unknown>) : {};
  await db.client.update({ where: { id: clientId }, data: { appearance: { ...a, razorpayTest: on } as Prisma.InputJsonValue } });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/dashboard/account");
  return { ok: true, message: on ? "₹1 test package is on for this business." : "₹1 test package is off for this business." };
}

export async function rzpCancelTest(): Promise<Result> {
  return refresh(await cancelAutoRenew(await who(), "test"));
}
