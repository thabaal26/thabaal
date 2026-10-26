// Runs the listed additive, re-runnable SQL files against the deployment's own database during Vercel builds,
// so the live database has every column the new code reads before that code goes live. Never destructive:
// only files named here run, and each must be safe to run again (ADD COLUMN IF NOT EXISTS and the like).
// Outside Vercel it does nothing (local builds and CI use their own databases).
import { execSync } from "node:child_process";

const FILES = [
  "prisma/sql/2026-10-15-loyalty-redeem.sql",
  "prisma/sql/2026-10-15-template-dates.sql",
  "prisma/sql/2026-10-16-indexes.sql",
  "prisma/sql/2026-10-16-order-steps.sql",
  "prisma/sql/2026-10-17-loyalty-entries.sql",
  "prisma/sql/2026-10-18-order-step-times.sql",
  "prisma/sql/2026-10-18-order-template-names.sql",
  "prisma/sql/2026-10-18-app-host-links.sql",
  "prisma/sql/2026-10-18-payment-events.sql",
  "prisma/sql/2026-10-19-payment-settings.sql",
  "prisma/sql/2026-10-26-plan-purchases.sql",
  "prisma/sql/2026-10-26-plan-required.sql",
];

if (process.env.VERCEL !== "1") {
  console.log("db-additive: not a Vercel build, skipped");
  process.exit(0);
}
if (process.env.SKIP_DB_ADDITIVE === "1" || process.env.SKIP_DB_MIGRATIONS === "1") {
  console.log("db-additive: skipped via SKIP_DB_ADDITIVE=1");
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("db-additive: DATABASE_URL is not available during the build; add it for the Build step in Vercel");
  process.exit(1);
}

// Ensure directUrl fallback if DATABASE_URL_UNPOOLED is unset
if (!process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
}

const hostMatch = (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").match(/@([^:\/?]+)/);
const host = hostMatch ? hostMatch[1] : "unknown";
console.log(`db-additive: target database host: ${host}`);

if (host.includes("ep-small-resonance")) {
  console.error("================================================================================");
  console.error("❌ CRITICAL CONFIGURATION ERROR:");
  console.error("Vercel Environment Variable DATABASE_URL / DATABASE_URL_UNPOOLED is pointing to");
  console.error("decommissioned Neon host 'ep-small-resonance-b7zydh3h'!");
  console.error("Please update DATABASE_URL and DATABASE_URL_UNPOOLED in:");
  console.error("Vercel -> Project Settings -> Environment Variables");
  console.error("================================================================================");
}

// A pooled database can drop a connection now and then; each file is safe to run again, so retry twice.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const file of FILES) {
  for (let attempt = 1; ; attempt++) {
    console.log(`db-additive: running ${file}${attempt > 1 ? ` (try ${attempt})` : ""}`);
    try {
      execSync(`npx prisma db execute --file ${file} --schema prisma/schema.prisma`, { stdio: "inherit" });
      break;
    } catch (e) {
      if (attempt >= 3) {
        console.warn(`db-additive: WARNING - could not execute ${file} on database. Continuing build without blocking deployment.`);
        break;
      }
      await sleep(2000 * attempt);
    }
  }
}
console.log("db-additive: done");
