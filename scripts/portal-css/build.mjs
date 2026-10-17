// Scope the design's CSS under .thabaal-portal and map its dark theme to the app's html.dark.
// Layers: bare-element rules in @layer base, every class rule in @layer components (both below
// Tailwind's utilities), so app components inside design pages keep their own sizes and colours
// while plain design markup gets the design's look. Variables stay unlayered.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.argv[4] + "/package.json");
const postcss = require("postcss");
const [, , inFile, outFile, , topFile, bottomFile, unlayeredFile] = process.argv;
const S = ".thabaal-portal";
const root = postcss.parse(fs.readFileSync(inFile, "utf8"));
root.walkAtRules("media", (at) => {
  if (/prefers-color-scheme\s*:\s*dark/.test(at.params)) at.remove();
});
const base = postcss.atRule({ name: "layer", params: "base" });
const comp = postcss.atRule({ name: "layer", params: "components" });
const vars = [];
const elementOnly = (sel) => !/[.#]/.test(sel.replace(/\[[^\]]*\]/g, "")) && !/^\[/.test(sel) && !["*", ":root", "html", "body"].includes(sel) && !sel.startsWith(":root[");
const scope = (sel) => {
  if (sel === "html" || sel === "body" || sel === ":root") return S;
  if (sel === "*") return `${S}, ${S} *`;
  if (sel.startsWith(':root[data-theme="dark"]')) return `html.dark ${S}` + sel.slice(':root[data-theme="dark"]'.length);
  if (sel.startsWith("html[")) return sel.replace(/^html(\[[^\]]+\])/, `${S}$1`);
  // Tailwind also has a "grid" class: the design's 16px gap applies only to the design's own grids.
  if (/^\.grid(\s*\{|$)/.test(sel) || sel === ".grid") return `${S} .grid:where(.g2,.g3,.g4,.split,.gx)`;
  // The app's inputs use a "field" class too: the design's label column is never an input.
  if (sel === ".field") return `${S} .field:not(input,select,textarea,button)`;
  return `${S} ${sel}`;
};
for (const node of [...root.nodes]) {
  if (node.type === "rule") {
    const original = node.selectors.map((x) => x.trim());
    const onlyVars = node.nodes.every((d) => d.type !== "decl" || d.prop.startsWith("--") || d.prop === "color-scheme");
    node.selectors = original.map(scope);
    if (onlyVars) vars.push(node.remove());
    else if (original.every(elementOnly)) base.append(node.remove());
    else comp.append(node.remove());
  } else if (node.type === "atrule" && node.name === "media") {
    node.walkRules((r) => (r.selectors = r.selectors.map((x) => x.trim()).map(scope)));
    comp.append(node.remove());
  }
}
const top = topFile ? fs.readFileSync(topFile, "utf8") : "";
const bottom = bottomFile ? fs.readFileSync(bottomFile, "utf8") : "";
fs.writeFileSync(
  outFile,
  "/* Generated from thabaal-portal.html: the portal design, scoped to .thabaal-portal. */\n" +
    vars.map((n) => n.toString()).join("\n") + "\n" +
    "@layer base {\n" + top + base.nodes.map((n) => n.toString()).join("\n") + "\n}\n" +
    "@layer components {\n" + comp.nodes.map((n) => n.toString()).join("\n") + "\n" + bottom + "\n}\n" +
    root.toString() +
    (unlayeredFile ? fs.readFileSync(unlayeredFile, "utf8") : ""),
);
