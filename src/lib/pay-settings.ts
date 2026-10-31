// Payments › Payment settings: what a client turned on and the rules around it, kept in Client.paySettings.
// Plain helpers shared by server and client code (no database access here; see pay-settings-server.ts).

export type PaySettings = {
  /** Catalogue carts get WhatsApp's "Review and pay" (needs Client.paymentConfig too). */
  whatsappPay: boolean;
  /** Orders from chat get a UPI link (and QR, if uploaded); staff mark them paid. */
  upiOn: boolean;
  upiId: string;
  upiName: string;
  /** Uploaded QR picture sent with the UPI link; empty when none. */
  upiQrUrl: string;
  /** Orders can be marked cash on delivery and the Cash / COD tab shows. */
  codOn: boolean;
  /** Highest order total allowed as cash on delivery; null means no limit. */
  codMax: number | null;
  /** Comma-separated areas where cash on delivery is allowed; empty means everywhere. */
  codAreas: string;
  /** Shown to managers only. Only the last 4 digits of the account are ever kept. */
  bankName: string;
  bankLast4: string;
  settlement: string;
  /** Payment reminders: one after a day, a last one after 3 days (then the request is marked expired). */
  remind1: boolean;
  remind3: boolean;
  /** Thank-you message with the amount once an order is fully paid. */
  receipt: boolean;
  /** A new WhatsApp cart first asks for (or confirms) the delivery address, then how to pay. */
  askAddress: boolean;
  /** Friendly reminders for an unfinished WhatsApp order: 3 hours and 22 hours after it (free, inside the 24-hour window). */
  nudgeOn: boolean;
  /** An unfinished WhatsApp order (no address, no payment, no COD) is cancelled after this many days: 1, 3 or 7. */
  cartExpiryDays: number;
  /** Reply once a night, outside these hours (shop time zone, "HH:mm"), saying when the shop opens. */
  hoursOn: boolean;
  openAt: string;
  closeAt: string;
};

export const SETTLEMENTS = [
  { id: "Straight to your account, same day", ta: "நேரடியாக உங்கள் கணக்கிற்கு, அதே நாள்" },
  { id: "Next working day", ta: "அடுத்த வேலை நாள்" },
  { id: "Through your payment gateway", ta: "உங்கள் பேமெண்ட் கேட்வே வழியாக" },
] as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);

/** Settings from the stored JSON, with defaults that match how the app worked before the settings existed. */
/** Choices for how long an unfinished WhatsApp order waits before it is cancelled. */
export const EXPIRY_DAYS = [1, 3, 7];
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readPaySettings(raw: unknown, paymentConfig: string | null | undefined): PaySettings {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const max = Number(r.codMax);
  return {
    whatsappPay: bool(r.whatsappPay, Boolean(paymentConfig)),
    upiOn: bool(r.upiOn, false),
    upiId: str(r.upiId, 100),
    upiName: str(r.upiName, 60),
    upiQrUrl: str(r.upiQrUrl, 500),
    codOn: bool(r.codOn, true),
    codMax: Number.isFinite(max) && max > 0 ? Math.round(max) : null,
    codAreas: str(r.codAreas, 300),
    bankName: str(r.bankName, 80),
    bankLast4: /^\d{4}$/.test(str(r.bankLast4, 4)) ? str(r.bankLast4, 4) : "",
    settlement: str(r.settlement, 80),
    remind1: bool(r.remind1, true),
    remind3: bool(r.remind3, true),
    receipt: bool(r.receipt, true),
    askAddress: bool(r.askAddress, true),
    nudgeOn: bool(r.nudgeOn, true),
    cartExpiryDays: EXPIRY_DAYS.includes(Number(r.cartExpiryDays)) ? Number(r.cartExpiryDays) : 3,
    hoursOn: bool(r.hoursOn, false),
    openAt: HHMM.test(str(r.openAt, 5)) ? str(r.openAt, 5) : "09:00",
    closeAt: HHMM.test(str(r.closeAt, 5)) ? str(r.closeAt, 5) : "21:00",
  };
}

