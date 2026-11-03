/** Normalises a phone number to WhatsApp's digits-only international format. */
export function normalizePhone(raw: string, defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE ?? "91") {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) digits = defaultCountryCode + digits.slice(1);
  else if (digits.length === 10) digits = defaultCountryCode + digits;
  digits = digits.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function formatPhone(digits: string) {
  if (digits.startsWith("91") && digits.length === 12) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return `+${digits}`;
}

/** At most this many numbers for one person. */
export const MAX_NUMBERS = 5;

/** Splits digits written with no separator ("9865310945 9080553061" → two numbers), or null when they don't split evenly. */
function splitRun(digits: string): string[] | null {
  for (const size of [10, 12]) {
    if (digits.length < size * 2 || digits.length % size) continue;
    const parts = digits.match(new RegExp(`\\d{${size}}`, "g")) ?? [];
    if (size === 12 && !parts.every((p) => p.startsWith("91"))) continue;
    const phones = parts.map((p) => normalizePhone(p));
    if (phones.every(Boolean)) return phones as string[];
  }
  return null;
}

/**
 * Every number in what was typed or written on an order sheet: "98653 10945 / 90805 53061", "a, b", "a or b",
 * one per line, or two numbers run together. Returns the numbers (WhatsApp format, no repeats, in the order written)
 * and the parts that couldn't be read as a number.
 */
export function readPhones(raw: string | null | undefined): { phones: string[]; bad: string[] } {
  const phones: string[] = [];
  const bad: string[] = [];
  for (const part of (raw ?? "").split(/[/,;|&\n]+|\s+(?:or|and)\s+/i)) {
    const text = part.trim();
    if (!text) continue;
    const one = normalizePhone(text);
    const many = one ? [one] : splitRun(text.replace(/\D/g, ""));
    if (many) phones.push(...many);
    else bad.push(text);
  }
  return { phones: [...new Set(phones)], bad };
}
