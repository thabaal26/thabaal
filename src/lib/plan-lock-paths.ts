// Kept apart from subscription-core.ts so client components can use it without loading plan data.

/**
 * What every server action answers while a business hasn't paid. The portal recognises it and shows the
 * "Subscribe to continue" popup (app/dashboard/plan-lock-popup.tsx) instead of a plain message.
 */
export const PLAN_LOCKED_MESSAGE = "Your thabaal plan isn't active. Subscribe in My account to continue.";
export const PLAN_LOCKED_EVENT = "thabaal-plan-locked";
export const isPlanLockedMessage = (text: string | null | undefined) => text === PLAN_LOCKED_MESSAGE;

/** Sections a locked business can still change things in: Home, My account and Settings (and what they contain). */
export function openWhenLocked(path: string): boolean {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return p === "/dashboard" || p === "/dashboard/account" || p.startsWith("/dashboard/account/") || p === "/dashboard/settings" || p.startsWith("/dashboard/settings/");
}
