#!/usr/bin/env node
/**
 * npm run test:e2e — run the Playwright suite ONLY when its two real
 * dependencies exist: a Postgres DATABASE_URL and a downloaded Chromium.
 * Otherwise print the exact blocker as SKIPPED and exit 0 for the chain —
 * the sandbox deliberately never fakes a green e2e. (verify.ts treats a
 * line containing "SKIPPED" as non-green evidence in the final summary.)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const db = process.env.DATABASE_URL ?? "";
const dbOk = /^postgres(ql)?:\/\//.test(db);
const browserDirs = ["chromium-*", "chromium_headless_shell-*"];
const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
const browserOk = fs.existsSync(cache) && browserDirs.some((glob) =>
  fs.readdirSync(cache).some((d) => d.startsWith(glob.slice(0, -1)))
);

if (!dbOk || !browserOk) {
  const why = [
    !dbOk ? "DATABASE_URL is not a postgres URL (needs a real DB: Neon works)" : null,
    !browserOk ? `Playwright Chromium not installed (offline env cannot fetch ${"cdn.playwright.dev"})` : null,
  ].filter(Boolean);
  console.log(`e2e: SKIPPED — ${why.join("; ")}`);
  console.log("e2e: rerun `npm run test:e2e` where a DB and browser exist; unit suites cover the sandbox side.");
  process.exit(0);
}
// Extra args (spec file paths etc.) pass through: npm run test:e2e runs the
// flows suite, npm run verify:homepage runs e2e/homepage.spec.ts alone.
const r = spawnSync(
  "node",
  ["node_modules/@playwright/test/cli.js", "test", "--reporter=list", ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env } }
);
process.exit(r.status ?? 1);
