/**
 * The portal's public address, and the old addresses it used to live at. Links saved while the portal ran on an
 * old address (product photos sent to Meta, template headers, logos) point at hosts that may stop working,
 * so they are rewritten to the current address; the file behind them is the same (served from our database).
 */
export const APP_HOST = "www.thabaal.in";
export const APP_ORIGIN = `https://${APP_HOST}`;

const OLD_HOSTS = new Set([
  "campaign-seven-ruddy.vercel.app",
  "whatsapp-portal-six.vercel.app",
  "thabaal.vercel.app",
  "thabaal.in",
  "localhost",
  "127.0.0.1",
]);

/** True for a link on one of the portal's old addresses (not Meta's or anyone else's). */
export function isOldAppUrl(url: string | null | undefined) {
  if (!url) return false;
  try {
    return OLD_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The same link on the current address; other links unchanged. */
export function currentAppUrl<T extends string | null | undefined>(url: T): T {
  if (!url || !isOldAppUrl(url)) return url;
  const u = new URL(url);
  return `${APP_ORIGIN}${u.pathname}${u.search}` as T;
}
