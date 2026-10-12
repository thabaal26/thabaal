// How a portal looks. The owner sets a portal-wide default (Settings → Appearance) and can override
// any part of it for one client (Clients page). Every choice is applied with data attributes on
// <html> and CSS, plus one small stylesheet for the chosen icon set, so switching needs no rebuild
// and a page only ever downloads the look it shows.
//
// Resolution order: built-in defaults < portal default (Setting.appearance) < the client's older
// icon columns (iconPack/iconLook, kept for clients set up before this) < Client.appearance.

export const ICON_PACKS = [
  { id: "hugeicons", label: "Hugeicons", hint: "Soft, rounded line icons. The default.", weights: true },
  { id: "lucide", label: "Lucide", hint: "Crisp, classic line icons.", weights: true },
  { id: "tabler", label: "Tabler", hint: "Even, friendly line icons.", weights: true },
  { id: "phosphor", label: "Phosphor", hint: "Balanced icons with a light and a bold weight.", weights: true },
  { id: "remix", label: "Remix", hint: "Neutral, slightly geometric line icons.", weights: false },
  { id: "material", label: "Material Symbols", hint: "Google's icons, as on Android.", weights: true },
] as const;

export const ICON_WEIGHTS = [
  { id: "light", label: "Light" },
  { id: "regular", label: "Regular" },
  { id: "bold", label: "Bold" },
] as const;

export const TILE_LOOKS = [
  { id: "3d", label: "3D", hint: "Raised, glossy tiles with a soft shadow." },
  { id: "2d", label: "2D", hint: "Flat tiles, no shine or shadow." },
] as const;

export const TILE_TONES = [
  { id: "color", label: "Coloured", hint: "Each tile in its own bright colour." },
  { id: "plain", label: "Plain", hint: "Quiet grey tiles; the icon carries the ink colour." },
] as const;

export const TILE_ARTS = [
  { id: "glyph", label: "Icon set", hint: "The chosen icon set, in white on the tile." },
  { id: "illustrated", label: "Illustrated", hint: "Thabaal's own detailed drawings." },
  { id: "fluent", label: "Colour icons", hint: "Full-colour Fluent icons (Microsoft, MIT)." },
  { id: "emoji", label: "3D emoji", hint: "Fluent Emoji objects with depth and shading (MIT)." },
] as const;

export const CARD_STYLES = [
  { id: "3d", label: "3D", hint: "Lit from above with a soft lift. The default." },
  { id: "flat", label: "Flat", hint: "Solid surfaces, no shadows." },
  { id: "outline", label: "Outline", hint: "Clear borders on the page colour." },
  { id: "glass", label: "Glass", hint: "Frosted, see-through panels." },
  { id: "soft", label: "Soft", hint: "Gentle pillowy shadows, no borders." },
  { id: "elevated", label: "Elevated", hint: "Floating white cards with deeper shadows." },
] as const;

export const UI_STYLES = [
  { id: "thabaal", label: "Thabaal", hint: "The standard look." },
  { id: "minimal", label: "Minimal", hint: "Tighter corners, quieter colour bands." },
  { id: "rounded", label: "Rounded", hint: "Pill buttons and big, friendly corners." },
  { id: "sharp", label: "Sharp", hint: "Square corners, crisp and businesslike." },
  { id: "material", label: "Material", hint: "Pill buttons and Android-like elevation." },
] as const;

export const CHART_LIBS = [
  { id: "echarts", label: "ECharts", hint: "Apache ECharts: every chart type, smooth animation. The default." },
  { id: "recharts", label: "Recharts", hint: "Clean SVG charts built for React." },
  { id: "chartjs", label: "Chart.js", hint: "Fast canvas charts, light on memory." },
] as const;

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
export type IconPack = Ids<typeof ICON_PACKS>;
export type IconWeight = Ids<typeof ICON_WEIGHTS>;
export type TileLook = Ids<typeof TILE_LOOKS>;
export type TileTone = Ids<typeof TILE_TONES>;
export type TileArt = Ids<typeof TILE_ARTS>;
export type CardStyle = Ids<typeof CARD_STYLES>;
export type UiStyle = Ids<typeof UI_STYLES>;
export type ChartLib = Ids<typeof CHART_LIBS>;

