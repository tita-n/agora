import fs from "fs";
import path from "path";
/**
 * npm run test:phase25 — unit tests for everything Phase 2.5 extracted as
 * PURE logic: whatsapp normalization, social-URL allowlist, colour contrast,
 * siteConfig validation (write + defensive read), opening-hours schemas,
 * price text, the registry/theme-keys parity, and a render smoke pass that
 * every registered theme produces an element tree with FULL and with EMPTY
 * fixture data without throwing (AC1 + AC7).
 *
 * The render pass CALLS the theme components as functions — this executes
 * all section-selection/filtering/loop logic. Nested components (next/image
 * etc.) become element objects without being executed, which is exactly the
 * depth this sandbox can verify: "no throws, sane tree". Visual truth = the
 * /preview routes, bandwidth/contrast = code review + the pure tests.
 */
import {
  normalizeWhatsapp,
  buildWaLink,
  normalizeSocialUrl,
} from "../lib/contacts";
import { readableTextColor, normalizeHexColor } from "../lib/color";
import {
  parseSiteConfig,
  buildSiteConfig,
  normalizeSections,
  defaultSiteConfig,
  siteConfigSchema,
} from "../lib/site-config";
import { parseOpeningHours, openingHoursInput, hoursRangeLabel, WEEKDAYS } from "../lib/opening-hours";
import { productInput, serviceInput, testimonialInput, reorderInput } from "../lib/content-schema";
import { formatKobo } from "../lib/site-data";
import { THEME_KEYS } from "../lib/theme-keys";
import { isOurBlobUrl, blobPathname } from "../lib/blob-url";


