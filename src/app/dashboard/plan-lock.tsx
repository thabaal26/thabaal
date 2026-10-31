// Section gate for portal pages. A business that hasn't paid (lib/plan-access.ts) still opens every page to look
// around; what it can't do is change anything: every server action refuses with PLAN_LOCKED_MESSAGE, and the
// portal shows the "Subscribe to continue" popup for it (plan-lock-popup.tsx).

import { redirect } from "next/navigation";
import { isSectionEnabled, type ClientSectionId } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { getScope } from "@/lib/session";

/**
 * Always null (render the page). With `section`, a business that has that section switched off (Clients ›
 * sections, e.g. a marketing-only business without Orders) is sent to Home, so the page can't be opened by typing
 * its address.
 */
export async function planGate(section?: ClientSectionId) {
  const scope = await getScope();
  if (section && scope.clientId) {
    const c = await db.client.findUnique({ where: { id: scope.clientId }, select: { disabledSections: true } });
    if (!isSectionEnabled(c?.disabledSections, section)) redirect("/dashboard");
  }
  return null;
}
