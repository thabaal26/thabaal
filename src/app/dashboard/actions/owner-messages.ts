"use server";

// Admin panel › Messages (lib/owner-messages.ts). Admins only.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  cancelOwnerMessage,
  createOwnerMessage,
  processOwnerMessages,
  saveOwnerSettings,
  submitOwnerTemplates,
  type NewOwnerMessage,
  type OwnerResult,
} from "@/lib/owner-messages";
import { requireAdmin, requireUser } from "@/lib/session";

async function admin() {
  const scope = await requireAdmin();
  if ("denied" in scope) return null;
  const user = await requireUser();
  return { isAdmin: true, name: user.name || user.email };
}
const denied: OwnerResult = { ok: false, message: "Only Thabaal can message business owners." };
const done = (r: OwnerResult) => {
  if (r.ok) revalidatePath("/admin/messages");
  return r;
};

export async function sendOwnerMessage(input: NewOwnerMessage): Promise<OwnerResult> {
  const who = await admin();
  if (!who) return denied;
  const r = await createOwnerMessage(who, input);
  // Due now: start sending once the answer has gone, instead of waiting for the scheduler's next run.
  if (r.ok) after(() => processOwnerMessages().then(() => undefined).catch((e) => console.error("owner messages", e)));
  return done(r);
}

export async function cancelOwnerMessageAction(id: string): Promise<OwnerResult> {
  const who = await admin();
  return who ? done(await cancelOwnerMessage(who, id)) : denied;
}

export async function saveOwnerMessageSettings(input: unknown): Promise<OwnerResult> {
  const who = await admin();
  return who ? done(await saveOwnerSettings(who, input)) : denied;
}

export async function submitOwnerTemplatesAction(): Promise<OwnerResult> {
  const who = await admin();
  if (!who) return denied;
  try {
    return done(await submitOwnerTemplates(who));
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Meta didn't accept the templates." };
  }
}
