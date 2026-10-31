"use server";

import { ensureOrderPrefix } from "@/lib/orders";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { businessTypeOf } from "@/lib/business-types";
import { CITY, newClientData } from "@/lib/client-create";
import { db } from "@/lib/db";
import { CLIENT_SECTIONS, sanitizeDisabledSections } from "@/lib/client-sections";
import { CLIENT_COOKIE, VIEW_PREFIX, requireAdmin } from "@/lib/session";
import { HEX } from "@/lib/theme";
import { enableMetaCalling, listPhoneNumbers, syncMetaBusinessProfile, waConfig } from "@/lib/whatsapp";
import { refreshNumberStatus } from "@/lib/limits";
import { planCapacityBlock } from "@/lib/subscription";
import type { ActionResult } from "./templates";

// These tools are used from the client dashboard and from the admin panel's client page.
const refresh = () => {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
};

const PICK_COOKIE = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

/** Admin's client switcher. An empty id shows every client. Also ends a read-only "Help a client" view. */
export async function setActiveClient(clientId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const jar = await cookies();
  if (!clientId) jar.delete(CLIENT_COOKIE);
  else {
    if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
    jar.set(CLIENT_COOKIE, clientId, PICK_COOKIE);
  }
  refresh();
  return { ok: true };
}

/** Admin panel › Help a client: open this business's app read-only, exactly as its owner sees it. */
export async function viewClientAs(clientId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!clientId || !(await db.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return { ok: false, message: "Client not found." };
  // Short-lived on purpose: a forgotten view ends by itself.
  (await cookies()).set(CLIENT_COOKIE, VIEW_PREFIX + clientId, { ...PICK_COOKIE, maxAge: 60 * 60 * 8 });
  refresh();
  return { ok: true };
}

/** Ends the read-only view and returns the admin to all clients. */
export async function leaveClientView(): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const jar = await cookies();
  if (jar.get(CLIENT_COOKIE)?.value?.startsWith(VIEW_PREFIX)) jar.delete(CLIENT_COOKIE);
  refresh();
  return { ok: true };
}

export async function createClient(name: string, disabledSections?: string[], homeCity?: string, businessType?: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const v = newClientData({ name, city: homeCity, businessType, disabledSections });
  if (!v.ok) return v;
  const clean = v.name;
  if (await db.client.findUnique({ where: { name: clean } })) return { ok: false, message: `${clean} already exists.` };
  const c = await db.client.create({ data: v.data });
  const prefix = await ensureOrderPrefix(c.id).catch(() => null);
  refresh();
  return { ok: true, id: c.id, message: `${clean} added.${prefix ? ` Its orders will be numbered ${prefix}-1001, ${prefix}-1002…` : ""}` };
}

/** Enables or disables portal sections for a specific client as configured by the portal owner. */
export async function saveClientSections(clientId: string, disabledSections: string[]): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const sanitized = sanitizeDisabledSections(disabledSections);
  if (sanitized.length >= CLIENT_SECTIONS.length) {
    return { ok: false, message: "Keep at least one portal section enabled for this client." };
  }
  const client = await db.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!client) return { ok: false, message: "Client not found." };
  await db.client.update({
    where: { id: clientId },
    data: { disabledSections: sanitized },
  });
  refresh();
  const enabledCount = CLIENT_SECTIONS.length - sanitized.length;
  return {
    ok: true,
    message:
      sanitized.length === 0
        ? `All ${CLIENT_SECTIONS.length} portal sections enabled for ${client.name}.`
        : `Saved for ${client.name}: ${enabledCount} of ${CLIENT_SECTIONS.length} sections enabled.`,
  };
}

/** The access token the client's numbers share. Blank keeps the saved one, so the form never shows it. */
export async function saveClientToken(clientId: string, rawToken: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const token = rawToken.trim();
  if (!token) return { ok: false, message: "Paste the access token from Meta." };
  if (!/^EA[A-Za-z0-9]{20,}$/.test(token)) return { ok: false, message: "That doesn't look like a Meta access token. It starts with EAA." };
  if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
  await db.client.update({ where: { id: clientId }, data: { waToken: token } });
  refresh();
  return { ok: true, message: "Access token saved." };
}

