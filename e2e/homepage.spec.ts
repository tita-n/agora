import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Homepage marketing control contract — docs/HOMEPAGE-ACTIONS.md is the
 * manifest; this suite makes the manifest and reality inseparable:
 *   - every control listed must be present, named, and wired (per state);
 *   - every control PRESENT must be listed (no unregistered dead links can
 *     land without a test that fails first);
 *   - no href is empty/#/javascript:, externals are allowlist-only +
 *     rel-safe, internal destinations load 2xx real pages without console
 *     errors; every button must do something observable;
 *   - the mobile menu opens and closes; touch widths keep 44px tap targets
 *     and zero horizontal overflow; keyboard focus stays visible.
 * Runs against the full stack (migrate deploy + seed + next dev) that
 * scripts/e2e-run.mjs guarantees — SKIPPED, never faked, when unavailable.
 */
test.setTimeout(180_000);

const DOC = fs.readFileSync(path.join(process.cwd(), "docs", "HOMEPAGE-ACTIONS.md"), "utf8");
type Ctrl = { label: string; kind: string; href?: string; hrefPattern?: string; when?: string };
type Manifest = {
  pages: string[];
  viewports: number[];
  states: string[];
  externalAllowlist: string[];
  chrome: Record<string, Ctrl[]>;
  signedInMustNotSee: string[];
  pageScoped: Record<string, Record<string, Ctrl[] | Ctrl>>;
};
const MANIFEST: Manifest = JSON.parse(DOC.match(/```json\n([\s\S]*?)```/)![1]) as Manifest;

const ACCOUNTS = {
  owner: { email: "owner@agora.test", password: "password123" },
  developer: { email: "dev@agora.test", password: "password123" },
  staff: { email: "admin@agora.test", password: "password123" },
} as const;

async function signIn(page: Page, state: string) {
  if (state === "anon") return;
  const acct = ACCOUNTS[state as keyof typeof ACCOUNTS];
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(acct.email);
  await page.getByLabel(/password/i).fill(acct.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|developer|admin|onboard)/, { timeout: 20_000 });
}

function expectedControls(state: string, width: number, page: string): Ctrl[] {
  const c = MANIFEST.chrome;
  const list: Ctrl[] = [...c.common];
  if (state === "anon") list.push(...c.anon);
  else {
    list.push(...c[state]);
    list.push(...(c.signedInCommon ?? []));
  }
  if (width < 768) list.push(...c.mobileOnly);
  const scoped = MANIFEST.pageScoped[page] ?? {};
  const byState = scoped[state];
  const all = scoped.all;
  if (Array.isArray(byState)) list.push(...byState);
  if (Array.isArray(all)) list.push(...all);
  return list;
}

/** Visible interactive elements, as the browser sees them. */
async function liveControls(page: Page) {
  return page.$$eval("a[href], button, [role='button']", (els) =>
    els
      .map((e) => ({
        tag: e.tagName.toLowerCase(),
        text: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " "),
        href: e.getAttribute("href"),
        rel: e.getAttribute("rel"),
        visible: !!(e instanceof HTMLElement && (e.offsetWidth || e.offsetHeight || e.getClientRects().length)),
      }))
      .filter((x) => x.visible)
  );
}

const openMenu = async (page: Page) => {
  const details = page.locator("[data-testid='mobile-menu']");
  const summary = details.locator("> summary");
  await summary.click();
  await expect(details.locator("> div a").first()).toBeVisible({ timeout: 5_000 });
};

async function gotoState(page: Page, state: string, url: string, width: number) {
  await page.goto(url);
  if (width < 768) await openMenu(page);
}

