/**
 * The render side of the engine — PURE (zod + liquidjs only). Turns a
 * package file map + SiteData into an HTML string under sandbox options
 * fixed HERE (validators never re-decide them):
 *
 *  - `templates`: the whole package as an in-memory map — the LiquidJS
 *    filesystem is bypassed entirely, so path traversal is not "checked",
 *    it is structurally impossible (lookup is exact-match on map keys).
 *  - `outputEscape: "escape"` → autoescape ON everywhere (raw only via the
 *    engine's own slot post-processing, never template-supplied strings).
 *  - `ownPropertyOnly` → prototype access from templates yields undefined.
 *  - `strictFilters` → only the platform filter set exists.
 *  - parseLimit / renderLimit / memoryLimit → DoS budgets.
 */
import { Liquid } from "liquidjs";
import type { SiteData } from "./site-data";
import { formatKobo, SECTION_SLICE, type SectionType } from "./site-data";
import type { PackageFiles, ThemeManifest } from "./package";
import { PACKAGE_LIMITS, resolveSettings } from "./package";

export const RENDER_BUDGET_MS = 1000;
export const RENDER_MEMORY_BYTES = 32 << 20;
export const PARSE_LIMIT_CHARS = 1 << 20;

export type RenderCtx = {
  site: SiteData;
  manifest: ThemeManifest;
  /** where asset_url points (e.g. "/_assets/vcm_123/") — caller decides */
  assetBase: string;
  /** "Powered by Agora" target (absolute https on the app origin) */
  agoraHref: string;
  /** product detail rendering (templates/product.liquid) */
  product?: SiteData["products"][number];
};

/** The text files the engine may parse. Binary assets stay in the map for
 * the asset route but never reach Liquid. */
function templateMap(files: PackageFiles): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string) => {
    if (!(k in out)) out[k] = v;
  };
  for (const [path, content] of files) {
    if (!path.endsWith(".liquid")) continue;
    const src = typeof content === "string" ? content : new TextDecoder().decode(content);
    set(path, src);
    const noExt = path.slice(0, -".liquid".length);
    set(noExt, src);
    // Shopify-style: {% render s.type %} addresses sections/snippets by
    // bare name. Collisions across dirs keep the FIRST (dirs are flat).
    const m = /^(sections|snippets|blocks)\/([^/]+)\.liquid$/.exec(path);
    if (m) {
      // MapFS appends `extname` after resolve(".", name, ext): {% render
      // "hero" %} looks up "hero.liquid". Register both bare forms.
      set(`${m[2]}.liquid`, src);
      set(m[2]!, src);
    }
  }
  return out;
}

export function createEngine(files: PackageFiles): Liquid {
  const liquid = new Liquid({
    templates: templateMap(files),
    // --- sandbox posture (see header; changing any of these is a SPEC
    // change to docs/TEMPLATE_SPEC.md, not a refactor) ---
    outputEscape: "escape",
    ownPropertyOnly: true,
    strictFilters: true,
    strictVariables: false, // empty-data rendering relies on this
    parseLimit: PARSE_LIMIT_CHARS,
    renderLimit: RENDER_BUDGET_MS,
    memoryLimit: RENDER_MEMORY_BYTES,
    extname: ".liquid",
    relativeReference: false,
  });
  return liquid;
}

