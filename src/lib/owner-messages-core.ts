// Messages from Thabaal to business owners (admin panel › Messages): kinds, who gets each, the {placeholders},
// quiet hours and the WhatsApp templates they go out in. Pure: shared by the server, the page and the tests.

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type OwnerKind = "rem" | "over" | "up" | "win" | "news" | "free";
export type Audience = "auto" | "all" | "overdue" | "risk" | "pick";

export const KINDS: readonly { k: OwnerKind; n: string; log: string; text: string }[] = [
  {
    k: "rem",
    n: "Payment reminder",
    log: "Reminder",
    text: "Your thabaal {plan} plan for {shop} ends on {date}. Renew it for {amount} from My account in thabaal, or turn on auto-pay there so it renews by itself.",
  },
  {
    k: "over",
    n: "Overdue warning",
    log: "Reminder",
    text: "We have not received {amount} for the {plan} plan of {shop}, which ended on {date}. Pay from My account in thabaal and everything opens again straight away. Nothing is deleted.",
  },
  {
    k: "up",
    n: "Suggest a bigger plan",
    log: "Sales",
    text: "{shop} is using almost everything the {plan} plan allows. The next plan gives you more campaigns, more staff logins and fuller reports. Shall we move you? Reply YES and we will do it.",
  },
  {
    k: "win",
    n: "Win back a quiet shop",
    log: "Win-back",
    text: "We have not seen {shop} on thabaal for a while. Your customers and orders are all still there. Tell us what got in the way and we will set it right.",
  },
  { k: "news", n: "Something new in thabaal", log: "Marketing", text: "Something new in thabaal for {shop}: " },
  { k: "free", n: "Write my own", log: "Marketing", text: "" },
];
export const AUDIENCES: readonly { k: Audience; n: string }[] = [
  { k: "auto", n: "The right shops for this message" },
  { k: "all", n: "Every shop" },
  { k: "overdue", n: "Only unpaid shops" },
  { k: "risk", n: "Only shops at risk" },
  { k: "pick", n: "Let me choose" },
];
export const isKind = (v: unknown): v is OwnerKind => KINDS.some((k) => k.k === v);
export const isAudience = (v: unknown): v is Audience => AUDIENCES.some((a) => a.k === v);
/** Payment messages never go to a shop whose plan renews by itself (Razorpay reminds them). */
export const isPaymentKind = (k: string) => k === "rem" || k === "over";

/** What the page and the sender know about each shop. */
export type OwnerTarget = {
  id: string;
  name: string;
  owner: string | null;
  phone: string | null;
  planName: string | null;
  amount: number;
  date: string | null;
  /** lib/subscription-core AccessState. */
  state: string;
  autoPay: "on" | "off" | "failing" | "none";
  atRisk: boolean;
  nearLimit: boolean;
  quiet: boolean;
};

/** Who a message is for, and who is left out and why. */
export function pickAudience(kind: OwnerKind, audience: Audience, shops: OwnerTarget[], picked: string[] = []) {
  const unpaid = (s: OwnerTarget) => s.state === "overdue" || s.state === "locked";
  const right: Record<OwnerKind, (s: OwnerTarget) => boolean> = {
    rem: (s) => s.state === "due",
    over: unpaid,
    up: (s) => s.nearLimit,
    win: (s) => s.quiet || s.atRisk,
    news: () => true,
    free: () => true,
  };
  const chosen = shops.filter((s) =>
    audience === "all" ? true : audience === "overdue" ? unpaid(s) : audience === "risk" ? s.atRisk : audience === "pick" ? picked.includes(s.id) : right[kind](s),
  );
  const to: OwnerTarget[] = [];
  const left: { shop: OwnerTarget; why: string }[] = [];
  for (const s of chosen) {
    if (isPaymentKind(kind) && s.autoPay === "on") left.push({ shop: s, why: "on auto-pay" });
    else if (isPaymentKind(kind) && (!s.planName || !s.amount)) left.push({ shop: s, why: "no plan to pay for yet" });
    else if (!s.phone) left.push({ shop: s, why: "no WhatsApp number on record" });
    else to.push(s);
  }
  return { to, left };
}

const R = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const PLACEHOLDERS = ["shop", "owner", "amount", "date", "plan"] as const;

