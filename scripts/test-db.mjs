// A private Postgres for tests, on this computer only (port 5433, data in .testdb/). Never the live database.
//   node scripts/test-db.mjs start   → starts it (creating it the first time) and loads the schema
//   node scripts/test-db.mjs reset   → empties it and loads the schema again
//   node scripts/test-db.mjs stop
// Prints the DATABASE_URL to use. In CI the database comes from the workflow's postgres service instead.
import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve(".testdb");
const PORT = 5433;
export const TEST_DB_URL = `postgresql://postgres:test@localhost:${PORT}/thabaal_test`;
const cmd = process.argv[2] ?? "start";

const pg = new EmbeddedPostgres({ databaseDir: DIR, user: "postgres", password: "test", port: PORT, persistent: true, onLog: () => {} });

function pushSchema() {
  // Only ever against localhost: refuse anything else, so a typo can't touch the live database.
  if (!/@localhost:/.test(TEST_DB_URL)) throw new Error("Test database must be on localhost");
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env: { ...process.env, DATABASE_URL: TEST_DB_URL, DATABASE_URL_UNPOOLED: TEST_DB_URL } });
}

if (cmd === "stop") {
  await pg.stop().catch(() => {});
  console.log("Test database stopped.");
} else {
  const fresh = !fs.existsSync(path.join(DIR, "PG_VERSION"));
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh || cmd === "reset") {
    await pg.dropDatabase("thabaal_test").catch(() => {});
    await pg.createDatabase("thabaal_test");
  }
  pushSchema();
  console.log(`Test database ready: ${TEST_DB_URL}`);
  // Keep running in the foreground so the database stays up; Ctrl+C (or "stop") ends it.
  if (process.argv.includes("--hold")) await new Promise(() => {});
  else await pg.stop();
}
