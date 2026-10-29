import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { clientAccess } from "./plan-access";

const COOKIE = "wp_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string) {
  // The user's session version rides in the token; raising it (password change) ends older logins.
  const u = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  const token = await new SignJWT({ sub: userId, sv: u?.sessionVersion ?? 0 })
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

/** The signed-in user's id and session version from the cookie, or null when missing, expired or forged. */
async function readSession(token?: string): Promise<{ userId: string; version: number } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string") return null;
    // Tokens made before session versions existed count as version 0, so nobody was logged out by the change.
    return { userId: payload.sub, version: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

export async function readSessionUserId(token?: string) {
  return (await readSession(token))?.userId ?? null;
}

/** Ends every login of this user (all devices); call after the password changes. */
export async function revokeSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/** Returns the signed-in user or redirects to /login. Use in every page and action. */
export const requireUser = cache(async () => {
  const session = await readSession((await cookies()).get(COOKIE)?.value);
  const found = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, role: true, access: true, clientId: true, sessionVersion: true, client: { select: { name: true } } },
      })
    : null;
  if (!found || found.sessionVersion !== session?.version || (found.role === "CLIENT" && !found.clientId)) redirect(session ? "/api/session/clear" : "/login");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- not needed by callers
  const { sessionVersion, ...user } = found;
  return user;
});

export const SESSION_COOKIE = COOKIE;
/** Admin-only: which client the admin is looking at. Absent means all clients. */
export const CLIENT_COOKIE = "wp_client";
/**
 * CLIENT_COOKIE value "view:<clientId>": the admin panel's "Help a client" view. The admin sees that business's
 * app exactly as its owner does (no admin menus) and nothing in it can be changed: every write is refused.
 */
export const VIEW_PREFIX = "view:";

export type Scope = {
  isAdmin: boolean;
  /** An admin looking at one business read-only ("Help a client"): no admin powers and no writes. */
  viewOnly: boolean;
  /** Campaigns, templates, customers, automations: admins and client managers. False while the business is locked. */
  canManage: boolean;
  /** Orders, dispatch, replies: everyone but viewers. False while the business is locked. */
  canOperate: boolean;
  /** The business hasn't paid (lib/plan-access.ts): only Home, My account and Settings open. Never for admins. */
  planLocked: boolean;
  /** The login's own rights, even while locked: for My account and Settings, which stay open. */
  manager: boolean;
  operator: boolean;
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
  const raw = (await cookies()).get(CLIENT_COOKIE)?.value;
  const viewing = raw?.startsWith(VIEW_PREFIX) ?? false;
  const picked = viewing ? raw!.slice(VIEW_PREFIX.length) : raw;
  const [user, pickedClient] = await Promise.all([
    requireUser(),
    picked ? db.client.findUnique({ where: { id: picked }, select: { id: true, name: true } }) : null,
  ]);
  if (user.role === "ADMIN" && viewing && pickedClient) {
    // Read-only, as the owner sees it: their plan lock applies, and no admin menus or writes.
    const planLocked = (await clientAccess(pickedClient.id)).locked;
    return {
      isAdmin: false,
      viewOnly: true,
      canManage: false,
      canOperate: false,
      planLocked,
      manager: false,
      operator: false,
      clientId: pickedClient.id,
      clientName: pickedClient.name,
    };
  }
  if (user.role === "CLIENT") {
    const manager = user.access === "MANAGER";
    const operator = user.access !== "VIEWER";
    // Unpaid business: everything that changes data is closed, except what My account and Settings allow.
    const planLocked = user.clientId ? (await clientAccess(user.clientId)).locked : false;
    return {
      isAdmin: false,
      viewOnly: false,
      canManage: manager && !planLocked,
      canOperate: operator && !planLocked,
      planLocked,
      manager,
      operator,
      clientId: user.clientId,
      clientName: user.client?.name ?? null,
    };
  }
  return {
    isAdmin: true,
    viewOnly: false,
    canManage: true,
    canOperate: true,
    planLocked: false,
    manager: true,
    operator: true,
    clientId: pickedClient?.id ?? null,
    clientName: pickedClient?.name ?? null,
  };
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
export const PLAN_LOCKED_MESSAGE = "thabaal is paused until your plan payment is verified. Pay in My account.";

/** Options for the few actions that belong to My account or Settings, which stay open while a business is locked. */
type LockOpts = { evenIfLocked?: boolean };

export async function requireOrderAccess(opts: LockOpts = {}): Promise<Scope | Denied> {
  const s = await getScope();
  if (!s.isAdmin && !s.clientId) return { denied: "Your account isn't linked to a business." };
  if (s.planLocked && !opts.evenIfLocked) return { denied: PLAN_LOCKED_MESSAGE };
  if (!(opts.evenIfLocked ? s.operator : s.canOperate)) return { denied: "Your login can view but not change anything." };
  return s;
}

/**
 * For managing a business's marketing (campaigns, templates, customers, audiences, automations):
 * admins, and client logins with Manager access, limited to their own business.
 * Actions that look a record up by id must still check it belongs to them with `mine()`.
 */
export async function requireManager(): Promise<Scope | Denied>;
export async function requireManager(needClient: true, opts?: LockOpts): Promise<(Scope & { clientId: string }) | Denied>;
export async function requireManager(needClient = false, opts: LockOpts = {}): Promise<Scope | Denied> {
  const s = await getScope();
  if (s.planLocked && !opts.evenIfLocked) return { denied: PLAN_LOCKED_MESSAGE };
  if (!(opts.evenIfLocked ? s.manager : s.canManage)) return { denied: "Your login can't change campaigns, templates or customers. Ask the business owner." };
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
  // Decided by the login itself, not the view: an admin who has a business open read-only (Help a client)
  // can still act in the admin panel, but that read-only view never shows these admin controls.
  const [s, user] = await Promise.all([getScope(), requireUser()]);
  if (user.role !== "ADMIN") return { denied: "Your account can view campaigns but not change them." };
  if (needClient && (!s.clientId || s.viewOnly)) return { denied: "Pick a client in the sidebar first." };
  return { ...s, isAdmin: true };
}

/** For admin panel pages: the signed-in admin, or off to their own dashboard / the sign-in page. */
export async function requireAdminPage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
