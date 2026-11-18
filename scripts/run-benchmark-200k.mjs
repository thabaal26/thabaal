import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let pg = null;
let url = process.env.TEST_DATABASE_URL;

if (!url) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = path.resolve(".testdb");
  pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "test",
    port: 5433,
    persistent: true,
    initdbFlags: ["-E", "UTF8", "--locale=C"],
    onLog: () => {},
  });
  if (!fs.existsSync(path.join(dir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  await pg.dropDatabase("thabaal_test").catch(() => {});
  await pg.createDatabase("thabaal_test");
  url = "postgresql://postgres:test@localhost:5433/thabaal_test";
}

const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_URL_UNPOOLED: url,
  AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnop",
  CRON_SECRET: "test-cron-secret",
  META_APP_SECRET: "test-meta-app-secret",
  DATA_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  NODE_ENV: "test",
};

try {
  console.log("Applying database schema to Isolated Test Database (localhost:5433)...");
  execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env });

  console.log("Starting 200K Synthetic Benchmark...");
  const result = spawnSync(`npx tsx --conditions=react-server scripts/benchmark-200k.ts`, {
    stdio: "inherit",
    env,
    shell: true,
  });

  if (result.status !== 0) {
    console.error("Benchmark exited with error code:", result.status);
    process.exit(result.status || 1);
  }
} finally {
  if (pg) {
    console.log("Stopping Embedded Postgres...");
    await pg.stop().catch(() => {});
  }
}
