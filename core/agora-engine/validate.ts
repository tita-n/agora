/**
 * Template package validator — the mechanical half of the trust model
 * (CSP + the render sandbox are the rest). PURE module; usable three ways:
 * `npm run theme:validate <dir>` (CLI loads files from disk), the publish
 * pipeline (runs it on the incoming zip), and unit tests (planted bad
 * packages). Any error ⇒ the package never ships. Warnings are advisory and
 * are printed, never auto-failed (JS hygiene scans live here).
 */
import { themeManifestSchema, packagePathIssues, PACKAGE_LIMITS, settingsSchemaEntry, type PackageFiles, type ThemeManifest } from "./package";
import { renderSite, createEngine } from "./render";
import { siteDataSchema, type SiteData } from "./site-data";
import { z } from "zod";

export type ValidationResult = { errors: string[]; warnings: string[] };

const LIQUID_BANNED: { re: RegExp; why: string }[] = [
  { re: /<\s*script/i, why: "inline <script> is banned (assets/*.js only)" },
  { re: /\son[a-z]+\s*=\s*["']/i, why: "inline event handlers (on*=) are banned" },
  { re: /javascript\s*:/i, why: "javascript: URLs are banned" },
  { re: /["'\s]data:[^"']*,/i, why: "data: URLs in attributes are banned" },
  { re: /<\s*(iframe|object|embed|base|meta\s+http-equiv)/i, why: "framing/base/meta-refresh tags are banned" },
  { re: /<\s*form\b/i, why: "v1 sites have no forms (WhatsApp links only)" },
  { re: /https?:\/\//i, why: "no absolute external URLs — SiteData + filters only" },
  { re: /\b(constructor|__proto__|prototype)\b/, why: "prototype access is banned at parse level" },
];

const CSS_BANNED: { re: RegExp; why: string }[] = [
  { re: /@import\s+(url\()\s*["']?https?:/i, why: "remote @import is banned" },
  { re: /url\(\s*["']?https?:/i, why: "remote url() references are banned" },
  { re: /expression\s*\(/i, why: "CSS expressions are banned" },
];

const JS_ADVISORY: { re: RegExp; why: string }[] = [
  { re: /\beval\s*\(/, why: "eval() in package JS (advisory)" },
  { re: /new\s+Function\s*\(/, why: "new Function() (advisory)" },
  { re: /document\.cookie/, why: "cookie access (advisory)" },
  { re: /localStorage|sessionStorage/, why: "storage access (advisory)" },
  { re: /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/, why: "network calls (advisory — CSP connect-src is the real block)" },
  { re: /postMessage|window\.top/, why: "cross-frame messaging (advisory)" },
];

const text = (files: PackageFiles, path: string): string | null => {
  const v = files.get(path);
  if (v === undefined) return null;
  return typeof v === "string" ? v : new TextDecoder().decode(v);
};

/** Full validation of one package file map. */
export async function validatePackage(files: PackageFiles): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── shape & size budgets ───────────────────────────────────────────────
  if (files.size > PACKAGE_LIMITS.maxFiles) errors.push(`over ${PACKAGE_LIMITS.maxFiles} files`);
  let total = 0;
  for (const [path, content] of files) {
    const size = typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
    total += size;
    const isAsset =
      !path.endsWith(".liquid") && !path.endsWith(".json") && !path.endsWith(".txt") && !path.endsWith(".md") && path !== "theme.json" && !path.startsWith("fixtures/");
    errors.push(...packagePathIssues(path, size, isAsset));
  }
  if (total > PACKAGE_LIMITS.maxTotalBytes) errors.push(`package over ${PACKAGE_LIMITS.maxTotalBytes / 1024}KB total`);

  // ── manifest ───────────────────────────────────────────────────────────
  let manifest: ThemeManifest | null = null;
  const rawManifest = text(files, "theme.json");
  if (rawManifest === null) {
    errors.push("theme.json missing");
  } else {
    const parsed = themeManifestSchema.safeParse(safeJson(rawManifest, errors, "theme.json"));
    if (parsed.success) manifest = parsed.data;
    else errors.push(`theme.json invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }

  // ── required structure ─────────────────────────────────────────────────
  if (!files.has("layout.liquid")) errors.push("layout.liquid missing");
  if (!files.has("templates/home.liquid") && !files.has("index.liquid")) errors.push("templates/home.liquid missing");
  if (manifest) {
    for (const sec of manifest.supportedSections) {
      if (!files.has(`sections/${sec}.liquid`)) errors.push(`sections/${sec}.liquid missing (declared in supportedSections)`);
    }
  }

  // ── settings_schema.json (optional but must agree with the manifest) ──
  const rawSettings = text(files, "settings_schema.json");
  if (rawSettings !== null) {
    const parsed = z.array(settingsSchemaEntry).safeParse(safeJson(rawSettings, errors, "settings_schema.json"));
    if (!parsed.success) errors.push("settings_schema.json invalid");
    else if (manifest) {
      const schemaKeys = new Set(parsed.data.map((s) => s.key));
      for (const k of Object.keys(manifest.settings)) if (!schemaKeys.has(k)) errors.push(`manifest setting "${k}" has no settings_schema entry`);
      for (const s of parsed.data) {
        const m = manifest.settings[s.key];
        if (m && m.type !== s.type) errors.push(`setting "${s.key}" type mismatch (manifest ${m.type} vs schema ${s.type})`);
      }
    }
  }

  // ── per-file content scans ─────────────────────────────────────────────
  for (const [path] of files) {
    const content = text(files, path) ?? "";
    if (path.endsWith(".liquid")) {
      if (content.length > PACKAGE_LIMITS.maxLiquidBytes) errors.push(`${path}: liquid over 128KB`);
      for (const b of LIQUID_BANNED) if (b.re.test(content)) errors.push(`${path}: ${b.why}`);
      // every {% render x %} target must exist (static refs only)
      for (const m of content.matchAll(/\{%-?\s*(?:render|include)\s+"([a-z0-9._/-]+)"/g)) {
        const ref = m[1]!;
        if (!files.has(`snippets/${ref}`) && !files.has(`snippets/${ref}.liquid`) && !files.has(`sections/${ref}.liquid`) && !files.has(ref)) {
          errors.push(`${path}: render target "${ref}" not found in package`);
        }
      }
    }
    if (path.endsWith(".css")) for (const b of CSS_BANNED) if (b.re.test(content)) errors.push(`${path}: ${b.why}`);
    if (path.endsWith(".js")) for (const b of JS_ADVISORY) if (b.re.test(content)) warnings.push(`${path}: ${b.why}`);
  }

  // ── fixtures + RENDER pass (full and empty) ───────────────────────────
  const fixturePaths = [...files.keys()].filter((p) => p.startsWith("fixtures/") && p.endsWith(".json"));
  if (!fixturePaths.includes("fixtures/empty.json")) errors.push("fixtures/empty.json required (empty-data contract)");
  if (fixturePaths.length < 2) errors.push("at least one niche fixture plus empty.json required");
  if (!errors.length && manifest) {
    for (const fp of fixturePaths) {
      const raw = text(files, fp) ?? "";
      const parsedFixture = siteDataSchema.safeParse(safeJson(raw, errors, fp) ?? {});
      if (!parsedFixture.success) {
        errors.push(`${fp}: not a valid SiteData fixture (${parsedFixture.error.issues[0]?.path.join(".")} — ${parsedFixture.error.issues[0]?.message})`);
        continue;
      }
      try {
        const html = await renderPackageHtml(files, manifest, parsedFixture.data);
        if (html.length < 40) errors.push(`${fp}: rendered output suspiciously short (${html.length}B)`);
        if (/<script/i.test(html)) errors.push(`${fp}: rendered HTML contains a script tag`);
      } catch (err) {
        errors.push(`${fp}: render failed — ${err instanceof Error ? firstLine(err.message) : "unknown"}`);
      }
    }
  }

  // ── settings-color contrast (advisory): every color default vs paper ──
  if (manifest) {
    for (const [key, spec] of Object.entries(manifest.settings)) {
      if (spec.type === "color" && typeof spec.default === "string" && !/^#[0-9a-fA-F]{6}$/.test(spec.default)) {
        errors.push(`setting "${key}": color default must be #rrggbb`);
      }
    }
  }

  return { errors, warnings };
}

function safeJson(raw: string, errors: string[], where: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    errors.push(`${where}: invalid JSON`);
    return undefined;
  }
}
function firstLine(s: string): string {
  return s.split("\n")[0]!.slice(0, 200);
}

/** Render helper shared with validate (and reusable by tests): engine
 * instance over the map, standard context, no slots. */
export async function renderPackageHtml(files: PackageFiles, manifest: ThemeManifest, site: SiteData): Promise<string> {
  return renderSite(files, { site, manifest, assetBase: "/_assets/test/", agoraHref: "https://agora.test/" });
}

/** Liquid-parse-only pass used by CI for template syntax (no fixtures). */
export async function parseCheck(files: PackageFiles): Promise<string[]> {
  const liquid = createEngine(files);
  const errs: string[] = [];
  for (const [path] of files) {
    if (!path.endsWith(".liquid")) continue;
    try {
      liquid.parse(text(files, path) ?? "");
    } catch (e) {
      errs.push(`${path}: parse error — ${e instanceof Error ? firstLine(e.message) : "unknown"}`);
    }
  }
  return errs;
}
