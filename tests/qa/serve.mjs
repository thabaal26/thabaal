// Starts a private QA copy of Thabaal on this computer: its own Postgres (port 5434, data in .qadb/), filled with QA
// data (tests/qa/seed.mjs), and the built app on http://localhost:3200 with test settings, so nothing reaches
// WhatsApp, Meta, Google Sheets or any real database. Needs a production build first (npx next build).
//   node tests/qa/serve.mjs      → runs until stopped; writes logins and ids to .git/qa-state.json
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const { default: EmbeddedPostgres } = await import("embedded-postgres");
const DIR = path.resolve(".qadb");
const PORT = 5434;
const url = `postgresql://postgres:test@localhost:${PORT}/thabaal_qa`;
if (!/@localhost:/.test(url)) throw new Error("QA database must be on localhost");

// Next.js also loads .env files when it starts, without overriding keys already set. So every key named in them is set
// here first, blank unless given a test value below: no real token, database, sheet or storage key can leak in.
const blanked = {};
for (const f of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  if (!fs.existsSync(f)) continue;
  for (const m of fs.readFileSync(f, "utf8").matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) blanked[m[1]] = "";
}

export const QA_ENV = {
  ...process.env,
  ...blanked,
  APP_TIMEZONE: "Asia/Kolkata",
  DEFAULT_COUNTRY_CODE: "91",
  META_GRAPH_VERSION: "v21.0",
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  AUTH_SECRET: "qa-auth-secret-0123456789abcdefghijklmnopqr",
  CRON_SECRET: "qa-cron-secret",
  META_APP_SECRET: "qa-meta-app-secret",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "qa-verify-token",
  DATA_ENC_KEY: Buffer.alloc(32, 9).toString("base64"),
  WHATSAPP_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "",
  GOOGLE_SHEET_WEBHOOK_URL: "",
  GOOGLE_SHEET_WEBHOOK_SECRET: "",
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
  GROQ_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
};

const pg = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "test", port: PORT, persistent: true, initdbFlags: ["-E", "UTF8", "--locale=C"], onLog: () => {} });
if (!fs.existsSync(path.join(DIR, "PG_VERSION"))) await pg.initialise();
await pg.start();
await pg.dropDatabase("thabaal_qa").catch(() => {});
await pg.createDatabase("thabaal_qa");
execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env: QA_ENV });

process.env.AUTH_SECRET = QA_ENV.AUTH_SECRET;
process.env.DATABASE_URL = url;
const { seedQa } = await import("./seed.mjs");
const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url } } });
const state = await seedQa(db);
await db.$disconnect();
fs.writeFileSync(".git/qa-state.json", JSON.stringify({ ...state, base: "http://localhost:3200", dbUrl: url, metaSecret: QA_ENV.META_APP_SECRET, cronSecret: QA_ENV.CRON_SECRET }, null, 2));
console.log("QA data ready");

const app = spawn("npx", ["next", "start", "-p", "3200"], { env: { ...QA_ENV, NODE_ENV: "production" }, stdio: "inherit", shell: true });
const stop = async () => {
  app.kill();
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
await new Promise(() => {});