const DIGITS = /^\d{6,20}$/;

/** The token to reach an account: one typed for this number, else the client's shared token. */
async function tokenFor(clientId: string, typed?: string) {
  const t = typed?.trim();
  if (t) return t;
  return (await db.client.findUnique({ where: { id: clientId }, select: { waToken: true } }))?.waToken ?? null;
}

export type FoundNumber = { phoneNumberId: string; displayPhone: string; verifiedName: string; quality?: string; addedTo?: string };

/** Asks Meta which numbers a WhatsApp Business Account has, so nobody copies IDs by hand. */
export async function findAccountNumbers(clientId: string, businessAccountId: string, token?: string): Promise<ActionResult & { numbers?: FoundNumber[] }> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const waba = businessAccountId.trim();
  if (!DIGITS.test(waba)) return { ok: false, message: "The WhatsApp Business Account ID is a long number from WhatsApp Manager → Account settings or API setup." };
  const t = await tokenFor(clientId, token);
  if (!t) return { ok: false, message: "Save an access token first." };
  try {
    const found = await listPhoneNumbers({ ...waConfig(), token: t }, waba);
    if (!found.length) return { ok: false, message: "This WhatsApp account has no phone numbers yet. Add one in WhatsApp Manager → Phone numbers." };
    const taken = await db.whatsAppNumber.findMany({
      where: { phoneNumberId: { in: found.map((n) => n.id) } },
      select: { phoneNumberId: true, client: { select: { name: true } } },
    });
    return {
      ok: true,
      numbers: found.map((n) => ({
        phoneNumberId: n.id,
        displayPhone: n.display_phone_number,
        verifiedName: n.verified_name,
        quality: n.quality_rating,
        addedTo: taken.find((x) => x.phoneNumberId === n.id)?.client.name,
      })),
    };
  } catch (e) {
    return { ok: false, message: `Meta said: ${e instanceof Error ? e.message : "request failed"}` };
  }
}

export async function addClientNumber(
  clientId: string,
  input: { businessAccountId: string; phoneNumberId: string; label: string; token?: string },
): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const waba = input.businessAccountId.trim();
  const label = input.label.trim();
  if (!label) return { ok: false, message: "Give the number a short name, e.g. Main or Madurai." };
  const planBlock = await planCapacityBlock(clientId, "num");
  if (planBlock) return { ok: false, message: planBlock };
  const ownToken = input.token?.trim() || null;
  const t = await tokenFor(clientId, ownToken ?? undefined);
  if (!t) return { ok: false, message: "Save an access token first." };

  // Confirm with Meta that the number really is in that account and the token reaches it.
  let match;
  try {
    match = (await listPhoneNumbers({ ...waConfig(), token: t }, waba)).find((n) => n.id === input.phoneNumberId);
  } catch (e) {
    return { ok: false, message: `Meta said: ${e instanceof Error ? e.message : "request failed"}` };
  }
  if (!match) return { ok: false, message: "That number isn't in this WhatsApp account." };
  const clash = await db.whatsAppNumber.findUnique({ where: { phoneNumberId: match.id }, include: { client: { select: { name: true } } } });
  if (clash) return { ok: false, message: `${match.display_phone_number} is already added${clash.clientId === clientId ? "" : ` to ${clash.client.name}`}.` };

  const first = !(await db.whatsAppNumber.count({ where: { clientId } }));
  const created = await db.whatsAppNumber.create({
    data: {
      clientId, label, phoneNumberId: match.id, businessAccountId: waba,
      displayPhone: match.display_phone_number, verifiedName: match.verified_name, token: ownToken, isDefault: first,
      qualityRating: match.quality_rating ?? null,
    },
  });
  await refreshNumberStatus(created, t);
  const cfg = waConfig({ token: t, phoneNumberId: created.phoneNumberId, businessAccountId: created.businessAccountId });
  await enableMetaCalling(cfg);
  refresh();
  return { ok: true, message: `${label} (${match.display_phone_number}) added${first ? " as the default number" : ""}.` };
}

