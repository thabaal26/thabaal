// Runs the automatic checks against a throw-away test database, never the live one.
//   node tests/run.mjs            → unit checks (orders, sending guard, sheets, encryption, Meta balance…)
//   node tests/run.mjs --http     → also starts the built app on port 3200 and checks no client sees another's data
// Locally it starts its own Postgres (embedded, port 5433). In CI, TEST_DATABASE_URL points at the workflow's postgres.
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const http = process.argv.includes("--http");
let pg = null;
let url = process.env.TEST_DATABASE_URL;

if (!url) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = path.resolve(".testdb");
  pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "test", port: 5433, persistent: true, initdbFlags: ["-E", "UTF8", "--locale=C"], onLog: () => {} });
  if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  await pg.dropDatabase("thabaal_test").catch(() => {});
  await pg.createDatabase("thabaal_test");
  url = "postgresql://postgres:test@localhost:5433/thabaal_test";
}
// A last guard: these checks write freely, so they only ever run on a local or CI database.
if (!/@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url)) {
  console.error("Refusing to run tests against a database that isn't local:", url.replace(/:[^:@]*@/, ":***@"));
  process.exit(1);
}

// Everything the app reads from the environment, set to test values so nothing reaches real services.
const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnop",
  CRON_SECRET: "test-cron-secret",
  META_APP_SECRET: "test-meta-app-secret",
  DATA_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  WHATSAPP_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  WHATSAPP_BUSINESS_ACCOUNT_ID: "",
  GOOGLE_SHEET_WEBHOOK_URL: "https://script.google.com/macros/s/AKfycbTESTONLYtestonlytestonly/exec",
  GOOGLE_SHEET_WEBHOOK_SECRET: "",
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
  GROQ_API_KEY: "",
  BLOB_READ_WRITE_TOKEN: "",
  NEW_BLOB_READ_WRITE_TOKEN: "",
  RESEND_API_KEY: "",
  NODE_ENV: "test",
};

let failed = false;
const run = (cmd) => {
  try {
    execSync(cmd, { stdio: "inherit", env });
  } catch {
    failed = true;
  }
};

try {
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env });
  run("npx tsx --conditions=react-server --test tests/unit/*.test.ts");
  if (http) {
    // Its own process group off Windows, so stopping it also stops the Next.js server the shell started.
    const app = spawn("npx", ["next", "start", "-p", "3200"], { env: { ...env, NODE_ENV: "production" }, stdio: "inherit", shell: true, detached: process.platform !== "win32" });
    try {
      for (let i = 0; i < 60; i++) {
        try {
          if ((await fetch("http://localhost:3200/login")).ok) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 1000));
      }
      run("node tests/http/isolation.mjs");
      if (process.argv.includes("--rehearsal")) run("node tests/http/rehearsal.mjs");
    } finally {
      if (process.platform !== "win32") {
        try {
          process.kill(-app.pid, "SIGTERM");
        } catch {}
      } else app.kill();
      if (process.platform === "win32") {
        try {
          execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :3200 ^| findstr LISTENING') do taskkill /F /PID %a`, { stdio: "ignore", shell: "cmd.exe" });
        } catch {}
      }
    }
  }
} finally {
  if (pg) await pg.stop().catch(() => {});
}
console.log(failed ? "\nSome checks FAILED." : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
