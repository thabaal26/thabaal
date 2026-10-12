import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

const COOKIE = "wp_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function readSessionUserId(token?: string) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Returns the signed-in user or redirects to /login. Use in every page and action. */
export const requireUser = cache(async () => {
  const userId = await readSessionUserId((await cookies()).get(COOKIE)?.value);
  const user = userId
    ? await db.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, access: true, clientId: true, client: { select: { name: true } } },
      })
    : null;
  if (!user || (user.role === "CLIENT" && !user.clientId)) redirect(userId ? "/api/session/clear" : "/login");
  return user;
});

export const SESSION_COOKIE = COOKIE;
/** Admin-only: which client the admin is looking at. Absent means all clients. */
export const CLIENT_COOKIE = "wp_client";

export type Scope = {
  isAdmin: boolean;
  /** Campaigns, templates, customers, automations: admins and client managers. */
  canManage: boolean;
  /** Orders, dispatch, replies: everyone but viewers. */
  canOperate: boolean;
  /** null only for an admin viewing all clients */
  clientId: string | null;
  clientName: string | null;
};

/**
 * What the signed-in user may see. Client logins are pinned to their own client;
 * admins see the client picked in the switcher, or everything.
 */
export const getScope = cache(async (): Promise<Scope> => {
  // An admin's picked client is looked up alongside the user rather than after it (client logins ignore it).
  const picked = (await cookies()).get(CLIENT_COOKIE)?.value;
  const [user, pickedClient] = await Promise.all([
    requireUser(),
    picked ? db.client.findUnique({ where: { id: picked }, select: { id: true, name: true } }) : null,
  ]);
  if (user.role === "CLIENT")
    return {
      isAdmin: false,
      canManage: user.access === "MANAGER",
      canOperate: user.access !== "VIEWER",
      clientId: user.clientId,
      clientName: user.client?.name ?? null,
    };
  return { isAdmin: true, canManage: true, canOperate: true, clientId: pickedClient?.id ?? null, clientName: pickedClient?.name ?? null };
});

/** Prisma filter for models that carry clientId (Customer, Template, Campaign, PendingCustomer). */
export function owned(s: Scope) {
  return s.clientId ? { clientId: s.clientId } : {};
}

/** Prisma filter for Message and CampaignRun, which belong to a client through their customer or campaign. */
export function ownedMessages(s: Scope) {
  return s.clientId ? { customer: { clientId: s.clientId } } : {};
}

type Denied = { denied: string };

/**
 * For server actions that change data: only admins may write. With `needClient`,
 * the admin must have a client picked so new records know where they belong.
 * Callers return `{ ok: false, message: s.denied }` when this is denied.
 */
/**
 * For day-to-day order work (confirm, dispatch, deliver, notes, new orders): the client's own
 * staff do this, so client logins may, limited to their own client. Admins may too.
 */
export async function requireOrderAccess(): Promise<Scope | Denied> {
  const s = await getScope();
  if (!s.isAdmin && !s.clientId) return { denied: "Your account isn't linked to a business." };
  if (!s.canOperate) return { denied: "Your login can view but not change anything." };
  return s;
}

/**
 * For managing a business's marketing (campaigns, templates, customers, audiences, automations):
 * admins, and client logins with Manager access, limited to their own business.
 * Actions that look a record up by id must still check it belongs to them with `mine()`.
 */
export async function requireManager(): Promise<Scope | Denied>;
export async function requireManager(needClient: true): Promise<(Scope & { clientId: string }) | Denied>;
export async function requireManager(needClient = false): Promise<Scope | Denied> {
  const s = await getScope();
  if (!s.canManage) return { denied: "Your login can't change campaigns, templates or customers. Ask the business owner." };
  if (needClient && !s.clientId) return { denied: "Pick a client in the sidebar first." };
  return s;
}

/** Whether a record of this client is within the signed-in user's reach. */
export function mine(s: Scope, clientId: string) {
  return s.isAdmin || s.clientId === clientId;
}

export async function requireAdmin(): Promise<Scope | Denied>;
export async function requireAdmin(needClient: true): Promise<(Scope & { clientId: string }) | Denied>;
export async function requireAdmin(needClient = false): Promise<Scope | Denied> {
  const s = await getScope();
  if (!s.isAdmin) return { denied: "Your account can view campaigns but not change them." };
  if (needClient && !s.clientId) return { denied: "Pick a client in the sidebar first." };
  return s;
}
