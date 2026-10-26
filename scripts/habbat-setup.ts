/**
 * One business's set-up in one go: its own customer list (from a CSV), a Growth plan period and its logo.
 * Reuses the app's own phone clean-up and plan-period logic, so the result is the same as doing it in the portal.
 *
 *   Rehearsal (nothing written):  npx tsx scripts/habbat-setup.ts --client Habbat --csv private-data/habbat-contacts.csv
 *   Apply to a local test DB:     ... --apply
 *   Apply to the live DB:         npx tsx --env-file=.env scripts/habbat-setup.ts --client Habbat --csv ... --apply --live
 *
 * Prints counts only, never phone numbers or names. Safe to run twice: existing customers are left alone.
 */
import fs from "node:fs";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "../src/lib/db";
import { normalizePhone } from "../src/lib/phone";
import { APP_TZ } from "../src/lib/format";
import { recordExistingPeriod } from "../src/lib/subscription";

function arg(name: string, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const clientName = arg("client");
const csvPath = arg("csv");
const plan = arg("plan", "growth");
const cycle = arg("cycle", "m");
const tag = arg("tag", "habbat-guests");
const logo = arg("logo", "/brands/habbat/mark.png");
const source = arg("source", "Guest contact list shared by the business (Aug-Oct 2026), imported by Thabaal");
const startDate = arg("start", formatInTimeZone(new Date(), APP_TZ, "yyyy-MM-dd"));
const apply = flag("apply");
const live = flag("live");

function splitCsv(line: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

async function main() {
  if (!clientName || !csvPath) throw new Error("Usage: --client <business name> --csv <file> [--apply] [--live]");

  const dbUrl = process.env.NEW_DATABASE_DATABASE_URL || process.env.NEW_DATABASE_POSTGRES_PRISMA_URL || process.env.NEW_DATABASE_POSTGRES_URL || process.env.DATABASE_URL || "";
  let host = "(unknown)";
  try { host = new URL(dbUrl).hostname; } catch { /* keep unknown */ }
  const isLocal = host === "localhost" || host === "127.0.0.1";
  console.log(`Database host: ${host} (${isLocal ? "local test database" : "REMOTE"})`);
  console.log(apply ? "Mode: APPLY" : "Mode: rehearsal only, nothing will be written");
  if (apply && !isLocal && !live) throw new Error("This is not a local database. Add --live if you really mean to change it.");
  if (live && isLocal) console.log("(--live given, but this is a local database)");

  const matches = await db.client.findMany({ where: { name: { equals: clientName, mode: "insensitive" } }, select: { id: true, name: true, logoUrl: true } });
  if (matches.length !== 1) throw new Error(`Expected exactly one business named "${clientName}", found ${matches.length}.`);
  const client = matches[0];
  console.log(`Business: ${client.name}`);

  // ---- Contacts
  const lines = fs.readFileSync(csvPath, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const pi = head.indexOf("phone"), ni = head.indexOf("name"), ai = head.indexOf("address");
  if (pi < 0) throw new Error("The CSV needs a 'phone' column.");
  const rows = new Map<string, { name: string; address: string }>();
  let invalid = 0, noName = 0;
  for (const line of lines.slice(1)) {
    const c = splitCsv(line);
    const phone = normalizePhone(c[pi] ?? "");
    if (!phone) { invalid++; continue; }
    const name = (ni >= 0 && c[ni]) || "";
    if (!name) noName++;
    if (!rows.has(phone)) rows.set(phone, { name: name || "Guest", address: (ai >= 0 && c[ai]) || "" });
  }
  const existing = await db.customer.findMany({ where: { clientId: client.id, phone: { in: [...rows.keys()] } }, select: { phone: true } });
  const known = new Set(existing.map((e) => e.phone));
  const fresh = [...rows].filter(([p]) => !known.has(p));
  const before = await db.customer.count({ where: { clientId: client.id } });
  console.log(`Contacts in file: ${rows.size} unique valid numbers (${invalid} rows skipped as invalid, ${noName} without a name -> "Guest").`);
  console.log(`  already ${client.name}'s customers: ${known.size}; to add: ${fresh.length}; ${client.name} has ${before} customers now.`);
  if (apply && fresh.length) {
    const optInAt = new Date();
    for (let i = 0; i < fresh.length; i += 500) {
      await db.customer.createMany({
        data: fresh.slice(i, i + 500).map(([phone, r]) => ({
          clientId: client.id, phone, name: r.name, tags: [tag], optInSource: source, optInAt,
          ...(r.address && { locationRaw: r.address }),
        })),
        skipDuplicates: true,
      });
    }
    console.log(`  added. ${client.name} now has ${await db.customer.count({ where: { clientId: client.id } })} customers.`);
  }

  // ---- Logo (only if none is set)
  if (client.logoUrl) console.log(`Logo: already set (${client.logoUrl}), left as is.`);
  else {
    console.log(`Logo: ${apply ? "setting" : "would set"} ${logo}`);
    if (apply) await db.client.update({ where: { id: client.id }, data: { logoUrl: logo } });
  }

  // ---- Plan
  const periods = await db.planPurchase.findMany({ where: { clientId: client.id, status: "VERIFIED" }, select: { plan: true, cycle: true, startsAt: true, endsAt: true } });
  const now = new Date();
  const active = periods.find((p) => p.startsAt && p.endsAt && p.startsAt <= now && now < p.endsAt);
  if (active) console.log(`Plan: already on ${active.plan} until ${formatInTimeZone(active.endsAt!, APP_TZ, "d MMM yyyy")}, nothing recorded.`);
  else if (!apply) console.log(`Plan: would record ${plan} (${cycle}) from ${startDate}.`);
  else {
    const r = await recordExistingPeriod(
      { isAdmin: true, clientId: client.id, canManage: true, name: "Thabaal" },
      { clientId: client.id, plan, cycle, startDate, note: "Plan set by Thabaal when the business was onboarded" },
    );
    console.log(`Plan: ${r.ok ? r.message : `NOT recorded - ${r.message}`}`);
  }
}

main()
  .catch((e) => { console.error("Stopped:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
