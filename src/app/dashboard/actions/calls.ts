"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clientNumbers, numberConfig, senderFor } from "@/lib/senders";
import { getScope, owned, requireManager, requireUser } from "@/lib/session";
import { callAction, getIncomingCalls, MetaError, sendCallPermissionRequest, setIncomingCalls, startMetaCall, type IncomingCalls } from "@/lib/whatsapp";
import type { ActionResult } from "./templates";

const errText = (e: unknown) => (e instanceof MetaError || e instanceof Error ? e.message : "Something went wrong");

/** The call, if this login may handle it, with credentials for the number that was called. */
async function callFor(id: string) {
  const scope = await getScope();
  if (!scope.canOperate) return { denied: "Your login can view but not change anything." } as const;
  const call = await db.call.findFirst({
    where: { id, ...owned(scope) },
    include: { sender: { include: { client: { select: { waToken: true } } } } },
  });
  if (!call) return { denied: "Call not found." } as const;
  return { call, cfg: numberConfig(call.sender, call.sender?.client.waToken ?? null) };
}

/** Picks up a ringing call with the SDP answer the browser made from Meta's offer. */
export async function answerCall(id: string, sdp: string): Promise<ActionResult> {
  const found = await callFor(id);
  if ("denied" in found) return { ok: false, message: found.denied };
  const user = await requireUser();
  // Claim it first so two people answering at once don't both connect.
  const claimed = await db.call.updateMany({ where: { id, status: "RINGING" }, data: { status: "ANSWERED", answeredAt: new Date(), answeredBy: user.name } });
  if (!claimed.count) return { ok: false, message: "Someone else answered, or the caller hung up." };
  try {
    await callAction(found.cfg, found.call.waCallId, "pre_accept", sdp);
    await callAction(found.cfg, found.call.waCallId, "accept", sdp);
  } catch (e) {
    await db.call.update({ where: { id }, data: { status: "ENDED", endedAt: new Date() } });
    return { ok: false, message: errText(e) };
  }
  revalidatePath("/dashboard/calls");
  return { ok: true };
}

export async function rejectCall(id: string): Promise<ActionResult> {
  const found = await callFor(id);
  if ("denied" in found) return { ok: false, message: found.denied };
  const claimed = await db.call.updateMany({ where: { id, status: "RINGING" }, data: { status: "REJECTED", endedAt: new Date() } });
  if (!claimed.count) return { ok: false, message: "This call is no longer ringing." };
  await callAction(found.cfg, found.call.waCallId, "reject").catch((e) => console.error("Could not reject call", e));
  revalidatePath("/dashboard/calls");
  return { ok: true };
}

export async function hangUp(id: string): Promise<ActionResult> {
  const found = await callFor(id);
  if ("denied" in found) return { ok: false, message: found.denied };
  await callAction(found.cfg, found.call.waCallId, "terminate").catch((e) => console.error("Could not end call", e));
  // Hanging up an outgoing call that is still ringing cancels it.
  await db.call.updateMany({ where: { id, status: { in: ["RINGING", "ANSWERED"] } }, data: { status: "ENDED", endedAt: new Date() } });
  revalidatePath("/dashboard/calls");
  return { ok: true };
}

async function customerFor(customerId: string) {
  const scope = await getScope();
  if (!scope.canOperate) return { denied: "Your login can view but not change anything." } as const;
  const customer = await db.customer.findFirst({ where: { id: customerId, ...owned(scope) }, select: { id: true, phone: true, clientId: true, client: { select: { name: true } } } });
  if (!customer) return { denied: "Customer not found." } as const;
  return { customer };
}

/** Sends WhatsApp's "allow calls?" prompt; their answer comes back on the webhook. */
export async function requestCallPermission(customerId: string): Promise<ActionResult> {
  const found = await customerFor(customerId);
  if ("denied" in found) return { ok: false, message: found.denied };
  const { customer } = found;
  const { cfg } = await senderFor(customer.clientId);
  try {
    await sendCallPermissionRequest(cfg, customer.phone, `${customer.client.name} would like to call you on WhatsApp about your order. Tap Allow so we can call you.`);
  } catch (e) {
    const msg = errText(e);
    // Outside the 24-hour window Meta refuses free-form messages; say so plainly.
    return { ok: false, message: /24|re-engagement|131047/i.test(msg) ? "WhatsApp only allows this within 24 hours of the customer's last message. Ask them to message you first." : msg };
  }
  await db.customer.update({ where: { id: customer.id }, data: { callAskedAt: new Date() } });
  revalidatePath(`/dashboard/customers/${customer.id}`);
  return { ok: true, message: "Asked the customer to allow calls." };
}

/** Rings the customer with the browser's SDP offer. Returns the call's id for the browser to follow. */
export async function startCall(customerId: string, sdp: string): Promise<ActionResult> {
  const found = await customerFor(customerId);
  if ("denied" in found) return { ok: false, message: found.denied };
  const { customer } = found;
  const user = await requireUser();
  const { number, cfg } = await senderFor(customer.clientId);
  let waCallId: string;
  try {
    waCallId = await startMetaCall(cfg, customer.phone, sdp);
  } catch (e) {
    const msg = errText(e);
    return { ok: false, message: /permission/i.test(msg) ? "This customer hasn't allowed calls yet. Use \"Ask to call\" first." : msg };
  }
  // The webhook may have saved the call already if the customer picked up instantly.
  const call = await db.call.upsert({
    where: { waCallId },
    update: { senderId: number?.id, clientId: customer.clientId, customerId: customer.id, fromPhone: customer.phone, answeredBy: user.name },
    create: { waCallId, direction: "OUTGOING", senderId: number?.id, clientId: customer.clientId, customerId: customer.id, fromPhone: customer.phone, answeredBy: user.name },
  });
  revalidatePath("/dashboard/calls");
  return { ok: true, id: call.id };
}

/**
 * Chats › Calls toggle: lets customers call the business on WhatsApp, or not. Changed on Meta for every
 * WhatsApp number the business has, then read back so the switch shows what WhatsApp really has.
 */
export async function setIncomingCallsAction(on: boolean): Promise<ActionResult & { state?: IncomingCalls | null }> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const [client, numbers] = await Promise.all([
    db.client.findUnique({ where: { id: s.clientId }, select: { waToken: true } }),
    clientNumbers(s.clientId),
  ]);
  if (!numbers.length) return { ok: false, message: "Connect your WhatsApp number first." };
  const cfgs = numbers.map((n) => numberConfig(n, client?.waToken ?? null));
  try {
    for (const cfg of cfgs) await setIncomingCalls(cfg, Boolean(on));
  } catch (e) {
    const msg = errText(e);
    return {
      ok: false,
      message: /messaging limit|tier|eligib|not.*(allowed|eligible)/i.test(msg)
        ? `WhatsApp didn't allow it: ${msg} (calling needs a messaging limit of 2,000 or more).`
        : `WhatsApp didn't save it: ${msg}`,
    };
  }
  const state = await getIncomingCalls(cfgs[0]).catch(() => null);
  revalidatePath("/dashboard/calls");
  return {
    ok: true,
    state: state ?? (on ? "on" : "off"),
    message: on
      ? "Customers can now call you on WhatsApp. Their app may take a little while to show the call button."
      : "Customers can no longer call you. You can still call customers who allowed calls.",
  };
}
