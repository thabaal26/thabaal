// Static check: every exported server action starts with a permission check (requireUser / requireManager /
// requireAdmin / requireOrderAccess / getScope, or a local helper that calls one). Server actions can be called by
// anyone who can send a POST, so a missing check is a security bug.   node tests/qa/action-guards.mjs
import fs from "node:fs";
import path from "node:path";

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(f.name)) files.push(p);
  }
})("src");

const GUARD = /\b(requireUser|requireManager|requireAdmin|requireOrderAccess|getScope)\s*\(/;
const PUBLIC = new Set(["login", "logout"]); // the sign-in form itself
const problems = [];
let checked = 0;
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  if (!/^\s*["']use server["']/.test(src)) continue;
  // Local helpers that do the check (e.g. ownOrder in payments.ts).
  // Each top-level function runs from its declaration to the next top-level declaration.
  const starts = [...src.matchAll(/^(?:export )?(?:async function|function|const)\s+(\w+)/gm)].map((m) => ({ name: m[1], at: m.index, exported: m[0].startsWith("export async function") }));
  const blocks = starts.map((s, i) => ({ ...s, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
  const helpers = new Set(blocks.filter((b) => !b.exported && GUARD.test(b.body)).map((b) => b.name));
  const guarded = new RegExp(`\\b(${["requireUser", "requireManager", "requireAdmin", "requireOrderAccess", "getScope", ...helpers].join("|")})\\s*\\(`);
  for (const blk of blocks.filter((b) => b.exported)) {
    checked++;
    const { name, body } = blk;
    if (PUBLIC.has(name)) continue;
    // A thin wrapper that delegates to another exported, guarded action counts too.
    const delegates = [...body.matchAll(/\breturn\s+(?:await\s+)?(\w+)\(/g)].map((x) => x[1]);
    if (!guarded.test(body) && !delegates.some((d) => new RegExp(`export async function ${d}\\b`).test(src))) problems.push(`${f.replaceAll("\\", "/")}: ${name}`);
  }
}
console.log(`${checked} server actions checked`);
if (problems.length) {
  console.log("No permission check found in:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
}
console.log("All server actions check permissions.");
