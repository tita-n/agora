import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end verification against a REAL stack: it runs the migrations,
 * the dev seed, and a real `next dev` (both origins: localhost:3100 app +
 * *.sites.localhost:3100 tenants — Chromium resolves *.localhost natively).
 * The scripts/e2e-run.mjs wrapper only invokes Playwright when
 * DATABASE_URL (Neon/postgres) and a downloaded browser both exist;
 * otherwise the whole suite reports SKIPPED — never falsely green.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      "npx prisma migrate deploy && npm run db:seed && PORT=3100 npx next dev -p 3100",
    url: "http://localhost:3100/login",
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "development",
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      APP_HOST: "localhost:3100",
      SITES_DOMAIN: "sites.localhost:3100",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "e2e-secret-0123456789abcdef-0123456789abcdef",
      NEXTAUTH_URL: "http://localhost:3100",
      PAYMENT_PROVIDER: "manual",
      MANUAL_BANK_NAME: "E2E Bank",
      MANUAL_BANK_ACCOUNT_NAME: "Agora E2E",
      MANUAL_BANK_ACCOUNT_NUMBER: "0123456789",
      CRON_SECRET: "e2e-cron-secret-0123456789",
    },
  },
});
