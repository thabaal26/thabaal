// Enquiry (lead) rules shared by the server and the admin panel's screens: stages, sources, phone numbers and the
// funnel. Pure: no database.

export type LeadStage = "new" | "contact" | "demo" | "quote" | "won" | "lost";

/** In pipeline order; won and lost close an enquiry. Colours as in the admin design. */
export const LEAD_STAGES: readonly { k: LeadStage; n: string; color: string }[] = [
  { k: "new", n: "New enquiry", color: "var(--info)" },
  { k: "contact", n: "Contacted", color: "var(--bar2)" },
  { k: "demo", n: "Demo booked", color: "#8E5AC6" },
  { k: "quote", n: "Price sent", color: "var(--bar3)" },
  { k: "won", n: "Won", color: "var(--bar4)" },
  { k: "lost", n: "Lost", color: "var(--muted)" },
];

export const LEAD_SOURCES = ["Home page form", "Referral", "WhatsApp", "Walk-in", "Other"] as const;

export const isLeadStage = (v: unknown): v is LeadStage => typeof v === "string" && LEAD_STAGES.some((s) => s.k === v);
export const stageName = (k: string) => LEAD_STAGES.find((s) => s.k === k)?.n ?? k;
export const isOpenStage = (k: string) => k !== "won" && k !== "lost";

/** How far along the pipeline a stage is (won is the end; lost is not a step). */
const ORDER: Record<string, number> = { new: 0, contact: 1, demo: 2, quote: 3, won: 4 };
/** The furthest stage an enquiry has reached after moving to `next` (lost keeps the furthest it got). */
export function furthest(reached: string, next: string): string {
  return (ORDER[next] ?? -1) > (ORDER[reached] ?? 0) ? next : reached;
}

/** A 10-digit Indian mobile from what was typed (spaces, +91, 0 allowed), or null. */
export function cleanPhone(raw: string): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** Days from `today` to a follow-up day (both "yyyy-MM-dd"): negative is late, 0 is today, null when none. */
export function daysTo(day: string | null, today: string): number | null {
  if (!day) return null;
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** From enquiry to paying shop, counted by the furthest stage each enquiry reached. */
export function leadFunnel(leads: { reached: string }[]) {
  const at = (n: number) => leads.filter((l) => (ORDER[l.reached] ?? 0) >= n).length;
  const steps: [string, number][] = [
    ["Enquiries", leads.length],
    ["We reached them", at(1)],
    ["Demo given", at(2)],
    ["Price sent", at(3)],
    ["Became a shop", at(4)],
  ];
  const gaps: [string, number][] = [
    ["reaching them", steps[0][1] - steps[1][1]],
    ["giving a demo", steps[1][1] - steps[2][1]],
    ["sending a price", steps[2][1] - steps[3][1]],
    ["closing", steps[3][1] - steps[4][1]],
  ];
  const widest = [...gaps].sort((a, b) => b[1] - a[1])[0];
  return { steps, widest: widest[1] > 0 ? widest : null };
}