export type Appearance = {
  iconPack: IconPack;
  iconWeight: IconWeight;
  tileLook: TileLook;
  tileTone: TileTone;
  tileArt: TileArt;
  cardStyle: CardStyle;
  uiStyle: UiStyle;
  chartLib: ChartLib;
};
export type AppearanceKey = keyof Appearance;
/** A client's overrides: only the keys that differ from the portal default are stored. */
export type AppearanceOverrides = Partial<Appearance>;

export const OPTIONS: { [K in AppearanceKey]: readonly { id: Appearance[K]; label: string; hint?: string }[] } = {
  iconPack: ICON_PACKS,
  iconWeight: ICON_WEIGHTS,
  tileLook: TILE_LOOKS,
  tileTone: TILE_TONES,
  tileArt: TILE_ARTS,
  cardStyle: CARD_STYLES,
  uiStyle: UI_STYLES,
  chartLib: CHART_LIBS,
};

export const APPEARANCE_KEYS = Object.keys(OPTIONS) as AppearanceKey[];

export const BUILT_IN: Appearance = {
  iconPack: "hugeicons",
  iconWeight: "regular",
  tileLook: "3d",
  tileTone: "color",
  tileArt: "glyph",
  cardStyle: "3d",
  uiStyle: "thabaal",
  chartLib: "echarts",
};

const valid = <K extends AppearanceKey>(key: K, v: unknown): v is Appearance[K] => OPTIONS[key].some((o) => o.id === v);

/** Keeps only known keys with known values (stored JSON is never trusted as-is). */
export function cleanOverrides(raw: unknown): AppearanceOverrides {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const key of APPEARANCE_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (valid(key, v)) out[key] = v as string;
  }
  return out as AppearanceOverrides;
}

/** The portal default: built-in values with the owner's saved choices on top. */
export function portalDefault(settingAppearance: unknown): Appearance {
  return { ...BUILT_IN, ...cleanOverrides(settingAppearance) };
}

/** A client's older icon columns, read as overrides only where they differ from their old defaults. */
export function legacyOverrides(client: { iconPack?: string | null; iconLook?: string | null } | null | undefined): AppearanceOverrides {
  if (!client) return {};
  const out: AppearanceOverrides = {};
  const pack = client.iconPack === "classic" ? "lucide" : client.iconPack;
  if (pack === "lucide") {
    out.iconPack = "lucide";
    // Lucide with 3D tiles always showed the illustrated drawings.
    if (client.iconLook !== "2d") out.tileArt = "illustrated";
  }
  if (client.iconLook === "2d") out.tileLook = "2d";
  return out;
}

/** What a client's portal shows. */
export function resolveAppearance(
  settingAppearance: unknown,
  client?: { iconPack?: string | null; iconLook?: string | null; appearance?: unknown } | null,
): Appearance {
  return { ...portalDefault(settingAppearance), ...legacyOverrides(client), ...cleanOverrides(client?.appearance) };
}

/** Packs without weights draw every weight the same; their stylesheet is the regular one. */
export function iconSetId(a: Pick<Appearance, "iconPack" | "iconWeight">): string {
  const pack = ICON_PACKS.find((p) => p.id === a.iconPack);
  return `${a.iconPack}-${pack?.weights ? a.iconWeight : "regular"}`;
}

/** The dataset that carries the look (on <html>, the dashboard shell and preview boxes). */
export function appearanceDataset(a: Appearance) {
  return { iconset: iconSetId(a), look: a.tileLook, tone: a.tileTone, art: a.tileArt, card: a.cardStyle, ui: a.uiStyle, chart: a.chartLib };
}
export type AppearanceDataset = ReturnType<typeof appearanceDataset>;

/** The same as data-* attributes, to spread on an element. */
export function appearanceAttrs(a: Appearance): Record<`data-${string}`, string> {
  return Object.fromEntries(Object.entries(appearanceDataset(a)).map(([k, v]) => [`data-${k}`, v]));
}

/** The inline script that sets the look on <html> before anything paints. */
export function appearanceScript(data: AppearanceDataset) {
  return `Object.assign(document.documentElement.dataset,${JSON.stringify(data).replace(/</g, "\\u003c")})`;
}
