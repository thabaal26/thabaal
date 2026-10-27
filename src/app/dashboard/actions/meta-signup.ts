"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { closeSignup, fetchCustomerToken, getSignup, recordConnectStart, subscribeToAccount } from "@/lib/meta-signup";
import { getScope, requireAdmin } from "@/lib/session";
import { listPhoneNumbers, waConfig } from "@/lib/whatsapp";
import { addClientNumber } from "./clients";
import type { ActionResult } from "./templates";

const refresh = () => revalidatePath("/dashboard", "layout");

/**
 * Thabaal admin: attach a WhatsApp account a business shared through Meta's hosted sign-up to one Thabaal business.
 * Existing businesses are protected: one that already has a number connected is refused, and nothing is saved
 * unless Meta first returns the customer's token and at least one number.
 */
export async function attachMetaSignup(signupId: string, clientId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };

  const systemToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!systemToken || !appSecret)
    return { ok: false, message: "Not switched on yet: add META_SYSTEM_USER_TOKEN (Thabaal's system user token from Meta) in Vercel, then try again." };

  const signup = await getSignup(signupId);
  if (!signup) return { ok: false, message: "That WhatsApp account is no longer in the list." };
  if (signup.status !== "NEW") return { ok: false, message: "This WhatsApp account was already handled." };
  if (!clientId) return { ok: false, message: "Pick the Thabaal business it belongs to." };

  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, _count: { select: { numbers: true } } } });
  if (!client) return { ok: false, message: "Business not found." };
  if (client._count.numbers > 0)
    return { ok: false, message: `${client.name} already has a WhatsApp number connected, so nothing was changed. Add more numbers for it from Clients.` };
  const inUse = await db.whatsAppNumber.findFirst({ where: { businessAccountId: signup.wabaId }, select: { client: { select: { name: true } } } });
  if (inUse) return { ok: false, message: `This WhatsApp account is already used by ${inUse.client.name}, so nothing was changed.` };

  // 1. The customer's token, from Meta. Nothing is saved yet.
  const got = await fetchCustomerToken({ businessId: signup.ownerBusinessId ?? "", systemToken, appSecret });
  if (!got.ok) return { ok: false, message: got.message };

  // 2. Their numbers. If there are none yet (sign-up not finished), stop here and keep the account waiting.
  let found;
  try {
    found = await listPhoneNumbers({ ...waConfig(), token: got.token }, signup.wabaId);
  } catch (e) {
    return { ok: false, message: `Meta said: ${e instanceof Error ? e.message : "request failed"}` };
  }
  if (!found.length) return { ok: false, message: "This WhatsApp account has no phone number yet. Ask them to finish adding one in Meta's sign-up, then try again." };

  // 3. Save the token on the business, then add the numbers the same way Clients does by hand.
  await db.client.update({ where: { id: client.id }, data: { waToken: got.token } });
  const added: string[] = [];
  const problems: string[] = [];
  for (const n of found) {
    const label = (n.verified_name || n.display_phone_number || "WhatsApp").slice(0, 40);
    const r = await addClientNumber(client.id, { businessAccountId: signup.wabaId, phoneNumberId: n.id, label });
    if (r.ok) added.push(n.display_phone_number);
    else problems.push(`${n.display_phone_number}: ${r.message ?? "not added"}`);
  }
  if (!added.length) {
    refresh();
    return { ok: false, message: `No number could be added. ${problems.join(" ")} The account is still waiting, so you can try again.` };
  }

  // 4. Webhooks for this account (best effort), then close the request.
  const subscribed = await subscribeToAccount(signup.wabaId, got.token);
  await closeSignup(signup.id, "ATTACHED", client.id, `${added.length} number(s) added`);
  refresh();
  return {
    ok: true,
    message:
      `${added.join(", ")} added to ${client.name}.` +
      (subscribed ? "" : " Meta did not confirm the webhook subscription; use Refresh on their Clients card, and check that messages arrive.") +
      (problems.length ? ` Not added: ${problems.join(" ")}` : ""),
  };
}

/** A business owner or manager pressed "Connect your WhatsApp": remembered so Thabaal can match the new account to it. */
export async function startMetaConnect(): Promise<ActionResult> {
  const scope = await getScope();
  if (!scope.clientId || !(scope.isAdmin || scope.manager)) return { ok: false };
  await recordConnectStart(scope.clientId);
  return { ok: true };
}

/** Thabaal admin: hide a WhatsApp account that isn't one of our businesses. It can't be attached afterwards. */
export async function ignoreMetaSignup(signupId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const changed = await closeSignup(signupId, "IGNORED", null, "Ignored by admin");
  refresh();
  return changed ? { ok: true, message: "Hidden." } : { ok: false, message: "This one was already handled." };
}
