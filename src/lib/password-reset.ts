import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";

// "Forgot password" links. Each link is a signed token, so nothing new is stored in the database:
//  - signed with a key derived from AUTH_SECRET but different from the login key, so a reset link can
//    never be used as a login cookie (and a login cookie can't be used as a reset link);
//  - valid for 30 minutes;
//  - tied to the account's current password: once the password changes, every older link stops working,
//    so each link works only once.

export const RESET_MINUTES = 30;
const PURPOSE = "pw-reset";

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(createHash("sha256").update(`${s}:${PURPOSE}`).digest("hex"));
}

/** A short fingerprint of the stored password hash; changes whenever the password does. */
const fingerprint = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);

export async function makeResetToken(user: { id: string; passwordHash: string }) {
  return new SignJWT({ p: PURPOSE, pf: fingerprint(user.passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${RESET_MINUTES}m`)
    .sign(key());
}

/** The account the link is for, or null when the link is forged, expired or already used. */
export async function readResetToken(token: string | null | undefined) {
  if (!token || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.p !== PURPOSE || typeof payload.sub !== "string" || typeof payload.pf !== "string") return null;
    const user = await db.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, name: true, passwordHash: true } });
    if (!user || fingerprint(user.passwordHash) !== payload.pf) return null;
    return user;
  } catch {
    return null;
  }
}