/** Fetches every number's quality and messaging limit from Meta now, and ensures calling & profile are synced. */
export async function refreshClientNumbers(clientId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.client.findUnique({ where: { id: clientId }, include: { numbers: true } });
  if (!c) return { ok: false, message: "Client not found." };
  const results = await Promise.all(
    c.numbers.map(async (n) => {
      const ok = await refreshNumberStatus(n, c.waToken);
      const token = n.token ?? c.waToken;
      if (token) {
        const cfg = waConfig({ token, phoneNumberId: n.phoneNumberId, businessAccountId: n.businessAccountId });
        await enableMetaCalling(cfg);
        if (c.tagline || c.website) {
          await syncMetaBusinessProfile(cfg, { about: c.tagline, website: c.website });
        }
      }
      return ok;
    }),
  );
  refresh();
  const ok = results.filter(Boolean).length;
  return ok === c.numbers.length ? { ok: true, message: "Quality, calling settings, and limits updated from Meta." } : { ok: false, message: `Updated ${ok} of ${c.numbers.length}. Check the token can reach the others.` };
}

/** A lower daily limit than Meta's while a new number warms up. Empty clears it. */
export async function setDailyCap(numberId: string, raw: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const clean = raw.trim();
  const cap = clean ? Number(clean) : null;
  if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 100_000)) return { ok: false, message: "Enter a whole number of people per day, or leave it empty." };
  await db.whatsAppNumber.update({ where: { id: numberId }, data: { dailyCap: cap } });
  refresh();
  return { ok: true, message: cap ? `Capped at ${cap} people a day.` : "Cap removed; follows Meta's limit." };
}

/** Protects number quality: hours between offers to the same person, and no offers at night. */
export async function saveSendingRules(clientId: string, input: { marketingGapHours: number; quietFrom: string; quietTo: string }): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!Number.isInteger(input.marketingGapHours) || input.marketingGapHours < 0 || input.marketingGapHours > 24 * 30) return { ok: false, message: "Pick how long to wait between offers." };
  const quiet = input.quietFrom && input.quietTo;
  if (quiet && (!time.test(input.quietFrom) || !time.test(input.quietTo))) return { ok: false, message: "Quiet hours need a start and end time." };
  await db.client.update({
    where: { id: clientId },
    data: { marketingGapHours: input.marketingGapHours, quietFrom: quiet ? input.quietFrom : null, quietTo: quiet ? input.quietTo : null },
  });
  refresh();
  return { ok: true, message: "Sending rules saved. They apply from the next batch." };
}

export async function setDefaultNumber(numberId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const n = await db.whatsAppNumber.findUnique({ where: { id: numberId } });
  if (!n) return { ok: false, message: "Number not found." };
  await db.$transaction([
    db.whatsAppNumber.updateMany({ where: { clientId: n.clientId }, data: { isDefault: false } }),
    db.whatsAppNumber.update({ where: { id: numberId }, data: { isDefault: true } }),
  ]);
  refresh();
  return { ok: true, message: `${n.label} is now the default number.` };
}

export async function renameNumber(numberId: string, label: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!label.trim()) return { ok: false, message: "Enter a name." };
  await db.whatsAppNumber.update({ where: { id: numberId }, data: { label: label.trim() } });
  refresh();
  return { ok: true, message: "Renamed." };
}

