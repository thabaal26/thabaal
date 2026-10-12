// Builds the portal's icon stylesheets from scripts/icons/map.txt. Run: node scripts/icons/build.mjs
//
// Every icon is drawn by CSS (a mask over currentColor), so a page's JavaScript carries no icon
// drawings at all. Each icon set × weight becomes one small cached stylesheet that defines the
// --pi-<id> variables (public/icons/sets/<set>-<weight>.<hash>.css); the dashboard links only the
// one a portal uses. Tile artwork (illustrated drawings, colour icons, 3D emoji) becomes one SVG
// file per tile, fetched only when that artwork is chosen.
//
// Sources (all free for commercial use): Hugeicons free set (MIT), Lucide (ISC), Tabler (MIT),
// Phosphor (MIT), Remix Icon (Apache 2.0), Material Symbols (Apache 2.0), Fluent UI colour icons
// and Fluent Emoji (MIT), via their npm packages and the @iconify-json collections.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(root, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const huge = require("@hugeicons/core-free-icons");
const { HugeiconsIcon } = require("@hugeicons/react");
const lucide = require("lucide-react");
const json = (set) => JSON.parse(readFileSync(require.resolve(`@iconify-json/${set}/icons.json`), "utf8"));
const sets = Object.fromEntries(["tabler", "ph", "ri", "material-symbols", "material-symbols-light", "fluent-color", "fluent-emoji"].map((s) => [s, json(s)]));