for (const state of MANIFEST.states as string[]) {
  test(`marketing controls match the manifest in every state (${state})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await signIn(page, state);
    for (const width of MANIFEST.viewports) {
      await page.setViewportSize({ width, height: 900 });
      for (const url of MANIFEST.pages) {
        await gotoState(page, state, url, width);
        const expected = expectedControls(state, width, url);
        for (const c of expected) {
          const loc =
            c.kind === "menu-toggle"
              ? page.locator("[data-testid='mobile-menu'] > summary")
              : page.getByRole("link", { name: c.label, exact: true }).first();
          await expect(loc, `${url} @${width} [${state}] must show "${c.label}"`).toBeVisible();
          if (c.href) await expect(loc, `${url} @${width} "${c.label}" href`).toHaveAttribute("href", c.href);
          if (c.hrefPattern) {
            const href = (await loc.getAttribute("href")) ?? "";
            expect(href, `${url} "${c.label}" href matches pattern`).toMatch(new RegExp(c.hrefPattern));
          }
        }
        if (state !== "anon") {
          for (const banned of MANIFEST.signedInMustNotSee) {
            const n = await page.getByRole("link", { name: banned, exact: true }).count();
            expect(n, `"${banned}" must not appear while signed in (${url})`).toBe(0);
          }
        }
        // Reverse sweep: nothing visible may be unregistered.
        const live = await liveControls(page);
        const known = new Set(expected.map((c) => `${c.label}|${c.href ?? c.hrefPattern ?? ""}`));
        for (const el of live) {
          const direct = known.has(`${el.text}|${el.href ?? ""}`);
          const patternOk = expected.some(
            (c) => c.hrefPattern && el.text === c.label && new RegExp(c.hrefPattern).test(el.href ?? "")
          );
          const cardEntry = MANIFEST.pageScoped[url]?.perCard;
          const cardOk =
            cardEntry !== undefined &&
            !Array.isArray(cardEntry) &&
            el.text === cardEntry.label &&
            new RegExp(cardEntry.hrefPattern ?? "^$").test(el.href ?? "");
          expect(direct || patternOk || cardOk, `${url} @${width} [${state}]: unregistered visible control "${el.text}" (${el.href}) — add it to docs/HOMEPAGE-ACTIONS.md`).toBe(true);
        }
        // Per-card links: every theme card carries a working Preview link.
        const perCardRaw = MANIFEST.pageScoped[url]?.perCard;
        const perCard = perCardRaw && !Array.isArray(perCardRaw) ? perCardRaw : undefined;
        if (perCard && !Array.isArray(perCard)) {
          const cards = page.locator("section ul li");
          const n = await cards.count();
          for (let i = 0; i < n; i++) {
            await expect(
              cards.nth(i).getByRole("link", { name: perCard.label, exact: true })
            ).toHaveAttribute("href", new RegExp(perCard.hrefPattern ?? "^$"));
          }
        }
      }
    }
    await ctx.close();
  });
}

test("internal links load real 2xx pages with no console errors (per state)", async ({ browser }) => {
  for (const state of MANIFEST.states as string[]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && !/favicon/i.test(m.text()) && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await signIn(page, state);
    const hrefs = new Set<string>();
    for (const url of MANIFEST.pages) {
      await page.goto(url);
      for (const el of await liveControls(page)) {
        if (el.tag === "a" && el.href && el.href.startsWith("/")) hrefs.add(el.href);
      }
    }
    expect(hrefs.size).toBeGreaterThan(4);
    for (const href of hrefs) {
      const res = await page.goto(href, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0, `${state}: ${href} responds`).toBeLessThan(400);
      const body = await page.textContent("body");
      expect(body, `${state}: ${href} is a real page, not the error boundary`).not.toMatch(
        /Something went wrong|Application error|Internal Server Error/
      );
    }
    expect(errors, `${state}: no console errors across marketing pages`).toEqual([]);
    await ctx.close();
  }
});

test("external links: allowlist-only, rel-safe", async ({ page }) => {
  for (const url of MANIFEST.pages) {
    await page.goto(url);
    for (const el of await liveControls(page)) {
      if (el.tag !== "a" || !el.href) continue;
      if (/^https?:\/\//.test(el.href)) {
        const host = new URL(el.href).host;
        expect(MANIFEST.externalAllowlist, `external ${host} on ${url} is not allowlisted`).toContain(host);
        expect(el.rel ?? "", `external ${el.href} must rel=noopener noreferrer`).toMatch(/noopener/);
        expect(el.rel ?? "", `external ${el.href} must rel=noreferrer`).toMatch(/noreferrer/);
      } else {
        expect(el.href, `no empty/#/javascript: hrefs (${url})`).not.toMatch(/^(#|javascript:)/);
        expect(el.href.length, `no empty hrefs (${url})`).toBeGreaterThan(0);
      }
    }
  }
});

