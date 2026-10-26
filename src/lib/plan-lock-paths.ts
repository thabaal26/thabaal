// Kept apart from subscription-core.ts so the menu (a client component) can use it without loading plan data.

/** Sections a locked business can still open: Home, My account and Settings (and what they contain). */
export function openWhenLocked(path: string): boolean {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return p === "/dashboard" || p === "/dashboard/account" || p.startsWith("/dashboard/account/") || p === "/dashboard/settings" || p.startsWith("/dashboard/settings/");
}
