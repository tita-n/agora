/**
 * npm run test:engine — the template engine's security + behavior contract.
 * Everything here is PURE (no DB, no network): packages are read from
 * themes-packages/ like production would read blobs. If any of these fail,
 * DO NOT deploy — the sandbox is the product.
 */
import fs from "fs";
import path from "path";
import {
  validatePackage, renderSite, injectSlots, formatKobo, buildWaLink,
  formatHours, resolveSettings, packagePathIssues, siteDataSchema, PACKAGE_LIMITS,
  type PackageFiles, type ThemeManifest, type SiteData,
} from "../core/agora-engine";
import { readLocalPackage, packageChecksum } from "../lib/templates/loader";
import { THEME_KEYS } from "../lib/theme-keys";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}`);
  }
}
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}

const mini = (layout: string, home = "OK"): PackageFiles =>
  new Map<string, string>([
    ["theme.json", JSON.stringify({ apiVersion: 1, id: "t", name: "T", version: "1.0.0", description: "d", categories: ["x"], supportedSections: ["hero"], pluginSlots: [], settings: {} })],
    ["layout.liquid", layout],
    ["templates/home.liquid", home],
    ["fixtures/empty.json", JSON.stringify({ business: { name: "T" } })],
  ]);
const miniManifest = {
  apiVersion: 1 as const, id: "t", name: "T", version: "1.0.0", description: "d",
  categories: ["x"], supportedSections: ["hero"] as ["hero"], pluginSlots: [], settings: {},
};
const site = (over: Partial<SiteData> = {}): SiteData =>
  siteDataSchema.parse({ business: { name: "Shop" }, ...over });


async function main() {
  // ── purity guard: core imports nothing platform-side ──────────────────
  const coreDir = path.join(process.cwd(), "core/agora-engine");
  for (const f of fs.readdirSync(coreDir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(coreDir, f), "utf8");
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    ok(
      imports.every((i) => !i.startsWith("@/") && !i.includes("next/") && !i.includes("react") && !i.includes("prisma")),
      `core/${f} imports only pure deps (${imports.join(",")})`
    );
  }

  // ── autoescape: XSS payloads never survive as markup ─────────────────
  const xssName = `<img src=x onerror=alert(1)>`;
  const xssHtml = await renderSite(mini(`<h1>{{ business.name }}</h1>`), {
    site: siteDataSchema.parse({ business: { name: xssName } }),
    manifest: miniManifest as ThemeManifest, assetBase: "/_assets/v1/", agoraHref: "https://app.test",
  });
  ok(xssHtml.includes("&lt;img"), "XSS name is escaped in output");
  ok(!/<img src=x onerror/.test(xssHtml), "XSS tag does NOT survive autoescape");

  // ── ownPropertyOnly: prototype reach is undefined, not Object ────────
  const protoHtml = await renderSite(mini(`[{{ business.constructor.name }}][{{ business.__proto__ }}][{{ products.constructor }}]`), {
    site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test",
  });
  eq(protoHtml, "[][][]", "constructor/__proto__ render empty (ownPropertyOnly)");

  // ── strictFilters: only the platform filter set exists ────────────────
  let threwFilter = false;
  try {
    await renderSite(mini(`{{ "x" | evil_helper }}`), { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test" });
  } catch {
    threwFilter = true;
  }
  ok(threwFilter, "unknown filter throws (strictFilters)");

  // ── template map containment: nothing outside the map is reachable ────
  let threwPath = false;
  try {
    await renderSite(mini(`{% render "../package" %}`), { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test" });
  } catch {
    threwPath = true;
  }
  ok(threwPath, "{% render ../x %} cannot escape the map (ENOENT)");
  let threwAbs = false;
  try {
    await renderSite(mini(`{% render "/etc/passwd" %}`), { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test" });
  } catch {
    threwAbs = true;
  }
  ok(threwAbs, "absolute render target unreachable (map-only)");

  // ── runaway loops: renderLimit kills them ─────────────────────────────
  let runawayErr = "NO ERROR";
  try {
    await renderSite(mini(`{% for i in (1..20000000) %}x{% endfor %}`), { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test" });
    runawayErr = "no throw";
  } catch (e) {
    runawayErr = e instanceof Error ? e.message : String(e);
  }
  ok(/render|limit|memory|budget|timed\s?out/i.test(runawayErr), `runaway for-loop is stopped (msg: ${runawayErr.slice(0, 60)})`);

  // ── platform filters ──────────────────────────────────────────────────
  eq(formatKobo(961410), "\u20a69,614", "money format kobo");
  eq(formatKobo(150000000, "from"), "from \u20a61,500,000", "money format label");
  eq(buildWaLink("2348012345678", "Hi Àṣọ & co"), "https://wa.me/2348012345678?text=Hi%20%C3%80%E1%B9%A3%E1%BB%8D%20%26%20co", "wa link encodes");
  eq(buildWaLink("08012345678", "x"), null, "wa digits guard (leading zero)");
  eq(buildWaLink(null, "x"), null, "wa null guard");
  const filterHtml = await renderSite(
    mini(
      `{{ content_for_layout }}`,
      `{% assign u = "https://x.blob.vercel-storage.com/a.png" %}[{{ 'p.png' | asset_url }}][{{ '../../x' | asset_url }}][{{ u | image_url }}][{{ 'javascript:alert(1)' | image_url }}][{{ 0 | money }}][{{ 'x' | money }}]`
    ),
    { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/_assets/v1/", agoraHref: "https://app.test" }
  );
  ok(filterHtml.includes("[/_assets/v1/p.png][][https://x.blob.vercel-storage.com/a.png][][₦0][]"), `filters: asset/image/money posture (${filterHtml.trim()})`);

  // ── slot injection: markers replaced + containers guaranteed ─────────
  const slotIn = `<body><p>{{ 'floating-widget' | slot }}</p></body>`;
  const slotRendered = await renderSite(mini(slotIn), { site: site(), manifest: miniManifest as ThemeManifest, assetBase: "/", agoraHref: "https://app.test" });
  const injected = injectSlots(slotRendered, { "floating-widget": "<b>W</b>" });
  ok(injected.includes("<div data-agora-slot=\"floating-widget\"><b>W</b></div>"), "slot marker replaced with fragment");
  ok(injected.includes("footer-strip"), "unprinted slot container still injected");
  ok(!injected.includes("agora-slot:"), "no raw markers leak into final HTML");
  const injectedEmpty = injectSlots("<html><body><p>x</p></body></html>", {});
  ok(injectedEmpty.includes("<div data-agora-slot=\"floating-widget\"></div>"), "empty registry → empty containers (contract stable)");

  // ── settings resolution: types and allowlists are enforced ────────────
  const man = { ...miniManifest, settings: { ink: { type: "color" as const, default: "#111111" }, wide: { type: "boolean" as const, default: false }, mode: { type: "select" as const, default: "a", options: ["a", "b"] } } };
  eq(resolveSettings(man as ThemeManifest, { ink: "red; color: pink", mode: "z" }), { ink: "#111111", wide: false, mode: "a" }, "bad settings fall back to defaults");
  eq(resolveSettings(man as ThemeManifest, { ink: "#abcdef", wide: true, mode: "b" }), { ink: "#abcdef", wide: true, mode: "b" }, "typed settings pass through");
  eq(resolveSettings(man as ThemeManifest, null), { ink: "#111111", wide: false, mode: "a" }, "null tenant → defaults");

  // ── hours formatter defensiveness ─────────────────────────────────────
  eq(formatHours({ monday: { closed: true }, tuesday: { open: "09:00", close: "18:00" } }).length, 2, "hours skips malformed entries");
  eq(formatHours("garbage"), [], "hours: non-object never throws");

  // ── path rules ─────────────────────────────────────────────────────────
  eq(packagePathIssues("sections/hero.liquid", 100, false), [], "safe package path");
  ok(packagePathIssues("../evil", 100, false).length > 0, "traversal rejected");
  ok(packagePathIssues("A.B", 100, false).length > 0, "uppercase rejected");
  ok(packagePathIssues("assets/x.exe", 100, true).length > 0, "asset type allowlist");
  ok(packagePathIssues("x.css", PACKAGE_LIMITS.maxFileBytes + 1, true).length > 0, "size cap enforced");

  // ── validator: planted packages must be BLOCKED ───────────────────────
  const planted: Array<[string, PackageFiles]> = [
    ["inline script", mini(`<script>alert(1)</script>{{ content_for_layout }}`)],
    ["event handler", mini(`<img src=x onerror="alert(1)">{{ content_for_layout }}`)],
    ["javascript url", mini(`<a href="javascript:alert(1)">x</a>{{ content_for_layout }}`)],
    ["banned word", mini(`{{ business | inspect_constructor }}{% assign p = this.constructor %}{{ content_for_layout }}`)],
    ["external url", mini(`<link href="https://cdn.evil.com/x.css">{{ content_for_layout }}`)],
    ["missing manifest", new Map([["layout.liquid", "x"], ["templates/home.liquid", "y"], ["fixtures/empty.json", "{}"], ["fixtures/a.json", "{}"]])],
  ];
  for (const [label, files] of planted) {
    const r = await validatePackage(files);
    ok(r.errors.length > 0, `validator blocks: ${label}`);
  }
  const cssRemote = new Map([...mini("<html>{{ content_for_layout }}</html>", "x"), ["assets/theme.css", `body { background: url("https://evil.example/bg.png"); }`] as [string, string]]);
  ok((await validatePackage(cssRemote)).errors.some((e) => e.includes("remote url")), "validator blocks remote CSS url()");
  const noEmpty = new Map(mini("<html>{{ content_for_layout }}</html>"));
  noEmpty.delete("fixtures/empty.json");
  ok((await validatePackage(noEmpty)).errors.some((e) => e.includes("empty.json")), "validator requires the empty-data fixture");

  // ── the four real packages: valid + full & empty render + parity ──────
  eq(fs.readdirSync(path.join(process.cwd(), "themes-packages"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(), [...THEME_KEYS].sort(), "shipped packages == THEME_KEYS");
  for (const slug of THEME_KEYS) {
    const files = readLocalPackage(slug);
    const { errors, warnings } = await validatePackage(files);
    eq(errors, [], `${slug}: validator errors (warnings: ${warnings.length})`);
    ok(typeof packageChecksum(files) === "string" && packageChecksum(files).length === 64, `${slug}: deterministic checksum`);
    const manifest = JSON.parse(files.get("theme.json") as string) as ThemeManifest;
    const fullKey = [...files.keys()].filter((k) => k.startsWith("fixtures/") && k.endsWith(".json") && k !== "fixtures/empty.json")[0]!;
    const full = siteDataSchema.parse(JSON.parse(files.get(fullKey) as string));
    const html = await renderSite(files, { site: full, manifest, assetBase: `/_assets/tst/`, agoraHref: "https://app.test/" });
    ok(html.startsWith("<!doctype html>"), `${slug}: full fixture renders a document`);
    ok(html.includes(full.business.name), `${slug}: business name present`);
    ok(!/undefined|NaN|\[object/.test(html), `${slug}: no undefined/NaN leakage (full)`);
    ok(injectSlots(html, {}).includes("data-agora-slot"), `${slug}: slot containers inject cleanly`);
    const empty = siteDataSchema.parse(JSON.parse(files.get("fixtures/empty.json") as string));
    const emptyHtml = await renderSite(files, { site: empty, manifest, assetBase: "/_assets/tst/", agoraHref: "https://app.test/" });
    ok(emptyHtml.startsWith("<!doctype html>"), `${slug}: EMPTY fixture still renders a document`);
    ok(emptyHtml.includes(empty.business.name), `${slug}: name survives empty data`);
    ok(!/undefined|NaN|null|\[object/.test(emptyHtml), `${slug}: no undefined/NaN/null leakage (empty)`);
    if (slug === "boutique") {
      const detail = await renderSite(files, { site: full, manifest, assetBase: "/_assets/tst/", agoraHref: "https://app.test/", product: full.products[0] });
      ok(detail.includes("Anara Ankara Two-Piece"), "boutique product page renders the product");
      ok(detail.includes("Order on WhatsApp") && detail.includes("wa.me"), "product page has the WhatsApp order link");
      ok(detail.includes("/_assets/tst/sample-a.svg"), "product gallery resolves via asset proxy");
      ok(full.products.some((x) => !("price" in x)), "boutique fixture includes a price-on-request product");
      ok(full.products.some((x) => x.inStock === false), "boutique fixture includes an out-of-stock product");
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