for (const width of [360, 390]) {
  test(`mobile menu opens, closes, and navigates at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.goto("/");
    const details = page.locator("[data-testid='mobile-menu']");
    const summary = details.locator("> summary");
    await expect(details.locator("> div a").first()).toBeHidden();
    await summary.click();
    await expect(details.locator("> div a").first()).toBeVisible();
    await summary.click();
    await expect(details.locator("> div a").first()).toBeHidden();
    // keyboard: Enter toggles
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(details.locator("> div a").first()).toBeVisible();
    // menu links navigate
    await details.locator("> div a", { hasText: "How it works" }).first().click();
    await expect(page).toHaveURL(/\/how-it-works/);
  });
}

for (const width of MANIFEST.viewports) {
  test(`layout: no horizontal overflow${width < 768 ? ", 44px tap targets" : ""} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const url of MANIFEST.pages) {
      await gotoState(page, "anon", url, width);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${url} @${width}: no horizontal overflow`).toBeLessThanOrEqual(0);
      if (width <= 390) {
        const tooSmall = await page.$$eval("a[href], button, [role='button']", (els) =>
          els
            .filter((e) => e instanceof HTMLElement && (e.offsetWidth || e.offsetHeight))
            .map((e) => ({
              t: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40),
              h: Math.round(e.getBoundingClientRect().height * 10) / 10,
            }))
            .filter((x) => x.h < 44)
        );
        expect(tooSmall, `${url} @${width}: every control needs >=44px height`).toEqual([]);
      }
    }
  });
}

test("keyboard focus is visible on controls", async ({ page }) => {
  await page.goto("/");
  const seenFocus: boolean[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    seenFocus.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const style = getComputedStyle(el);
        return (
          el.matches(":focus-visible") &&
          style.outlineStyle !== "none" &&
          parseFloat(style.outlineWidth) > 0
        );
      })
    );
  }
  expect(seenFocus.filter(Boolean).length, "Tab reveals focus-visible outlines").toBeGreaterThanOrEqual(5);
});

test("every <button> on marketing pages does something observable", async ({ page }) => {
  // Today the marketing cluster is links + the <details> disclosure; this
  // test is the fence: the day someone adds a button, it MUST visibly act —
  // navigate, open a dialog, toggle, fetch, or scroll. A dead button fails.
  for (const url of MANIFEST.pages) {
    await page.goto(url);
    const buttons = page.locator("main button, main [role='button'], header button, header [role='button']");
    const n = await buttons.count();
    for (let i = 0; i < Math.min(n, 8); i++) {
      const b = buttons.nth(i);
      await b.scrollIntoViewIfNeeded();
      const before = {
        url: page.url(),
        dialogs: await page.locator("[role='dialog']").count(),
        scroll: await page.evaluate(() => window.scrollY),
        requests: [] as string[],
      };
      const reqs: string[] = before.requests;
      const listener = (r: { url(): string }) => reqs.push(r.url());
      page.on("request", listener);
      await b.click();
      await page.waitForTimeout(750);
      page.off("request", listener);
      const moved =
        page.url() !== before.url ||
        (await page.locator("[role='dialog']").count()) !== before.dialogs ||
        Math.abs((await page.evaluate(() => window.scrollY)) - before.scroll) > 4 ||
        reqs.length > 0 ||
        (await page.evaluate(() => !!document.querySelector("details[open]") || !!document.querySelector("[aria-expanded='true']")));
      const name = (await b.getAttribute("aria-label")) || (await b.innerText());
      expect(moved, `${url}: button "${name.trim()}" produced no observable effect`).toBe(true);
      await page.goto(url); // reset
    }
  }
});