/** WhatsApp's "Review and pay" is on and has a payment configuration to use. */
export const waPayOn = (s: PaySettings, paymentConfig: string | null | undefined) => s.whatsappPay && Boolean(paymentConfig?.trim());
/** A UPI link can be sent. */
export const upiReady = (s: PaySettings) => s.upiOn && UPI_ID_RE.test(s.upiId);

/** A UPI ID (VPA) such as shopname@okaxis. */
export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

/** The standard UPI payment link; any UPI app opens it with the amount filled in. */
export function upiLink(s: Pick<PaySettings, "upiId" | "upiName">, amount: number, note: string) {
  const q = new URLSearchParams({ pa: s.upiId, pn: s.upiName || s.upiId, am: amount.toFixed(2), cu: "INR", tn: note.slice(0, 60) });
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

export const areaList = (areas: string) =>
  areas
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9஀-௿]+/g, " ").trim();

/**
 * Why cash on delivery isn't allowed for this order, or null when it is. Areas match the customer's region
 * ("Madurai city") or any word of their address; a customer with no address yet isn't blocked.
 */
export function codBlocked(
  s: PaySettings,
  total: number,
  customer?: { region?: string | null; location?: string | null; locationRaw?: string | null } | null,
): string | null {
  if (!s.codOn) return "Cash on delivery is off. Turn it on in Payments › Payment settings.";
  if (s.codMax != null && total > s.codMax + 0.005) return `Cash on delivery is allowed up to ₹${s.codMax.toLocaleString("en-IN")}; this order is ₹${Math.round(total).toLocaleString("en-IN")}.`;
  const areas = areaList(s.codAreas);
  if (!areas.length || !customer) return null;
  const where = norm([customer.region, customer.location, customer.locationRaw].filter(Boolean).join(" "));
  if (!where) return null;
  const hit = areas.some((a) => {
    const n = norm(a);
    if (!n) return false;
    if (` ${where} `.includes(` ${n} `)) return true;
    // "Madurai city" also covers an address that just says "Madurai".
    const core = n.replace(/\b(city|town|district|area)\b/g, "").trim();
    return Boolean(core) && ` ${where} `.includes(` ${core} `) && !/\boutside\b/.test(where);
  });
  return hit ? null : `Cash on delivery is only for ${areas.join(", ")}.`;
}

export type CheckoutMode = "choose" | "online" | "none";

/**
 * Decides what payment path a newly received cart should take:
 * - "choose": customer is offered "Pay now online" or "Cash on delivery" buttons
 * - "online": goes straight to "Review and pay" (COD is off, over limit, or outside areas)
 * - "none": online payment is not set up, so no payment request is sent
 */
export function checkoutMode(
  p: { settings: PaySettings; waPay: boolean; upi: boolean },
  total: number,
  customer: Parameters<typeof codBlocked>[2],
): CheckoutMode {
  const online = p.waPay || p.upi;
  if (!online) return "none";
  if (codBlocked(p.settings, total, customer) === null) return "choose";
  return "online";
}


/** The shop's clock (Asia/Kolkata unless APP_TIMEZONE says otherwise) as "HH:mm". */
const shopClock = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);

/** Outside the shop's hours (only when the shop set them). Hours may run past midnight (e.g. 18:00 to 02:00). */
export function isShopClosed(s: Pick<PaySettings, "hoursOn" | "openAt" | "closeAt">, now = new Date()) {
  if (!s.hoursOn || !HHMM.test(s.openAt) || !HHMM.test(s.closeAt) || s.openAt === s.closeAt) return false;
  const t = shopClock(now);
  const open = s.openAt < s.closeAt ? t >= s.openAt && t < s.closeAt : t >= s.openAt || t < s.closeAt;
  return !open;
}

/** "9:00 AM" from "09:00". */
export function opensAtText(s: Pick<PaySettings, "openAt">) {
  const [h, m] = s.openAt.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