/** Unknown {words} in a message, so a typo isn't sent as-is. */
export function unknownPlaceholders(text: string) {
  return [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((w) => !(PLACEHOLDERS as readonly string[]).includes(w));
}

/** The message for one shop, with {shop} {owner} {amount} {date} {plan} filled in, on one line (WhatsApp's rule). */
export function fillFor(text: string, s: OwnerTarget) {
  return text
    .replace(/\{shop\}/g, s.name)
    .replace(/\{owner\}/g, s.owner || "there")
    .replace(/\{amount\}/g, s.amount ? R(s.amount) : "your plan amount")
    .replace(/\{date\}/g, s.date ?? "the end of your plan")
    .replace(/\{plan\}/g, s.planName ?? "thabaal")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- the WhatsApp templates on Thabaal's own number ------------------------------------------------------------

/** Two approved templates carry every message: {{1}} the owner's name, {{2}} the message. */
export const OWNER_TEMPLATES = {
  update: {
    name: "thabaal_owner_update",
    category: "UTILITY",
    body: "Hello {{1}}, here is an update about your thabaal account.\n\n{{2}}\n\nReply to this message if you have any questions.\nTeam thabaal",
  },
  news: {
    name: "thabaal_owner_news",
    category: "MARKETING",
    body: "Hello {{1}}, here is news from thabaal for your shop.\n\n{{2}}\n\nReply to this message to talk to us.\nTeam thabaal",
  },
} as const;
export const templateFor = (kind: string) => (isPaymentKind(kind) ? OWNER_TEMPLATES.update : OWNER_TEMPLATES.news);
/** The whole message as the owner sees it. */
export const wrapped = (kind: string, owner: string | null, text: string) => templateFor(kind).body.replace("{{1}}", owner || "there").replace("{{2}}", text);

// ---- quiet hours and automatic reminders ----------------------------------------------------------------------

export type OwnerMsgSettings = {
  /** Automatic payment reminders, and when they go relative to the day a plan ends. */
  reminders: boolean;
  before3: boolean;
  onDay: boolean;
  dayAfter: boolean;
  weekLater: boolean;
  /** Nothing is sent outside these times (app time zone), nor on Sundays when skipSundays. */
  quietFrom: string;
  quietTo: string;
  skipSundays: boolean;
};
export const DEFAULT_OWNER_SETTINGS: OwnerMsgSettings = {
  reminders: false,
  before3: true,
  onDay: true,
  dayAfter: true,
  weekLater: false,
  quietFrom: "09:00",
  quietTo: "20:00",
  skipSundays: true,
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readOwnerSettings(saved: unknown): OwnerMsgSettings {
  const s = { ...DEFAULT_OWNER_SETTINGS };
  if (!saved || typeof saved !== "object") return s;
  const o = saved as Record<string, unknown>;
  for (const k of ["reminders", "before3", "onDay", "dayAfter", "weekLater", "skipSundays"] as const) if (typeof o[k] === "boolean") s[k] = o[k] as boolean;
  if (typeof o.quietFrom === "string" && HHMM.test(o.quietFrom)) s.quietFrom = o.quietFrom;
  if (typeof o.quietTo === "string" && HHMM.test(o.quietTo)) s.quietTo = o.quietTo;
  if (s.quietFrom >= s.quietTo) return { ...s, quietFrom: DEFAULT_OWNER_SETTINGS.quietFrom, quietTo: DEFAULT_OWNER_SETTINGS.quietTo };
  return s;
}
export function checkOwnerSettings(input: unknown): { ok: true; settings: OwnerMsgSettings } | { ok: false; message: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  if (typeof o.quietFrom !== "string" || !HHMM.test(o.quietFrom) || typeof o.quietTo !== "string" || !HHMM.test(o.quietTo))
    return { ok: false, message: "Enter the quiet hours as times, like 09:00 and 20:00." };
  if (o.quietFrom >= o.quietTo) return { ok: false, message: "“From” must be earlier than “Until” on the same day." };
  return { ok: true, settings: readOwnerSettings(o) };
}

/** Days after the plan's end day that a reminder goes, as switched on. */
export function reminderOffsets(s: OwnerMsgSettings) {
  return [s.before3 && -3, s.onDay && 0, s.dayAfter && 1, s.weekLater && 7].filter((x): x is number => x !== false);
}

/** The first moment at or after `now` when sending is allowed (inside quiet hours, not a skipped Sunday). */
export function nextAllowed(now: Date, s: OwnerMsgSettings, tz: string): Date {
  for (let i = 0; i < 9; i++) {
    const day = formatInTimeZone(new Date(now.getTime() + i * 86_400_000), tz, "yyyy-MM-dd");
    const sunday = formatInTimeZone(fromZonedTime(`${day}T12:00:00`, tz), tz, "i") === "7";
    if (s.skipSundays && sunday) continue;
    const from = fromZonedTime(`${day}T${s.quietFrom}:00`, tz);
    const to = fromZonedTime(`${day}T${s.quietTo}:00`, tz);
    if (now < from) return from;
    if (now < to) return now;
  }
  return now;
}
export const canSendNow = (now: Date, s: OwnerMsgSettings, tz: string) => nextAllowed(now, s, tz).getTime() === now.getTime();