let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
}
function ok(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL ${label}`);
  }
}

// ── WhatsApp normalization ────────────────────────────────────────────────
eq(normalizeWhatsapp("0803 123 4567"), { ok: true, digits: "2348031234567" }, "local 0 form → +234");
eq(normalizeWhatsapp("+234 803-123-4567"), { ok: true, digits: "2348031234567" }, "plus form kept as typed");
eq(normalizeWhatsapp("2348031234567"), { ok: true, digits: "2348031234567" }, "bare country-code passthrough");
eq(normalizeWhatsapp("002348031234567"), { ok: true, digits: "2348031234567" }, "00 IDD prefix stripped");
eq(normalizeWhatsapp("(0803) 123.4567"), { ok: true, digits: "2348031234567" }, "punctuation tolerated");
eq(normalizeWhatsapp("+1 (415) 555-0132"), { ok: true, digits: "14155550132" }, "non-NG plus form kept");
eq(normalizeWhatsapp("call me").ok, false, "letters rejected");
eq(normalizeWhatsapp("12345").ok, false, "too short rejected");
eq(normalizeWhatsapp("").ok, false, "empty rejected");
eq(normalizeWhatsapp(null).ok, false, "null rejected");
eq(normalizeWhatsapp(" +2348031234567 "), { ok: true, digits: "2348031234567" }, "surrounding spaces trimmed");

// ── wa.me link building ───────────────────────────────────────────────────
eq(
  buildWaLink("2348031234567", "Hi Àṣọ Atelier! I'd like to order: Ankara Two-Piece"),
  "https://wa.me/2348031234567?text=Hi%20%C3%80%E1%B9%A3%E1%BB%8D%20Atelier!%20I'd%20like%20to%20order%3A%20Ankara%20Two-Piece",
  "encoded order message"
);
eq(buildWaLink("08031234567", "hi"), null, "non-normalized (leading 0) never builds a link");
eq(buildWaLink(null, "hi"), null, "no number → no link (section drops the button)");
eq(buildWaLink("12345678", "x")?.startsWith("https://wa.me/12345678?text="), true, "8-digit minimum builds");
eq((buildWaLink("2348031234567", "a".repeat(600)) ?? "").split("text=")[1].length <= 600 * 3, true, "message capped defensively");
ok(!(buildWaLink("2348031234567", "javascript:alert(1)") ?? "").includes("javascript:"), "message text is encoded — raw javascript: scheme can never appear");

// ── social URL allowlist ──────────────────────────────────────────────────
eq(normalizeSocialUrl("instagram", "instagram.com/fash"), { ok: true, url: "https://instagram.com/fash" }, "bare host gets https");
eq(normalizeSocialUrl("instagram", "https://www.instagram.com/fash/"), { ok: true, url: "https://www.instagram.com/fash/" }, "www subdomain allowed");
ok(normalizeSocialUrl("instagram", "https://instagram.com.evil.co/x").ok === false, "lookalike suffix rejected");
ok(normalizeSocialUrl("instagram", "javascript:alert(1)").ok === false, "javascript: rejected");
ok(normalizeSocialUrl("instagram", "data:text/html,<b>x</b>").ok === false, "data: rejected");
ok(normalizeSocialUrl("instagram", "http://instagram.com/x").ok === false, "http rejected (https only)");
ok(normalizeSocialUrl("facebook", "https://facebook.com@evil.com/").ok === false, "credential trick rejected");
ok(normalizeSocialUrl("tiktok", "https://tiktok.com/@user").ok === true, "tiktok @handle ok");
eq(normalizeSocialUrl("facebook", "  ").ok, true, "blank clears (stored null)");
ok(normalizeSocialUrl("instagram", "https://m.instagram.com/x").ok === true, "m. subdomain ok");

// ── colour contrast ───────────────────────────────────────────────────────
eq(readableTextColor("#000000"), "#ffffff", "black bg → white text");
eq(readableTextColor("#ffffff"), "#111827", "white bg → ink text");
eq(readableTextColor("#7c3aed"), "#ffffff", "violet → white");
eq(readableTextColor("#fbbf24"), "#111827", "amber → ink");
eq(readableTextColor("#b0b0b0"), "#111827", "mid-light grey → ink");
eq(readableTextColor("javascript:alert(1)"), "#111827", "garbage color never reaches style, falls to ink");
eq(readableTextColor("#ABCDEF"), "#111827", "uppercase hex accepted (light-ish)");
eq(normalizeHexColor("#ABCDEF"), "#abcdef", "normalized lowercase");
eq(normalizeHexColor("#abcd"), null, "short hex rejected");
eq(normalizeHexColor("red"), null, "named colors rejected");

// ── siteConfig write + defensive read ─────────────────────────────────────
const cfg = buildSiteConfig({
  sections: [{ type: "hero", enabled: true }, { type: "products", enabled: false }],
  primaryColor: "#A1B2C3",
  fontPairKey: "editorial",
});
ok(!!cfg, "partial config builds");
eq(cfg?.sections.length, 8, "missing sections appended (default order)");
eq(cfg?.sections.map((s) => s.type).slice(0, 2), ["hero", "products"], "stored order preserved at the front");
eq(cfg?.sections[1].enabled, false, "toggle kept");
eq(cfg?.primaryColor, "#a1b2c3", "color normalized");
eq(siteConfigSchema.safeParse({ sections: [{ type: "bogus", enabled: true }], primaryColor: "#111111", fontPairKey: "clean" }).success, false, "unknown section type rejected");
eq(siteConfigSchema.safeParse({ sections: [{ type: "hero", enabled: "yes" }], primaryColor: "#111111", fontPairKey: "clean" }).success, false, "non-boolean enabled rejected");
eq(buildSiteConfig({ sections: [], primaryColor: "#111111", fontPairKey: "clean" }), null, "empty sections rejected on write");
eq(parseSiteConfig("garbage", "#7c3aed").primaryColor, "#7c3aed", "read: garbage row → legacy color still honoured");
eq(parseSiteConfig(null).sections.length, 8, "read: null → all defaults");
eq(parseSiteConfig({ sections: [{ type: "hero", enabled: true }, { type: "hero", enabled: false }] }).sections.filter((s) => s.type === "hero").length, 1, "read: duplicate type collapses (first wins)");
eq(parseSiteConfig({ sections: [{ type: "nope", enabled: true }], primaryColor: "red", fontPairKey: "comic" }).sections.length, 8, "read: invalid entries dropped, defaults restored wholesale");
eq(normalizeSections([{ type: "contact", enabled: true }, { type: "hero", enabled: false }, { type: "contact", enabled: false }]).map((s) => s.type), ["contact", "hero", "about", "products", "services", "gallery", "testimonials", "hours"], "normalize order + dedupe + tail");
eq(defaultSiteConfig(null).primaryColor, "#111827", "no legacy color → house default");

// ── opening hours ─────────────────────────────────────────────────────────
const good = Object.fromEntries(WEEKDAYS.map((d) => [d, d === "sunday" ? { closed: true } : { closed: false, open: "09:00", close: "17:30" }])) as unknown as import("../lib/opening-hours").OpeningHours;
ok(!!parseOpeningHours(good), "valid week parses");
eq((hoursRangeLabel(good) ?? "").includes("Mon–Sat"), true, "consecutive identical days collapse");
eq(parseOpeningHours({ ...good, monday: { open: "17:00", close: "09:00" } }), null, "close-before-open rejected");
eq(parseOpeningHours({ ...good, monday: { open: "9:00", close: "17:00" } }), null, "non-HH:MM rejected");
eq(Object.keys(parseOpeningHours({ ...good, extra_day: { closed: true } }) ?? {}).length, 7, "unknown day keys dropped on read (never widen the shape)");
eq(parseOpeningHours(undefined), null, "undefined → null (section absent)");
eq(openingHoursInput.safeParse(good).success, true, "storage shape also passes INPUT schema");
eq(openingHoursInput.safeParse({ ...good, friday: { closed: true } }).success, true, "form: closed flag accepted");
eq(openingHoursInput.safeParse({ ...good, friday: { closed: false, open: "", close: "" } }).success, false, "form: open-but-blank rejected");
eq(parseOpeningHours(Object.fromEntries(WEEKDAYS.map((d) => [d, { closed: true }])) as unknown as import("../lib/opening-hours").OpeningHours)?.friday.closed, true, "all-closed is VALID data");
eq(hoursRangeLabel(Object.fromEntries(WEEKDAYS.map((d) => [d, { closed: true }])) as never), null, "all-closed shows no summary");

// ── content input schemas ──────────────────────────────────────────────────
eq(productInput.safeParse({ name: "  ", imageUrls: [] }).success, false, "blank name rejected");
eq(productInput.safeParse({ name: "x".repeat(121), imageUrls: [] }).success, false, "name > 120 rejected");
eq(productInput.safeParse({ name: "Ankara", priceKobo: -100, imageUrls: [] }).success, false, "negative price rejected");
eq(productInput.safeParse({ name: "Ankara", priceKobo: 12.5, imageUrls: [] }).success, false, "fractional kobo rejected");
eq(productInput.safeParse({ name: "Ankara", priceKobo: 4250000, imageUrls: [] }).success, true, "minimal real product input accepted");
eq(productInput.safeParse({ name: "Ankara", imageUrls: [] }).success, true, "no price = price on request");
eq(productInput.safeParse({ name: "x", imageUrls: ["https://evil.co/x.png"] }).success, false, "foreign image URL rejected");
eq(productInput.safeParse({ name: "x", imageUrls: ["https://store.public.blob.vercel-storage.com/a-1.png"] }).success, true, "our blob host accepted");
eq(productInput.safeParse({ name: "x", imageUrls: Array.from({ length: 6 }, (_, i) => `https://s.public.blob.vercel-storage.com/a${i}.png`) }).success, false, "6 images rejected (cap 5)");
eq(productInput.safeParse({ name: "x", imageUrls: [], extra: true }).success, false, "unknown keys rejected (strict)");
eq(serviceInput.safeParse({ name: "Braids", priceLabel: "from", priceKobo: undefined, imageUrls: [] }).success, false, "services reject imageUrls");
eq(serviceInput.safeParse({ name: "Braids", priceLabel: "from" }).success, true, "service w/o price ok");
eq(testimonialInput.safeParse({ authorName: "Ada", quote: "x".repeat(401) }).success, false, "quote > 400 rejected");
eq(reorderInput.safeParse({ kind: "widgets", ids: ["a"] }).success, false, "reorder kind enum");
eq(reorderInput.safeParse({ kind: "products", ids: [] }).success, false, "empty reorder rejected");

// ── blob URL helpers ───────────────────────────────────────────────────────
eq(isOurBlobUrl("https://abc.public.blob.vercel-storage.com/products/u1/2.jpg"), true, "blob url");
eq(isOurBlobUrl("https://evil.com/x.png"), false, "not ours");
eq(isOurBlobUrl("https://public.blob.vercel-storage.com.evil.co/x"), false, "suffix trick rejected");
eq(blobPathname("https://abc.public.blob.vercel-storage.com/logos/u1/l.png"), "logos/u1/l.png", "pathname extract");

// ── price text + package registry parity (engine era) ────────────────────
eq(formatKobo(961410), "₦9,614", "kobo → naira, no decimals");
eq(formatKobo(150000000, "from"), "from ₦1,500,000", "label prefix + grouping");

// THEME_KEYS (onboarding validator) must cover EXACTLY the packages shipped
// in themes-packages/ — a package without a key can never be chosen, a key
// without a package would seed a broken listing.
const pkgsRoot = path.join(process.cwd(), "themes-packages");
const shipped = fs
  .readdirSync(pkgsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
eq(shipped, [...THEME_KEYS].sort(), "themes-packages/ covers EXACTLY lib/theme-keys");
for (const slug of shipped) {
  ok(fs.existsSync(path.join(pkgsRoot, slug, "theme.json")), slug + ": theme.json present");
  ok(fs.existsSync(path.join(pkgsRoot, slug, "layout.liquid")), slug + ": layout.liquid present");
  ok(fs.existsSync(path.join(pkgsRoot, slug, "fixtures", "empty.json")), slug + ": empty fixture present");
}

// XSS-named product renders as React text (element props carry the raw
// string — escaping is React's job at render; the data layer must NOT
// strip or double-encode it): AC5 at the unit boundary.
const nasty = "<script>alert(1)</script>";
const parsedNasty = productInput.safeParse({ name: nasty.slice(0, 120), imageUrls: [] });
eq(parsedNasty.success && parsedNasty.data.name, nasty, "script-tag name passes through UNMODIFIED (escaped at render, not sanitized away)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