export async function removeClientNumber(numberId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const n = await db.whatsAppNumber.findUnique({ where: { id: numberId } });
  if (!n) return { ok: false, message: "Number not found." };
  await db.whatsAppNumber.delete({ where: { id: numberId } });
  // Keep one default while numbers remain; campaigns that used this one fall back to it.
  if (n.isDefault) {
    const next = await db.whatsAppNumber.findFirst({ where: { clientId: n.clientId }, orderBy: { createdAt: "asc" } });
    if (next) await db.whatsAppNumber.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  refresh();
  return { ok: true, message: `${n.label} removed. Campaigns that used it now send from the default number.` };
}

export type BrandingInput = {
  brandPrimary: string;
  brandAccent: string;
  logoUrl: string;
  bannerUrl: string;
  tagline: string;
  website: string;
  supportPhone: string;
  /** Picture for order updates and picture templates that have none of their own (public JPG or PNG). */
  defaultImageUrl: string;
  /** City they deliver from; blank keeps Madurai for clients set up before cities could be chosen. */
  homeCity: string;
  /** Kind of business (lib/business-types.ts); blank = not chosen. */
  businessType: string;
  /** Prefix of this client's order numbers (FM in FM-1001); blank keeps the current one. */
  orderPrefix: string;
};

/** Looks the client's login sees. Blank fields fall back to the default portal look. */
export async function saveClientBranding(clientId: string, input: BrandingInput): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const v = Object.fromEntries(Object.entries(input).map(([k, x]) => [k, x.trim() || null])) as Record<keyof BrandingInput, string | null>;
  const errors: string[] = [];
  for (const k of ["brandPrimary", "brandAccent"] as const) if (v[k] && !HEX.test(v[k]!)) errors.push("Colours must look like #f5c400.");
  for (const k of ["logoUrl", "bannerUrl", "defaultImageUrl"] as const) if (v[k] && !/^(https:\/\/|\/)\S+$/.test(v[k]!)) errors.push("Images need a full https:// link or a path starting with /.");
  if (v.defaultImageUrl && !/\.(jpe?g|png)(\?\S*)?$/i.test(v.defaultImageUrl)) errors.push("The message picture must be a JPG or PNG; WhatsApp accepts only those.");
  if (v.homeCity) v.homeCity = v.homeCity.replace(/\s+/g, " ");
  if (v.homeCity && !CITY.test(v.homeCity)) errors.push("Home city: enter just the city name, e.g. Chennai.");
  if (v.businessType && !businessTypeOf(v.businessType)) errors.push("Pick a business type from the list.");
  if (v.website && !/^https?:\/\/\S+\.\S+/.test(v.website)) errors.push("Website should start with https://");
  if (v.tagline && v.tagline.length > 80) errors.push("Keep the tagline under 80 characters.");
  // Order prefix: 2 to 5 letters, unique across clients; blank leaves the current one (and its numbering) alone.
  const prefix = v.orderPrefix?.toUpperCase() ?? null;
  const { orderPrefix: _p, ...rest } = v;
  void _p;
  if (prefix && !/^[A-Z]{2,5}$/.test(prefix)) errors.push("Order prefix: 2 to 5 letters, e.g. FM.");
  if (prefix && (await db.client.findFirst({ where: { orderPrefix: prefix, id: { not: clientId } }, select: { name: true } })))
    errors.push(`Order prefix ${prefix} is already used by another client.`);
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  const client = await db.client.findUnique({ where: { id: clientId }, include: { numbers: true } });
  if (!client) return { ok: false, message: "Client not found." };
  await db.client.update({ where: { id: clientId }, data: { ...rest, ...(prefix && { orderPrefix: prefix }) } });
  if (v.tagline || v.website) {
    await Promise.all(
      client.numbers.map((n) => {
        const token = n.token ?? client.waToken;
        if (!token) return Promise.resolve(false);
        return syncMetaBusinessProfile(
          waConfig({ token, phoneNumberId: n.phoneNumberId, businessAccountId: n.businessAccountId }),
          { about: v.tagline, website: v.website },
        );
      }),
    );
  }
  refresh();
  return { ok: true, message: "Branding saved and synced to WhatsApp Business Profile." };
}

const ACCESS = ["MANAGER", "STAFF", "VIEWER"] as const;
type Access = (typeof ACCESS)[number];

