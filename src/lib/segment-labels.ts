// The engagement groups' keys, names and meanings: the one list every screen uses (Chats filters, the campaign form's
// "Who to reach", Customers, the customer page). Plain data, safe in the browser; the rule that puts a customer in a
// group lives in lib/engagement-segments.ts.
//
//   engaged – Engaged: tapped a button, replied or ordered within the business's engagementDays (default 90).
//   seen    – Seen: an offer reached them and Meta reported at least one READ; no recent tap, reply or order.
//   reached – Reached: offers were DELIVERED but Meta never reported one read (read receipts can be off); no response.
//   dormant – Dormant: their last inactiveAfterOffers (default 3) delivered offers got no response (the old Inactive
//             rule, unchanged), or the business moved them there (the "inactive" tag).
//   new     – Not reached yet: no offer has been delivered to them (sent-but-unconfirmed or failed sends don't count).
//
// Older saved campaigns and links used super / active / inactive. They still work: super = engaged, inactive = dormant,
// and active (which was Seen and Reached together) = both seen and reached, so a saved audience keeps the same people.

export const SEGMENTS = ["engaged", "seen", "reached", "dormant", "new"] as const;
export type Segment = (typeof SEGMENTS)[number];

/** The four groups shown as filters (Chats, Customers) and cards; "Not reached yet" has no chats to filter. */
export const ENGAGEMENT_GROUPS = ["engaged", "seen", "reached", "dormant"] as const;

export const SEGMENT_LABEL: Record<Segment, { en: string; ta: string; hint: string; hintTa: string }> = {
  engaged: { en: "Engaged", ta: "ஈடுபாடு உள்ளவர்கள்", hint: "Tapped a button, replied or ordered lately", hintTa: "சமீபத்தில் பட்டனை அழுத்தினார், பதில் அனுப்பினார் அல்லது ஆர்டர் செய்தார்" },
  seen: { en: "Seen", ta: "பார்த்தவர்கள்", hint: "Read your offer; no tap or reply yet", hintTa: "உங்கள் சலுகையைப் படித்தார்கள்; இன்னும் பதில் இல்லை" },
  reached: { en: "Reached", ta: "சென்றடைந்தவர்கள்", hint: "Delivered, not read (or read receipts are off)", hintTa: "சேர்ந்தது, படிக்கவில்லை (அல்லது படித்த குறி அணைக்கப்பட்டுள்ளது)" },
  dormant: { en: "Dormant", ta: "உறக்க நிலையில்", hint: "Several offers in a row with no response", hintTa: "தொடர்ந்து பல சலுகைகளுக்கு பதில் இல்லை" },
  new: { en: "Not reached yet", ta: "இன்னும் சென்றடையாதவர்கள்", hint: "No offer has been delivered to them yet", hintTa: "இன்னும் எந்தச் சலுகையும் சேரவில்லை" },
};

/** Old keys from saved campaigns and links, and what they mean now. */
const LEGACY: Record<string, readonly Segment[]> = { super: ["engaged"], active: ["seen", "reached"], inactive: ["dormant"] };

export const isSegment = (s: string): s is Segment => (SEGMENTS as readonly string[]).includes(s);

/** Valid group keys, old ones turned into today's (each once, in the usual order). */
export function cleanSegments(xs: readonly string[] | null | undefined): Segment[] {
  const want = new Set<Segment>();
  for (const x of xs ?? []) for (const s of isSegment(x) ? [x] : (LEGACY[x] ?? [])) want.add(s);
  return SEGMENTS.filter((s) => want.has(s));
}

/** One filter key from a link (?group=…): today's key, or the one an old link meant; "" when unknown or ambiguous. */
export function groupKey(x: unknown): (typeof ENGAGEMENT_GROUPS)[number] | "" {
  if (typeof x !== "string") return "";
  const s = isSegment(x) ? [x] : (LEGACY[x] ?? []);
  return s.length === 1 && (ENGAGEMENT_GROUPS as readonly string[]).includes(s[0]) ? (s[0] as (typeof ENGAGEMENT_GROUPS)[number]) : "";
}
