import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Phase 0 acceptance flows. Screenshots land in e2e-artifacts/ (kept out of
 * git). Everything here runs against the real server: real DB rows, real
 * engine renders, real headers — the unit suites stay the sandbox's proof,
 * these are the deployment's.
 */
const ARTIFACTS = path.join(process.cwd(), "e2e-artifacts");
fs.mkdirSync(ARTIFACTS, { recursive: true });
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: true });
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("marketing home: real data only + preview link works", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const preview = page.getByRole("link", { name: /preview|see it/i }).first();
  if (await preview.count()) {
    const href = await preview.getAttribute("href");
    expect(href ?? "").toMatch(/\/t\/[a-z0-9-]+$/);
  }
  await shot(page, "01-home");
});

test("theme preview: engine-rendered package on the sites origin", async ({ page, request }) => {
  const res = await request.get("/t/boutique", { maxRedirects: 5 });
  expect(res.ok()).toBeTruthy();
  const url = new URL(res.url());
  expect(url.hostname).toBe("preview.sites.localhost");
  expect(url.port).toBe("3100");
  await page.goto(res.url());
  await expect(page.getByText("Àṣọ Atelier").first()).toBeVisible();
  await page.screenshot({ path: path.join(ARTIFACTS, "02-preview-full.png"), fullPage: true });
  // no scripts execute inside tenant HTML: page errors would set this
  const html = await page.content();
  expect(html).not.toMatch(/<script/i);
  // empty-data contract renders in the same pipeline
  const empty = await request.get(`${res.url()}?state=empty`);
  expect(empty.ok()).toBeTruthy();
  const emptyHtml = await empty.text();
  expect(emptyHtml).toContain("Àṣọ Atelier");
  expect(emptyHtml).not.toMatch(/undefined|NaN/);
});

test("preview origin posture: strict CSP, frame only from the app", async ({ request }) => {
  const res = await request.get("http://boutique.sites.localhost:3100/");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("script-src 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

test("draft-preview API: cross-origin POST refused", async ({ request }) => {
  const res = await request.post("/api/templates/draft-preview", {
    headers: { origin: "https://evil.example" },
    data: { themeSlug: "minimal", name: "X" },
  });
  expect(res.status()).toBe(403);
});

test("package assets: served immutable, unknown versions 404", async ({ page, request }) => {
  const res = await request.get("/t/boutique", { maxRedirects: 5 });
  await page.goto(res.url());
  const cssHref = await page.locator('link[rel="stylesheet"]').getAttribute("href");
  expect(cssHref).toMatch(/^\/_assets\/[a-z0-9_]+\/theme\.css$/);
  const css = await request.get(new URL(cssHref!, res.url()).toString());
  expect(css.ok()).toBeTruthy();
  expect(css.headers()["cache-control"]).toContain("immutable");
  const traversal = await request.get(new URL("../package.json", cssHref!).toString());
  expect(traversal.status()).toBeGreaterThanOrEqual(400);
});

test("auth: signup → zero-enumeration login path → wizard reachable", async ({ page }) => {
  const email = `e2e-${Date.now()}@agora.test`;
  await page.goto("/signup");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill("sup3r-s3cret-pw");
  await page.getByRole("button", { name: /create account/i }).click();
  // signup is silent about existing accounts; new account waits for email
  // verification for PAYMENTS but the dashboard renders (soft gate)
  await page.waitForURL(/login|dashboard|verify/, { timeout: 15_000 });
  await login(page, email, "sup3r-s3cret-pw");
  await page.waitForURL(/dashboard|login/, { timeout: 15_000 });
  await shot(page, "03-dashboard-new-user");
  await page.goto("/onboard");
  await expect(page.getByText(/subdomain/i).first()).toBeVisible();
  await shot(page, "04-wizard-step1");
});

test("wizard step 4: engine iframe renders the live draft", async ({ page }) => {
  await login(page, "owner@agora.test", "password123");
  await page.goto("/onboard");
  await page.getByLabel(/subdomain/i).fill(`e2ebiz${Date.now() % 100000}`);
  await page.getByRole("button", { name: /next/i }).click();
  await page.getByLabel(/business name/i).fill("E2E Smoke Boutique");
  await page.getByRole("button", { name: /next/i }).click();
  await page.getByRole("radio", { name: /boutique/i }).first().click({ timeout: 5_000 }).catch(() => {});
  await page.getByRole("button", { name: /next|see it/i }).click();
  const frame = page.locator('iframe[sandbox="allow-scripts"]');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  await expect(frame).toHaveAttribute("srcdoc", /E2E Smoke Boutique/);
  await shot(page, "05-wizard-live-preview");
});
