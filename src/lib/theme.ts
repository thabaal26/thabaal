import type { CSSProperties } from "react";

// Turns a client's brand colours into the portal's highlight tokens. Text contrast is
// enforced here (WCAG AA, 4.5:1), so any colours an admin picks stay readable.

type RGB = [number, number, number];

export const HEX = /^#[0-9a-f]{6}$/i;

const parse = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const toHex = (c: RGB) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => v + (b[i] - v) * t) as RGB;

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
/** --color-muted in globals.css: secondary text that sits on the canvas. */
const MUTED: RGB = [0x5f, 0x6b, 0x67];

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

/** The sidebar and phone header colour (--color-night in globals.css). */
const NIGHT: RGB = [0x17, 0x1b, 0x24];

/**
 * CSS custom properties that carry a client's brand inside the element they're set on.
 * Surfaces, text and primary actions stay on the portal's neutral design system (a tinted
 * page background or brand-coloured buttons made yellow and olive brands hard to read), so a
 * client's colour only re-tints the highlights: the sidebar's active marker and accents.
 * Returns undefined when the client has no brand colours, keeping the default brand yellow.
 */
export function themeStyle(b: Brand | null | undefined): CSSProperties | undefined {
  const hex = b?.brandAccent && HEX.test(b.brandAccent) ? b.brandAccent : b?.brandPrimary && HEX.test(b.brandPrimary) ? b.brandPrimary : null;
  if (!hex) return undefined;
  // The accent glows on the dark sidebar, so it lightens until it reads there.
  const glow = until(parse(hex), WHITE, NIGHT, 6);
  // Light-surface marks (fills, dots) use the colour itself; its tint stays pale enough for ink text.
  const gold = parse(hex);
  const soft = until(mix(gold, WHITE, 0.86), WHITE, MUTED, 4.5);
  const deep = until(mix(gold, BLACK, 0.45), BLACK, soft, 4.5);
  return {
    "--color-glow": toHex(glow),
    "--color-gold": toHex(gold),
    "--color-gold-soft": toHex(soft),
    "--color-gold-deep": toHex(deep),
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

/** The sidebar colour, for the browser's theme-color. The same for every client. */
export function nightColor() {
  return toHex(NIGHT);
}
