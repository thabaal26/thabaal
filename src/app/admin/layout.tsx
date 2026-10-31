import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { IconSetLink } from "@/components/icon-set-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { appearanceDataset, resolveAppearance } from "@/lib/appearance";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/provider";
import { pendingSignupCount } from "@/lib/meta-signup";
import { CLIENT_COOKIE, VIEW_PREFIX, requireAdminPage } from "@/lib/session";
import { logout } from "../login/actions";
import "../dashboard/portal.css";
import "./admin.css";
import { AdminNav } from "./nav";
import { todayKey } from "@/lib/leads";
import { LeaveViewButton } from "./support/support-tools";

export const metadata: Metadata = {
  title: { default: "Admin · Thabaal", template: "%s · Admin · Thabaal" },
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The Thabaal admin panel (the approved admin design). Admin logins only: anyone else is sent to their own
 * dashboard, and signed-out visitors to /login (proxy.ts). Every page reads the live database.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  const picked = (await cookies()).get(CLIENT_COOKIE)?.value;
  const viewingId = picked?.startsWith(VIEW_PREFIX) ? picked.slice(VIEW_PREFIX.length) : null;
  const [planPending, walletPending, newAccounts, businesses, viewing, settings, autoPayFailing] = await Promise.all([
    db.planPurchase.count({ where: { status: "PENDING" } }),
    db.walletEntry.count({ where: { kind: "RECHARGE", status: "PENDING" } }),
    pendingSignupCount().catch(() => 0),
    db.client.count(),
    viewingId ? db.client.findUnique({ where: { id: viewingId }, select: { name: true } }) : null,
    getSettings(),
    db.razorpayRecord.count({ where: { kind: "subscription", purpose: "plan", status: { in: ["pending", "halted"] } } }),
  ]);
  // Enquiries whose follow-up is today or late.
  const leadsDue = await db.lead
    .count({ where: { stage: { notIn: ["won", "lost"] }, nextOn: { lte: new Date(`${todayKey()}T00:00:00Z`) } } })
    .catch(() => 0);
  // The portal's icon set: the app components reused here (setup tools, light/dark switch) draw their icons from it.
  const iconset = appearanceDataset(resolveAppearance(settings.appearance, null)).iconset;

  return (
    <div className="thabaal-portal thabaal-admin">
      <IconSetLink set={iconset} />
      <div className="app">
        <aside className="side">
          <Link className="logo" href="/admin">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
            <img src="/brands/thabaal/artifact-logo.png" alt="" width={40} height={22} />
            <b>thabaal</b>
            <span className="tag">admin</span>
          </Link>
          <AdminNav payments={planPending + walletPending + autoPayFailing} newAccounts={newAccounts} leadsDue={leadsDue} />
          <div className="foot">
            <span className="live">
              <i />
              {businesses} {businesses === 1 ? "business" : "businesses"} on thabaal
            </span>
            <ThemeToggle />
            <form action={logout}>
              <button className="btn sm ghost" type="submit" style={{ padding: 0 }}>
                Sign out
              </button>
            </form>
            <span>Signed in as {user.name || user.email}</span>
          </div>
        </aside>
        <main className="main" id="main">
          <div className="wrapin">
            {viewing && (
              <div className="viewing" role="status">
                <span className="grow">
                  <b>{viewing.name}</b> is open read-only (Help a client). Their app in other tabs shows their view until you leave it.
                </span>
                <LeaveViewButton />
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
