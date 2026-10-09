// A campaign's "Send to" is stored in Campaign.audienceTag, one string:
//   null / ""          all opted-in customers
//   "ghee"             customers with that tag (as before)
//   "aud:<id>"         a saved audience (src/lib/audiences.ts)
//   "tags:{...}"       several tags: customers with any (or all) of them
// Shared by the server and the campaign form, so no server-only imports here.

export const AUDIENCE_PREFIX = "aud:";
export const TAGS_PREFIX = "tags:";

export type TagMatch = "any" | "all";
export type TagPick = { match: TagMatch; tags: string[] };

/** What to store for a set of tags. One tag stays a plain tag, so older campaigns read the same. */
export function encodeTags({ match, tags }: TagPick): string {
  const list = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  return `${TAGS_PREFIX}${JSON.stringify({ match, tags: list })}`;
}

/** The tags a campaign sends to, or null when it sends to everyone or to a saved audience. */
export function decodeTags(audienceTag: string | null | undefined): TagPick | null {
  if (!audienceTag || audienceTag.startsWith(AUDIENCE_PREFIX)) return null;
  if (!audienceTag.startsWith(TAGS_PREFIX)) return { match: "any", tags: [audienceTag] };
  try {
    const v = JSON.parse(audienceTag.slice(TAGS_PREFIX.length)) as Partial<TagPick>;
    const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === "string" && t.trim() !== "") : [];
    return { match: v.match === "all" ? "all" : "any", tags };
  } catch {
    return { match: "any", tags: [] };
  }
}

/** "ghee", "ghee or gingelly-oil", "ghee and vip". */
export function describeTags({ match, tags }: TagPick, label: (tag: string) => string = (t) => t) {
  const names = tags.map(label);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${match === "all" ? "and" : "or"} ${names[names.length - 1]}`;
}
