/**
 * Strict protocol and URL sanitization for historical WhatsApp message cards.
 * Prevents XSS, script injection, and unintended scheme execution.
 */

export function safeHistoricalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function safeHistoricalPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\s()-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) return null;
  return `tel:${normalized}`;
}