export function registerFilters(liquid: Liquid, ctx: Pick<RenderCtx, "site" | "assetBase" | "agoraHref">): void {
  const { assetBase } = ctx;
  // asset_url: package files ONLY, via the same-origin proxy base.
  liquid.registerFilter("asset_url", (v: unknown) => {
    const name = String(v ?? "").replace(/^\/+/, "").replace(/^assets\//, "");
    if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(name)) return "";
    return `${assetBase}${name}`;
  });
  // image_url: only platform-sanitised URLs survive to templates, so this
  // passes through (and hard-empties anything not absolute https — belt).
  liquid.registerFilter("image_url", (v: unknown) => {
    const u = String(v ?? "");
    if (/^https:\/\//.test(u)) return u; // platform-sanitised absolute URL
    const bare = u.replace(/^assets\//, "").replace(/^\/+/, "");
    if (/^[a-z0-9][a-z0-9._-]{1,79}\.(svg|png|jpe?g|webp|avif|gif)$/.test(bare)) return `${assetBase}${bare}`;
    return "";
  });
  liquid.registerFilter("money", (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? formatKobo(v) : ""));
  liquid.registerFilter("json_default", (v: unknown, d: unknown) => (v === undefined || v === null ? d : v));
  // slot: prints the injection marker; injectSlots() replaces ALL markers
  // (and guarantees the container even when a template prints none).
  liquid.registerFilter("slot", (v: unknown) => {
    const id = String(v ?? "");
    return id === "floating-widget" || id === "footer-strip" ? `${SLOT_MARKER}${id}\u0000` : "";
  });
}

export const SLOT_MARKER = "\u0000agora-slot:";

/** Enrich each enabled, KNOWN section with its data slice for `{% render %}`. */
export function sectionScopes(site: SiteData, files: PackageFiles) {
  return site.sections
    .filter((s) => s.enabled)
    // sections whose liquid file is missing are dropped BEFORE rendering:
    // a tenant's saved config can name a section this theme doesn't ship.
    .filter((s) => files.has(`sections/${s.type}.liquid`) || files.has(`sections/${s.type}`))
    .map((s) => {
      const sliceKey = SECTION_SLICE[s.type as SectionType];
      return sliceKey ? { ...s, [sliceKey]: site[sliceKey] } : { ...s };
    });
}

export function buildScope(ctx: RenderCtx, files: PackageFiles): Record<string, unknown> {
  const { site } = ctx;
  const sections = sectionScopes(site, files);
  return {
    business: site.business,
    meta: site.meta,
    hours: site.hours,
    products: site.products,
    services: site.services,
    gallery: site.gallery,
    testimonials: site.testimonials,
    sections,
    settings: resolveSettings(ctx.manifest, site.settings),
    pagination: site.pagination,
    filters: site.filters,
    agora: { href: ctx.agoraHref },
    ...(ctx.product ? { product: ctx.product } : {}),
  };
}

function guardOutput(html: string): string {
  if (html.length > PACKAGE_LIMITS.maxOutputBytes) {
    throw new Error("render: output over budget");
  }
  return html;
}

/** Render the site home (layout-wrapped) or a product detail page. */
export async function renderSite(files: PackageFiles, ctx: RenderCtx): Promise<string> {
  const liquid = createEngine(files);
  registerFilters(liquid, ctx);
  const scope = buildScope(ctx, files);

  const src = (name: string): string => {
    const v = files.get(name);
    if (typeof v === "string") return v;
    if (v) return new TextDecoder().decode(v);
    throw new Error(`render: ${name} missing`);
  };
  let body: string;
  if (ctx.product) {
    if (!files.has("templates/product.liquid")) return "";
    body = String(await liquid.parseAndRender(src("templates/product.liquid"), scope));
  } else {
    const entry = files.has("templates/home.liquid") ? "templates/home.liquid" : "index.liquid";
    body = String(await liquid.parseAndRender(src(entry), scope));
  }
  const html = String(await liquid.parseAndRender(src("layout.liquid"), { ...scope, content_for_layout: body }));
  return guardOutput(html);
}

/** Slot fragments map → final HTML. ALWAYS guarantees both reserved
 * containers (registry being empty today means they stay empty divs —
 * the injection point exists so the template contract never changes). */
export function injectSlots(html: string, fragments: Partial<Record<"floating-widget" | "footer-strip", string>>): string {
  let out = html.replace(new RegExp(`${SLOT_MARKER}(floating-widget|footer-strip)\\u0000`, "g"), (_m, id: string) => fragments[id as "floating-widget"] ?? "");
  for (const id of ["floating-widget", "footer-strip"] as const) {
    const want = `<div data-agora-slot="${id}">${fragments[id] ?? ""}</div>`;
    if (!out.includes(`<div data-agora-slot="${id}"`)) {
      // fixed position containers: floating rides the viewport bottom,
      // footer strip is page-flow inside the final <footer> if present.
      if (id === "footer-strip" && out.includes("</footer>")) {
        out = out.replace("</footer>", `${want}</footer>`);
      } else if (out.includes("</body>")) {
        out = out.replace("</body>", `${want}</body>`);
      }
    }
  }
  return out;
}
