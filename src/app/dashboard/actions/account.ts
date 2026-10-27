"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, getScope, requireManager, requireUser, revokeSessions } from "@/lib/session";
import type { ActionResult } from "./templates";
import { CYCLE_NAMES, type BillingProfile } from "@/lib/account-plans";
import { isCycle, planDef } from "@/lib/subscription-core";
import { sendEmail } from "@/lib/email";
import {
  cancelPlanPayment,
  recordExistingPeriod,
  rejectPlanPayment,
  setPlanRequired,
  submitPlanPayment,
  verifyPlanPayment,
  type Actor,
  type SubResult,
} from "@/lib/subscription";

export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, message: "Current password is wrong." };
  if (next.length < 8) return { ok: false, message: "New password must be at least 8 characters." };
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  // Log out every other device, then give this one a fresh login so the person changing it stays in.
  await revokeSessions(me.id);
  await createSession(me.id);
  return { ok: true, message: "Password changed. Other devices signed in with this account are logged out." };
}

export async function saveBillingDetails(data: BillingProfile): Promise<ActionResult> {
  try {
    const scope = await requireManager(true, { evenIfLocked: true });
    if ("denied" in scope) return { ok: false, message: scope.denied };

    const client = await db.client.findUnique({ where: { id: scope.clientId } });
    if (!client) return { ok: false, message: "Client not found." };

    const currentAppearance = (client.appearance && typeof client.appearance === "object" && !Array.isArray(client.appearance))
      ? (client.appearance as Record<string, unknown>)
      : {};

    const updatedAppearance = {
      ...currentAppearance,
      billingProfile: data,
    };

    await db.client.update({
      where: { id: scope.clientId },
      data: {
        appearance: updatedAppearance,
        supportPhone: data.mobile || client.supportPhone,
        homeCity: data.city || client.homeCity,
      },
    });

    revalidatePath("/dashboard/account");
    return { ok: true, message: "Billing details saved. These will print on your bills." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to save billing details." };
  }
}

export async function submitCustomWorkRequest(data: {
  category: string;
  description: string;
  urgency: string;
  phone: string;
}): Promise<ActionResult> {
  try {
    const scope = await getScope();
    if (!data.description.trim()) {
      return { ok: false, message: "Please explain what you need in your own words." };
    }

    if (scope.clientId) {
      const client = await db.client.findUnique({ where: { id: scope.clientId } });
      if (client) {
        const currentAppearance = (client.appearance && typeof client.appearance === "object" && !Array.isArray(client.appearance))
          ? (client.appearance as Record<string, unknown>)
          : {};
        
        const existing = Array.isArray(currentAppearance.customWorkRequests)
          ? (currentAppearance.customWorkRequests as Array<Record<string, unknown>>)
          : [];

        const updated = [
          {
            t: data.category,
            d: data.description,
            u: data.urgency,
            p: data.phone,
            on: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
            st: "Sent",
          },
          ...existing,
        ];

        await db.client.update({
          where: { id: scope.clientId },
          data: {
            appearance: {
              ...currentAppearance,
              customWorkRequests: updated,
            },
          },
        });
      }
    }

    // Email it to Thabaal's inbox (lib/email.ts). The request is saved either way.
    const [user, client] = await Promise.all([
      requireUser(),
      scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { name: true, appearance: true } }) : null,
    ]);
    const profile = (client?.appearance as { billingProfile?: { email?: string } } | null)?.billingProfile;
    const mail = await sendEmail({
      subject: `thabaal request: ${data.category} · ${client?.name ?? "no business"}`,
      replyTo: profile?.email || user.email,
      rows: [
        ["Business", client?.name ?? "-"],
        ["Asked by", `${user.name ?? ""} <${user.email}>`],
        ["What they need", data.category],
        ["In their words", data.description.trim()],
        ["How soon", data.urgency],
        ["Number to call", data.phone],
        ["Sent", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
      ],
    });
    if (!mail.ok) console.error("[custom work] email to Thabaal failed:", mail.error);

    revalidatePath("/dashboard/account");
    return {
      ok: true,
      message: mail.ok
        ? "Request sent to thabaal. We will call you within 2 working days."
        : "Request saved. We could not email it just now, so please also WhatsApp us on 6379140626.",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Failed to submit request." };
  }
}

/** Who is acting, from the session: never from anything the browser sends. */
async function actor(): Promise<Actor> {
  const [scope, user] = await Promise.all([getScope(), requireUser()]);
  return { isAdmin: scope.isAdmin, clientId: scope.clientId, canManage: scope.manager, name: user.name || user.email };
}

function done(r: SubResult): SubResult {
  if (r.ok) {
    revalidatePath("/dashboard/account");
    revalidatePath("/dashboard", "layout");
  }
  return r;
}

/**
 * The client sends the UPI reference for a plan period they paid for. It is recorded as waiting to be checked;
 * the plan, its limits and its dates don't change until Thabaal verifies it. Price and dates are the server's.
 */
export async function sendPlanPayment(input: { plan: string; cycle: string; utr: string; payApp?: string; paidOn?: string }): Promise<SubResult> {
  const a = await actor();
  if (!a.clientId) return { ok: false, message: a.isAdmin ? "Pick a client in the sidebar first." : "Your login isn't linked to a business." };
  const result = await submitPlanPayment(a, { ...input, clientId: a.clientId });
  if (result.ok && result.id) await emailPlanPaymentToThabaal(result.id, a.clientId);
  return done(result);
}

/**
 * Tells Thabaal's inbox that a client sent a UPI payment to check. The payment is already saved as waiting, so
 * a failed email never fails the client's submission: it is logged, and the payment still shows in the admin panel.
 */
async function emailPlanPaymentToThabaal(purchaseId: string, clientId: string) {
  try {
    const [row, client, user] = await Promise.all([
      db.planPurchase.findUnique({ where: { id: purchaseId } }),
      db.client.findUnique({ where: { id: clientId }, select: { name: true, appearance: true } }),
      requireUser(),
    ]);
    if (!row) return;
    const profile = (client?.appearance as { billingProfile?: { email?: string; mobile?: string } } | null)?.billingProfile;
    const plan = planDef(row.plan)?.n ?? row.plan;
    const cycle = isCycle(row.cycle) ? CYCLE_NAMES[row.cycle].en : row.cycle;
    const mail = await sendEmail({
      subject: `Plan payment to verify: ${client?.name ?? "business"} - ${plan} ${cycle} - Rs ${(row.amountPaise / 100).toLocaleString("en-IN")}`,
      replyTo: profile?.email || user.email,
      rows: [
        ["Business", client?.name ?? "-"],
        ["Plan", `${plan} (${cycle})`],
        ["Amount to receive", `Rs ${(row.amountPaise / 100).toLocaleString("en-IN")}`],
        ["UPI reference (UTR)", row.utr ?? "-"],
        ["Paid on", row.paidOn ?? "-"],
        ["Paid with", row.payApp ?? "-"],
        ["Sent by", `${user.name ?? ""} <${user.email}>`],
        ["Mobile", profile?.mobile ?? "-"],
        ["Sent", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
        ["What to do", "Match the UTR and amount with your bank entry, then open https://www.thabaal.in/dashboard/requests and press \"Money received: verify\"."],
      ],
    });
    if (!mail.ok) console.error("[plan payment] email to Thabaal failed:", mail.error);
  } catch (err) {
    console.error("[plan payment] email to Thabaal failed:", err instanceof Error ? err.message : err);
  }
}

/** Withdraw a payment reference that hasn't been checked yet. */
export async function withdrawPlanPayment(id: string): Promise<SubResult> {
  return done(await cancelPlanPayment(await actor(), id));
}

/** Thabaal only: the money arrived, so the period is scheduled (after the current one) or starts now. */
export async function confirmPlanPayment(id: string, startNowIfNoHistory = false): Promise<SubResult> {
  return done(await verifyPlanPayment(await actor(), id, { startNowIfNoHistory }));
}

/** Thabaal only: the money wasn't found. */
export async function declinePlanPayment(id: string, reason: string): Promise<SubResult> {
  return done(await rejectPlanPayment(await actor(), id, reason));
}

/** Thabaal only: record a period a business paid for before plan payments were tracked. */
export async function recordPaidPeriod(input: { clientId: string; plan: string; cycle: string; startDate: string; note?: string }): Promise<SubResult> {
  return done(await recordExistingPeriod(await actor(), input));
}

/** Thabaal only: whether this business must have a paid plan to use thabaal. */
export async function requirePaidPlan(clientId: string, required: boolean): Promise<SubResult> {
  return done(await setPlanRequired(await actor(), clientId, required));
}
