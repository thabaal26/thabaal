import type { CSSProperties } from "react";

// Turns a client's two brand colours into the portal's colour tokens. Text contrast is
// enforced here (WCAG AA, 4.5:1), so any colours an admin picks stay readable.

type RGB = [number, number, number];

export const HEX = /^#[0-9a-f]{6}$/i;

const parse = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function luminance([r, g, b]: RGB) {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Moves a colour toward `target` until it reaches the contrast ratio against `against`. */
function until(c: RGB, target: RGB, against: RGB, ratio: number) {
  let out = c;
  for (let t = 0; t <= 1 && contrast(out, against) < ratio; t += 0.04) out = mix(c, target, t);
  return out;
}

export type Brand = {
  brandPrimary: string | null;
  brandAccent: string | null;
};

/**
 * CSS custom properties that re-theme everything inside the element they're set on.
 * Returns undefined when the client has no brand colours, keeping the default theme.
 */
export function themeStyle(b: Brand | null | undefined): CSSProperties | undefined {
  if (!b?.brandPrimary || !HEX.test(b.brandPrimary)) return undefined;
  const primary = parse(b.brandPrimary);
  const accent = b.brandAccent && HEX.test(b.brandAccent) ? parse(b.brandAccent) : primary;

  // Buttons carry white text, so the brand colour darkens until white reads on it.
  const brand = until(primary, BLACK, WHITE, 4.6);
  const deep = until(mix(brand, BLACK, 0.25), BLACK, WHITE, 7);
  const night = mix(brand, BLACK, 0.86);
  // The accent glows on the dark sidebar, so it lightens until it reads there.
  const glow = until(accent, WHITE, night, 6);

  return {
    "--color-brand": toHex(brand),
    "--color-brand-deep": toHex(deep),
    "--color-brand-soft": toHex(mix(primary, WHITE, 0.84)),
    "--color-night": toHex(night),
    "--color-glow": toHex(glow),
    "--color-canvas": toHex(mix(primary, [247, 247, 244], 0.95)),
  } as CSSProperties;
}

/**
 * The same variables as a :root rule, so sheets, toasts and dialogs rendered outside the
 * dashboard wrapper (portals into <body>) wear the client's colours too.
 */
export function themeCss(b: Brand | null | undefined) {
  const s = themeStyle(b) as Record<string, string> | undefined;
  return s ? `:root{${Object.entries(s).map(([k, v]) => `${k}:${v}`).join(";")}}` : "";
}

/** The sidebar colour, for the browser's theme-color. */
export function nightColor(b: Brand | null | undefined) {
  const s = themeStyle(b) as Record<string, string> | undefined;
  return s?.["--color-night"] ?? "#0c1714";
}
