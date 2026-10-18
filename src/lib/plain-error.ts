/*
 * Technical values shown as plain words on screen. The raw values (codes, ids, template names)
 * stay in the database, the message log export and the Templates page, where they're needed.
 */

/**
 * A Meta or provider error without its numeric codes ("… for this number (130429)" → "… for this
 * number") or any technical detail after " | ".
 */
export function plainError(error: string | null | undefined): string {
  if (!error) return "";
  return error
    .split(" | ")[0]
    .replace(/\s*\(#?\d{2,}\)/g, "")
    .replace(/\s*\b(code|error code|subcode)\s*:?\s*#?\d{2,}\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A WhatsApp template's name as words: "thenan_products_india_en" → "Thenan products india".
 * Names that are already labels ("Typed reply", "Catalogue") are kept as they are.
 */
export function templateLabel(name: string | null | undefined): string {
  if (!name) return "";
  if (!/^[a-z0-9_]+$/.test(name)) return name;
  const words = name
    .replace(/_(en|en_us|en_gb|ta|hi|te|ml|kn)$/, "")
    .split("_")
    .filter(Boolean)
    .join(" ");
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
}

/** A payment reference worth showing (a UPI or bank ref), or null for internal ids such as WhatsApp message ids. */
export function paymentRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const r = ref.trim();
  // WhatsApp message ids and the "WA-UPI" placeholder (a payment bubble without a transaction id) aren't references.
  if (!r || /^wamid\./i.test(r) || /^WA-UPI$/i.test(r) || r.length > 40) return null;
  // A UTR the customer sent in chat is stored as "UTR-<number>"; show just the number.
  return r.replace(/^UTR-/i, "");
}
