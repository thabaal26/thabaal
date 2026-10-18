// The whole QA run on any computer (Windows, macOS or Linux): optionally build, start a fresh QA app (private Postgres,
// seeded QA Test Shop, real keys blanked), run every QA script in order, then stop the QA app. Logs: .git/qa-<name>.log.
// Same steps as run-all.ps1, plus the API, accessibility, layout and performance suites.
//   node tests/qa/run-all.mjs [--build] [--skip=visual,perf] [--only=api,a11y]
// Needs PW_CORE (path to playwright-core) and, off Windows, CHROME_PATH (a Chromium or Chrome binary).
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

const flag = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1]?.split(",").filter(Boolean) ?? [];
const skip = flag("skip");
const only = flag("only");
const sh = (cmd, log) => {
  try {
    execSync(`${cmd} > ${log} 2>&1`, { stdio: "ignore", shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash" });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
};

if (process.argv.includes("--build")) {
  // Never deletes .next: the owner's `next dev` keeps its cache in .next/dev.
  const code = sh("npx next build", ".git/qa-build.log");
  console.log(code ? "BUILD FAILED (see .git/qa-build.log)" : "build ok");
  if (code) process.exit(1);
}

const serve = spawn(process.execPath, ["tests/qa/serve.mjs"], { stdio: ["ignore", fs.openSync(".git/qa-serve.log", "w"), fs.openSync(".git/qa-serve.log", "a")], detached: process.platform !== "win32" });
const stop = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${serve.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-serve.pid, "SIGTERM");
  } catch {}
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

let ready = false;
for (let i = 0; i < 120 && !ready; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  ready = await fetch("http://localhost:3200/login").then((r) => r.ok).catch(() => false);
}
if (!ready) {
  console.log("QA app did not start (see .git/qa-serve.log)");
  process.exit(1);
}
console.log("QA app ready");
// The sweep signs in through the form, so the QA logins need their password (qa-test-123).
sh("node tests/qa/qa-login.mjs", ".git/qa-login.log");

const steps = [
  ["action-guards", "node tests/qa/action-guards.mjs"],
  ["api", "node tests/qa/api.mjs"],
  ["payments", "node tests/qa/payments.mjs"],
  ["payments-ui", "node tests/qa/payments-ui.mjs"],
  ["crud", "node tests/qa/crud.mjs"],
  ["xss", "node tests/qa/xss.mjs"],
  ["crawl-desktop", "node tests/qa/crawl.mjs desktop"],
  ["crawl-phone", "node tests/qa/crawl.mjs phone"],
  ["visual", "node tests/qa/visual.mjs"],
  ["layout", "node tests/qa/layout.mjs"],
  ["sweep-phone", "node tests/qa/sweep.mjs size=390x844"],
  ["sweep", "node tests/qa/sweep.mjs"],
  ["a11y", "node tests/qa/a11y.mjs"],
  ["perf", "node tests/qa/perf.mjs"],
];
const summary = [];
for (const [name, cmd] of steps) {
  if (skip.includes(name) || (only.length && !only.includes(name))) continue;
  const t0 = Date.now();
  const code = sh(cmd, `.git/qa-${name}.log`);
  const lines = fs.readFileSync(`.git/qa-${name}.log`, "utf8").split("\n");
  const last = lines.filter((l) => /passed|page visits|screens|page checks|FAIL|Error/i.test(l)).pop() ?? lines.filter(Boolean).pop() ?? "";
  const line = `${name}: exit ${code} (${Math.round((Date.now() - t0) / 1000)}s)  ${last.trim().slice(0, 160)}`;
  summary.push({ name, code, last: last.trim() });
  console.log(line);
}
fs.writeFileSync(".git/qa-summary.json", JSON.stringify(summary, null, 1));
process.exit(summary.some((s) => s.code) ? 1 : 0);
