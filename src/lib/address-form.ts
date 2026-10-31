// Plain helpers for WhatsApp's address form (address_message) and shared locations: reading the customer's
// answer, turning it into one address line, checking it, and pre-filling the form. No database access here.

/** The fields WhatsApp's India address form sends back (all optional strings). */
export const FORM_FIELDS = [
  "name",
  "phone_number",
  "in_pin_code",
  "house_number",
  "floor_number",
  "tower_number",
  "building_name",
  "address",
  "landmark_area",
  "city",
  "state",
] as const;

export type FormField = (typeof FORM_FIELDS)[number];
export type FormValues = Partial<Record<FormField, string>>;

/** What is kept on Customer.deliveryAddress: the form's fields, and a shared location when there is one. */
export type DeliveryAddress = FormValues & { lat?: number; lng?: number; mapUrl?: string; savedAt?: string };

/** The form's values from an nfm_reply's response_json; null when it isn't an address answer. */
export function formValuesFrom(responseJson: string | null | undefined): FormValues | null {
  if (!responseJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = ((parsed as { values?: unknown }).values ?? parsed) as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return null;
  const out: FormValues = {};
  for (const k of FORM_FIELDS) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 200);
    else if (typeof v === "number") out[k] = String(v);
  }
  return out.address || out.house_number || out.building_name || out.in_pin_code || out.city ? out : null;
}

/** One line for the order and the delivery person, e.g. "12, Floor 2, Lake View Apts, Anna Nagar, Madurai, Tamil Nadu - 625020". */
export function formAddressText(v: FormValues): string {
  const floor = v.floor_number?.trim();
  const tower = v.tower_number?.trim();
  const parts = [
    v.house_number,
    floor ? (/^\d+$/.test(floor) ? `Floor ${floor}` : floor) : undefined,
    tower ? (tower.length <= 4 ? `Tower ${tower}` : tower) : undefined,
    v.building_name,
    v.address,
    v.landmark_area,
    v.city,
    v.state,
  ]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  // The same words twice (e.g. area typed into the street line too) read badly on a label.
  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pin = v.in_pin_code?.trim();
  return `${unique.join(", ")}${pin ? ` - ${pin}` : ""}`.slice(0, 500);
}

/** Fields to fix before the address can be used; null when it's complete enough to deliver to. */
export function formErrors(v: FormValues): Partial<Record<FormField, string>> | null {
  const e: Partial<Record<FormField, string>> = {};
  if (!/^[1-9]\d{5}$/.test(v.in_pin_code?.trim() ?? "")) e.in_pin_code = "Enter your 6-digit pincode.";
  if (!v.house_number?.trim() && !v.address?.trim() && !v.building_name?.trim()) e.address = "Enter your house or flat number and street.";
  if (!v.city?.trim() && !v.landmark_area?.trim()) e.city = "Enter your city or town.";
  return Object.keys(e).length ? e : null;
}

/** The customer's WhatsApp number in the form's format (+91XXXXXXXXXX); undefined for numbers outside India. */
export function formPhone(phone: string): string | undefined {
  const d = phone.replace(/\D/g, "");
  return /^91[6-9]\d{9}$/.test(d) ? `+${d}` : undefined;
}

/** The address form only works for Indian WhatsApp numbers. */
export const isIndianNumber = (phone: string) => formPhone(phone) !== undefined;

/** What to fill the form with: the last address they gave, their name (not a bare phone number) and their number. */
export function formPrefill(c: { name: string; phone: string; deliveryAddress?: unknown }): FormValues {
  const saved = (c.deliveryAddress && typeof c.deliveryAddress === "object" ? c.deliveryAddress : {}) as DeliveryAddress;
  const v: FormValues = {};
  for (const k of FORM_FIELDS) {
    const val = saved[k];
    if (typeof val === "string" && val.trim()) v[k] = val.trim();
  }
  const name = v.name || (c.name.trim().startsWith("+") ? "" : c.name.trim());
  if (name) v.name = name.slice(0, 60);
  else delete v.name;
  const phone = formPhone(v.phone_number ?? "") ?? formPhone(c.phone);
  if (phone) v.phone_number = phone;
  else delete v.phone_number;
  return v;
}

/** A short "yes, same address" reply typed instead of tapping the button (English, Tanglish, Tamil, Hindi). */
export const SAME_ADDRESS_RE =
  /^\s*(yes|yeah|yep|yup|ok|okay|okk|k|same|same address|same place|correct|right|confirm|confirmed|deliver here|ama|aama|aamaa|aamam|sari|seri|haan|ha|ஆமா|ஆம்|சரி|हाँ|हां)\s*[.!👍✅]*\s*$/iu;

/** A shared location as an address line and a map link. */
export function locationAddress(l: { latitude?: number; longitude?: number; name?: string; address?: string }) {
  const lat = typeof l.latitude === "number" ? l.latitude : null;
  const lng = typeof l.longitude === "number" ? l.longitude : null;
  const mapUrl = lat != null && lng != null ? `https://maps.google.com/?q=${lat},${lng}` : null;
  const place = [l.name, l.address].map((p) => p?.trim()).filter(Boolean).join(", ");
  const text = place ? `${place} (location pin)` : "Shared location pin";
  return { text: text.slice(0, 500), mapUrl, lat, lng };
}
