import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

// Slows down password guessing: too many wrong passwords for one email, or from one network address,
// and logins pause for a while. Counts only failures in the window, so a correct login clears the email.

const WINDOW_MS = 15 * 60_000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

/** The caller's network address as Vercel reports it (first hop of x-forwarded-for). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 64);
}

const keys = (email: string, ip: string) => ({ email: `email:${email}`, ip: `ip:${ip}` });

/** Minutes until another try is allowed, or 0 when the login may be checked. */
export async function loginBlockedFor(email: string, ip: string): Promise<number> {
  const k = keys(email, ip);
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.findMany({ where: { key: k.email, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.loginAttempt.findMany({ where: { key: k.ip, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const wait = (rows: { createdAt: Date }[], max: number) =>
    rows.length >= max ? Math.max(1, Math.ceil((rows[rows.length - max].createdAt.getTime() + WINDOW_MS - Date.now()) / 60_000)) : 0;
  return Math.max(wait(byEmail, MAX_PER_EMAIL), wait(byIp, MAX_PER_IP));
}

/** Notes a wrong password (or unknown email) for both the email and the address; prunes day-old rows now and then. */
export async function recordLoginFailure(email: string, ip: string) {
  const k = keys(email, ip);
  await db.loginAttempt.createMany({ data: [{ key: k.email }, { key: k.ip }] });
  if (Math.random() < 0.1) await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } }).catch(() => {});
}

/** A correct login clears that email's failures. */
export async function clearLoginFailures(email: string) {
  await db.loginAttempt.deleteMany({ where: { key: `email:${email}` } }).catch(() => {});
}