/** An Iconify icon's SVG body and viewBox (follows aliases). */
function iconify(set, name) {
  const j = sets[set];
  let n = name;
  let guard = 0;
  while (!j.icons[n] && j.aliases?.[n] && guard++ < 5) n = j.aliases[n].parent;
  const ic = j.icons[n];
  if (!ic) return null;
  const w = ic.width ?? j.width ?? 16;
  const h = ic.height ?? j.height ?? 16;
  return { body: ic.body, viewBox: `${ic.left ?? 0} ${ic.top ?? 0} ${w} ${h}` };
}
const svgOf = ({ body, viewBox }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`;

const rows = readFileSync(join(root, "scripts/icons/map.txt"), "utf8")
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => {
    const [id, exp, hugeName, lucideName, tabler, ph, ri, ms] = l.split("|").map((s) => s.trim());
    return { id, exp, hugeName, lucideName, tabler, ph, ri, ms, tile: id.startsWith("t-") };
  });

const WEIGHTS = ["light", "regular", "bold"];
/** Stroke widths for the stroke-drawn sets: [line icons, tile glyphs]. */
const STROKE = {
  hugeicons: { light: [1.25, 1.5], regular: [1.75, 2], bold: [2.25, 2.5] },
  lucide: { light: [1.5, 1.6], regular: [2, 2.1], bold: [2.5, 2.6] },
  tabler: { light: [1.5, 1.6], regular: [2, 2.1], bold: [2.5, 2.6] },
};

/** A map cell can list fallbacks: "auto-awesome,stars-2" uses the first the set has. */
const alt = (cell) => cell.split(",").map((s) => s.trim());

const draw = {
  hugeicons(r, weight) {
    const icon = huge[r.hugeName];
    if (!icon) throw new Error(`Hugeicons has no ${r.hugeName}`);
    return renderToStaticMarkup(React.createElement(HugeiconsIcon, { icon, size: 24, color: "#000", strokeWidth: STROKE.hugeicons[weight][r.tile ? 1 : 0] }));
  },
  lucide(r, weight) {
    const C = lucide[r.lucideName];
    if (!C) throw new Error(`Lucide has no ${r.lucideName}`);
    return renderToStaticMarkup(React.createElement(C, { size: 24, color: "#000", strokeWidth: STROKE.lucide[weight][r.tile ? 1 : 0] }));
  },
  tabler(r, weight) {
    const ic = alt(r.tabler).map((n) => iconify("tabler", n)).find(Boolean);
    if (!ic) throw new Error(`Tabler has no ${r.tabler}`);
    return svgOf({ ...ic, body: ic.body.replace(/stroke-width="[\d.]+"/g, `stroke-width="${STROKE.tabler[weight][r.tile ? 1 : 0]}"`) });
  },
  phosphor(r, weight) {
    const ic = alt(r.ph).flatMap((n) => [weight === "regular" ? n : `${n}-${weight}`, n]).map((n) => iconify("ph", n)).find(Boolean);
    if (!ic) throw new Error(`Phosphor has no ${r.ph}`);
    return svgOf(ic);
  },
  remix(r) {
    const ic = alt(r.ri).flatMap((n) => [`${n}-line`, n]).map((n) => iconify("ri", n)).find(Boolean);
    if (!ic) throw new Error(`Remix has no ${r.ri}`);
    return svgOf(ic);
  },
  material(r, weight) {
    const set = weight === "light" ? "material-symbols-light" : "material-symbols";
    // Outlined is Material's standard style; bold has no free SVGs, so it draws the filled glyphs.
    const names = alt(r.ms).flatMap((n) => (weight === "bold" ? [n, `${n}-outline`] : [`${n}-outline`, n]));
    const ic = names.map((n) => iconify(set, n)).find(Boolean);
    if (!ic) throw new Error(`Material Symbols has no ${r.ms}`);
    return svgOf(ic);
  },
};
const PACKS = { hugeicons: WEIGHTS, lucide: WEIGHTS, tabler: WEIGHTS, phosphor: WEIGHTS, remix: ["regular"], material: WEIGHTS };

/** An SVG as a CSS url(), percent-encoding only what must be. */
function dataUri(svg) {
  const s = svg
    .replace(/<svg([^>]*)>/, (m, a) => (a.includes("xmlns=") ? m : `<svg xmlns="http://www.w3.org/2000/svg"${a}>`))
    .replace(/ (class|aria-hidden|focusable|width|height)="[^"]*"/g, (m, a, off, str) => (str.lastIndexOf("<svg", off) === 0 && str.indexOf(">") > off ? "" : m))
    .replace(/ color="[^"]*"/g, "")
    .replace(/><\/(path|circle|rect|line|polyline|polygon|ellipse)>/g, "/>")
    // Two decimals is a hundredth of a pixel at 24px: invisible, and a third smaller for detailed sets.
    .replace(/(\d*\.\d\d)\d+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .replace(/[\r\n%#<>{}]/g, (c) => encodeURIComponent(c));
  return `url("data:image/svg+xml,${s}")`;
}

const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 10);

// ── Icon set stylesheets ──
const setsDir = join(root, "public/icons/sets");
mkdirSync(setsDir, { recursive: true });
for (const f of readdirSync(setsDir)) {
  try {
    rmSync(join(setsDir, f));
  } catch {
    /* removed by the caller where this machine can't delete */
  }
}
const hrefs = {};
for (const [pack, weights] of Object.entries(PACKS)) {
  for (const weight of weights) {
    const id = `${pack}-${weight}`;
    const vars = rows.map((r) => `--pi-${r.id}:${dataUri(draw[pack](r, weight))}`).join(";");
    const css = `/* ${pack} icons, ${weight}. Generated by scripts/icons/build.mjs. */\n[data-iconset="${id}"]{${vars}}\n`;
    const file = `${id}.${hash(css)}.css`;
    writeFileSync(join(setsDir, file), css);
    hrefs[id] = `/icons/sets/${file}`;
  }
}

// ── Tile artwork ──
const TILE_ART = {
  // tile id: [illustrated drawing, Fluent colour icon, Fluent Emoji]
  "t-dashboard": ["Dashboard3D", "apps-24", "desktop-computer"],
  "t-bell": ["Bell3D", "alert-24", "bell"],
  "t-shopping-bag": ["ShoppingBag3D", "receipt-24", "shopping-bags"],
  "t-store": ["Store3D", "building-store-24", "convenience-store"],
  "t-inbox": ["Inbox3D", "mail-multiple-24", "inbox-tray"],
  "t-phone": ["Phone3D", "phone-24", "telephone-receiver"],
  "t-calendar": ["Calendar3D", "calendar-24", "spiral-calendar"],
  "t-template": ["Template3D", "document-edit-24", "memo"],
  "t-users": ["Users3D", "people-24", "busts-in-silhouette"],
  "t-messages": ["Messages3D", "chat-multiple-24", "speech-balloon"],
  "t-settings": ["Settings3D", "settings-24", "gear"],
  "t-building": ["Building3D", "building-24", "office-building"],
  "t-rupee": ["Rupee3D", "coin-multiple-24", "money-bag"],
  "t-send": ["Send3D", "send-24", "envelope-with-arrow"],
  "t-eye": ["Eye3D", "content-view-24", "eye"],
  "t-trophy": ["Trophy3D", "trophy-24", "trophy"],
  "t-gauge": ["Gauge3D", "gauge-24", "stopwatch"],
  "t-alert": ["Alert3D", "warning-24", "warning"],
  "t-sparkles": ["Sparkles3D", "lightbulb-filament-24", "sparkles"],
  "t-wallet": ["Wallet3D", "savings-24", "purse"],
  "t-target": ["Target3D", "flag-24", "bullseye"],
  "t-clock": ["Clock3D", "clock-24", "alarm-clock"],
  "t-chart-bar": ["ChartBar3D", "data-bar-vertical-ascending-24", "bar-chart"],
  "t-map-pin": ["MapPin3D", "pin-24", "round-pushpin"],
};

// The illustrated drawings are React components; compile that one file to run it here.
const ts = require("typescript");
const classicSrc = readFileSync(join(root, "scripts/icons/illustrated.tsx"), "utf8").replace(
  /import \{ cn \} from "@\/lib\/cn";/,
  "const cn = (...a) => a.filter(Boolean).join(' ');",
);
const classicJs = ts.transpileModule(classicSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
const classic = {};
new Function("exports", "require", classicJs)(classic, require);

const artCss = [];
const artDirs = { illustrated: {}, fluent: {}, emoji: {} };
for (const [art] of Object.entries(artDirs)) mkdirSync(join(root, "public/icons/art", art), { recursive: true });
for (const [tile, [drawing, fluent, emoji]] of Object.entries(TILE_ART)) {
  const name = tile.slice(2);
  const C = classic[drawing];
  if (!C) throw new Error(`No illustrated drawing ${drawing}`);
  // Tiles are white-on-colour, so the drawings' currentColor is white.
  const ill = renderToStaticMarkup(React.createElement(C, { width: 24, height: 24 }))
    .replace(/currentColor/g, "#ffffff")
    .replace(/ class="[^"]*"/, "")
    .replace(/ aria-hidden="true"/, "")
    .replace(/^<svg(?![^>]*xmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"');
  const fl = iconify("fluent-color", fluent);
  const em = iconify("fluent-emoji", emoji);
  if (!fl) throw new Error(`Fluent colour has no ${fluent}`);
  if (!em) throw new Error(`Fluent Emoji has no ${emoji}`);
  for (const [art, svg] of [["illustrated", ill], ["fluent", svgOf(fl)], ["emoji", svgOf(em)]]) {
    const file = `${name}.${hash(svg).slice(0, 8)}.svg`;
    writeFileSync(join(root, "public/icons/art", art, file), svg);
    artDirs[art][tile] = `/icons/art/${art}/${file}`;
  }
}
for (const [art, files] of Object.entries(artDirs)) {
  artCss.push(`[data-art="${art}"]{${Object.entries(files).map(([t, u]) => `--ta-${t.slice(2)}:url("${u}")`).join(";")}}`);
}

// ── Global rules: which variable each icon class reads ──
const cls = rows.map((r) => `.pi-${r.id}{--pi:var(--pi-${r.id})${r.tile ? `;--art:var(--ta-${r.id.slice(2)})` : ""}}`).join("\n");
writeFileSync(
  join(root, "src/app/icons.generated.css"),
  `/* Generated by scripts/icons/build.mjs; do not edit. Which variable each icon reads, and the tile artwork files. */\n${cls}\n${artCss.join("\n")}\n`,
);
writeFileSync(
  join(root, "src/lib/icon-sets.generated.ts"),
  `// Generated by scripts/icons/build.mjs; do not edit.\n/** Each icon set's stylesheet (set id: "<pack>-<weight>"). */\nexport const ICON_SET_HREF: Record<string, string> = ${JSON.stringify(hrefs, null, 2)};\n`,
);
console.log(`${rows.length} icons; ${Object.keys(hrefs).length} set stylesheets; ${Object.keys(TILE_ART).length * 3} tile artworks`);
