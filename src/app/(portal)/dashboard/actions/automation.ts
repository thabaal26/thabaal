"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { cleanAction, quickReplies, type ButtonActionInput } from "@/lib/engine/keys";
import { asMode } from "@/lib/engine/buttons";
import { pauseChat, resumeChat } from "@/lib/engine/conversation";
import { mine, owned, requireAdmin, requireManager, requireOrderAccess, requireUser } from "@/lib/session";
import type { ActionResult } from "./templates";

// Automatic replies (lib/engine): what a template's quick-reply button does when tapped, pausing and resuming
// automatic replies in one chat, and (admins) a business's automation mode. Every lookup is limited to the
// signed-in business; a record of another business is "not found".

/** Saves what one quick-reply button of a template does (managers). */
export async function saveButtonAction(templateId: string, buttonKey: string, input: ButtonActionInput): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const t = await db.template.findUnique({ where: { id: templateId }, select: { clientId: true, buttons: true } });
  if (!t || !mine(s, t.clientId)) return { ok: false, message: "Template not found." };
  if (!quickReplies(t.buttons).some((b) => b.key === buttonKey)) return { ok: false, message: "That button isn't on this template." };
  const checked = cleanAction(input);
  if (!checked.ok) return { ok: false, message: checked.error };
  const data = { action: checked.value.action, value: checked.value.value, replyText: checked.value.replyText, enabled: checked.value.enabled };
  await db.buttonAction.upsert({
    where: { templateId_buttonKey: { templateId, buttonKey } },
    create: { clientId: t.clientId, templateId, buttonKey, ...data },
    update: data,
  });
  revalidatePath(`/dashboard/templates/${templateId}`);
  return { ok: true, message: "Saved. Taps on this button now get this action (when automatic actions are on for your business)." };
}

/** The button goes back to today's built-in reply (managers). */
export async function removeButtonAction(templateId: string, buttonKey: string): Promise<ActionResult> {
  const s = await requireManager();
  if ("denied" in s) return { ok: false, message: s.denied };
  const r = await db.buttonAction.deleteMany({ where: { templateId, buttonKey, ...owned(s) } });
  if (!r.count) return { ok: false, message: "Nothing to remove." };
  revalidatePath(`/dashboard/templates/${templateId}`);
  return { ok: true, message: "Removed. This button gets the built-in reply again." };
}

async function ownCustomer(customerId: string) {
  const s = await requireOrderAccess();
  if ("denied" in s) return { error: s.denied };
  const c = await db.customer.findFirst({ where: { id: customerId, ...owned(s) }, select: { id: true, clientId: true } });
  return c ? { c } : { error: "Customer not found." };
}

/** Automatic replies off for this customer until staff resume them (staff and managers). */
export async function pauseChatReplies(customerId: string): Promise<ActionResult> {
  const r = await ownCustomer(customerId);
  if ("error" in r) return { ok: false, message: r.error! };
  const u = await requireUser();
  await pauseChat(r.c.clientId, r.c.id, null, u.name || u.email || "Staff");
  revalidatePath("/dashboard/replies");
  return { ok: true, message: "Automatic replies paused for this chat. Your team answers until you resume them." };
}

/** Automatic replies on again for this customer, also right after a staff reply (staff and managers). */
export async function resumeChatReplies(customerId: string): Promise<ActionResult> {
  const r = await ownCustomer(customerId);
  if ("error" in r) return { ok: false, message: r.error! };
  await resumeChat(r.c.clientId, r.c.id);
  revalidatePath("/dashboard/replies");
  return { ok: true, message: "Automatic replies are on again for this chat." };
}

/** A business's automation mode and staff quiet time (admins only). */
export async function saveAutomationSettings(clientId: string, input: { mode: string; staffPauseMinutes: number }): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const mode = asMode(input.mode);
  if (mode !== input.mode) return { ok: false, message: "Pick a mode." };
  if (!Number.isInteger(input.staffPauseMinutes) || input.staffPauseMinutes < 5 || input.staffPauseMinutes > 24 * 60)
    return { ok: false, message: "Quiet time after a staff reply must be 5 minutes to 24 hours." };
  const r = await db.client.updateMany({ where: { id: clientId }, data: { automationMode: mode, staffPauseMinutes: input.staffPauseMinutes } });
  if (!r.count) return { ok: false, message: "Client not found." };
  revalidatePath(`/admin/clients/${clientId}`);
  return {
    ok: true,
    message:
      mode === "engine"
        ? "Automatic actions are on: mapped buttons run their saved action."
        : mode === "shadow"
          ? "Testing: Thabaal logs what mapped buttons would do; customers still get today's replies."
          : "Automatic actions are off: customers get today's built-in replies.",
  };
}