export async function createClientUser(clientId: string, input: { name: string; email: string; password: string; access?: Access }): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) return { ok: false, message: "Enter the person's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (input.password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
  if (await db.user.findUnique({ where: { email } })) return { ok: false, message: `${email} already has an account.` };
  const planBlock = await planCapacityBlock(clientId, "staff");
  if (planBlock) return { ok: false, message: planBlock };
  await db.user.create({
    data: { name: input.name.trim(), email, role: "CLIENT", access: ACCESS.includes(input.access as Access) ? input.access : "STAFF", clientId, passwordHash: await bcrypt.hash(input.password, 12) },
  });
  refresh();
  return { ok: true, message: `Login created for ${email}.` };
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "CLIENT") return { ok: false, message: "Client login not found." };
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } } });
  return { ok: true, message: `Password reset for ${u.email}. They're logged out everywhere and must use the new password.` };
}

export async function deleteClientUser(userId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "CLIENT") return { ok: false, message: "Client login not found." };
  await db.user.delete({ where: { id: userId } });
  refresh();
  return { ok: true, message: `${u.email} can no longer sign in.` };
}

/**
 * Deletes a business and everything it owns: logins, WhatsApp numbers, customers, templates, campaigns,
 * messages, orders, wallet and plan records. The admin must type the business name exactly to confirm.
 */
export async function deleteClient(clientId: string, typedName: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const c = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!c) return { ok: false, message: "Client not found." };
  if (typedName.trim() !== c.name) return { ok: false, message: `Nothing deleted. Type the business name exactly (${c.name}) to delete it.` };
  await db.$transaction([
    // Rows that point at the client without a database link, so the client's own delete can't reach them.
    db.call.deleteMany({ where: { clientId } }),
    db.loyaltyEntry.deleteMany({ where: { clientId } }),
    db.paymentEvent.deleteMany({ where: { clientId } }),
    // Campaigns go first: a campaign blocks deleting the template it uses.
    db.campaign.deleteMany({ where: { clientId } }),
    db.client.delete({ where: { id: clientId } }),
  ]);
  const jar = await cookies();
  const picked = jar.get(CLIENT_COOKIE)?.value;
  if (picked === clientId || picked === VIEW_PREFIX + clientId) jar.delete(CLIENT_COOKIE);
  refresh();
  return { ok: true, message: `${c.name} and all its data were deleted.` };
}

/** What a client login may do: Manager (everything for their business), Staff (orders, replies) or Viewer. */
export async function setUserAccess(userId: string, access: Access): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  if (!ACCESS.includes(access)) return { ok: false, message: "Unknown access level." };
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.role !== "CLIENT") return { ok: false, message: "Client login not found." };
  await db.user.update({ where: { id: userId }, data: { access } });
  refresh();
  return { ok: true, message: `${u.email} is now ${access.toLowerCase()}. It applies on their next page load.` };
}

/** Tests if the client's saved Meta access token is valid and active with Meta Graph API. */
export async function verifyClientToken(clientId: string): Promise<ActionResult & { live?: boolean }> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const client = await db.client.findUnique({
    where: { id: clientId },
    include: { numbers: { take: 1, select: { phoneNumberId: true } } },
  });
  if (!client) return { ok: false, message: "Client not found." };
  const token = client.waToken?.trim();
  if (!token) return { ok: false, message: "No Meta access token saved for this client yet." };

  try {
    const phoneId = client.numbers[0]?.phoneNumberId || client.waPhoneNumberId;
    const url = phoneId
      ? `https://graph.facebook.com/v23.0/${phoneId}?fields=id,verified_name,quality_rating`
      : `https://graph.facebook.com/v23.0/debug_token?input_token=${token}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      const code = json.error?.code;
      const msg = json.error?.message || "Token check failed";
      if (code === 190) {
        return { ok: false, message: "⚠️ Meta Access Token has EXPIRED or been revoked. Please generate a new permanent System User token." };
      }
      return { ok: false, message: `Meta reported an issue: ${msg} (code ${code ?? res.status})` };
    }
    return { ok: true, live: true, message: "✅ Meta Access Token is active, verified, and healthy!" };
  } catch (e) {
    return { ok: false, message: `Could not reach Meta Graph API: ${e instanceof Error ? e.message : "network error"}` };
  }
}

