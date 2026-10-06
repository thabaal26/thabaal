"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { CLIENT_COOKIE, requireAdmin } from "@/lib/session";
import { HEX } from "@/lib/theme";
import type { ActionResult } from "./templates";

const refresh = () => revalidatePath("/dashboard", "layout");

/** Admin's client switcher. An empty id shows every client. */
export async function setActiveClient(clientId: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const jar = await cookies();
  if (!clientId) jar.delete(CLIENT_COOKIE);
  else {
    if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
    jar.set(CLIENT_COOKIE, clientId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  refresh();
  return { ok: true };
}

export async function createClient(name: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const clean = name.trim();
  if (!clean) return { ok: false, message: "Enter the client's business name." };
  if (await db.client.findUnique({ where: { name: clean } })) return { ok: false, message: `${clean} already exists.` };
  const c = await db.client.create({ data: { name: clean } });
  refresh();
  return { ok: true, id: c.id, message: `${clean} added.` };
}

/** Blank token keeps the saved one, so the form never has to show it. */
export async function saveClientWhatsApp(
  clientId: string,
  input: { token: string; phoneNumberId: string; businessAccountId: string },
): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) return { ok: false, message: "Client not found." };
  const phoneNumberId = input.phoneNumberId.trim() || null;
  const businessAccountId = input.businessAccountId.trim() || null;
  const token = input.token.trim() || client.waToken;
  if (phoneNumberId && !/^\d{6,20}$/.test(phoneNumberId)) return { ok: false, message: "Phone number ID is the long number from WhatsApp Manager → API setup." };
  if (businessAccountId && !/^\d{6,20}$/.test(businessAccountId)) return { ok: false, message: "WhatsApp Business Account ID should be digits only." };
  if (phoneNumberId) {
    const clash = await db.client.findUnique({ where: { waPhoneNumberId: phoneNumberId } });
    if (clash && clash.id !== clientId) return { ok: false, message: `That phone number ID is already used by ${clash.name}.` };
  }
  await db.client.update({ where: { id: clientId }, data: { waToken: token, waPhoneNumberId: phoneNumberId, waBusinessAccountId: businessAccountId } });
  refresh();
  return { ok: true, message: phoneNumberId && businessAccountId && token ? "WhatsApp details saved." : "Saved. Fill in all three to send from this client's own number." };
}

export type BrandingInput = {
  brandPrimary: string;
  brandAccent: string;
  logoUrl: string;
  bannerUrl: string;
  tagline: string;
  website: string;
  supportPhone: string;
};

/** Looks the client's login sees. Blank fields fall back to the default portal look. */
export async function saveClientBranding(clientId: string, input: BrandingInput): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const v = Object.fromEntries(Object.entries(input).map(([k, x]) => [k, x.trim() || null])) as Record<keyof BrandingInput, string | null>;
  const errors: string[] = [];
  for (const k of ["brandPrimary", "brandAccent"] as const) if (v[k] && !HEX.test(v[k]!)) errors.push("Colours must look like #f5c400.");
  for (const k of ["logoUrl", "bannerUrl"] as const) if (v[k] && !/^(https:\/\/|\/)\S+$/.test(v[k]!)) errors.push("Images need a full https:// link or a path starting with /.");
  if (v.website && !/^https?:\/\/\S+\.\S+/.test(v.website)) errors.push("Website should start with https://");
  if (v.tagline && v.tagline.length > 80) errors.push("Keep the tagline under 80 characters.");
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };
  if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
  await db.client.update({ where: { id: clientId }, data: v });
  refresh();
  return { ok: true, message: "Branding saved. Their portal uses it from the next page load." };
}

export async function createClientUser(clientId: string, input: { name: string; email: string; password: string }): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) return { ok: false, message: "Enter the person's name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (input.password.length < 8) return { ok: false, message: "Password must be at least 8 characters." };
  if (!(await db.client.findUnique({ where: { id: clientId } }))) return { ok: false, message: "Client not found." };
  if (await db.user.findUnique({ where: { email } })) return { ok: false, message: `${email} already has an account.` };
  await db.user.create({
    data: { name: input.name.trim(), email, role: "CLIENT", clientId, passwordHash: await bcrypt.hash(input.password, 12) },
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
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  return { ok: true, message: `Password reset for ${u.email}.` };
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
