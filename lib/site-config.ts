/**
 * siteConfig — the owner-facing section layout stored on Business (Json).
 * The OWNER decides WHICH sections appear and in what order; the THEME
 * decides how each renders. Validated with zod on write AND parsed
 * defensively on read (a drifted row must never take a tenant's site down).
 *
 * A stored config is normalized: unknown section types are dropped, missing
 * types are appended in DEFAULT_SECTION_ORDER (so adding a section type in a
 * later phase cannot produce "invisible" content on existing sites).
 */
import { z } from "zod";
import { normalizeHexColor } from "./color";

export const SECTION_TYPES = [
  "hero",
  "about",
  "products",
  "services",
  "gallery",
  "testimonials",
  "hours",
  "contact",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const DEFAULT_SECTION_ORDER: SectionType[] = [...SECTION_TYPES];

export const FONT_PAIR_KEYS = ["clean", "editorial", "grotesk"] as const;
export type FontPairKey = (typeof FONT_PAIR_KEYS)[number];

export const FONT_PAIR_LABELS: Record<FontPairKey, string> = {
  clean: "Clean — Inter for everything",
  editorial: "Editorial — Playfair headings, Inter body",
  grotesk: "Grotesk — Space Grotesk display, Inter body",
};

// type ALIASES, not interfaces: these shapes are stored in Prisma Json
// columns, and only aliases satisfy InputJsonValue structurally (a Json
// write of an interface type fails `tsc` against the REAL generated client —
// the any-typed sandbox stub cannot see it. See commit baf7ccc.)
export type SiteSectionConfig = {
  type: SectionType;
  enabled: boolean;
};

export type SiteConfig = {
  sections: SiteSectionConfig[];
  primaryColor: string; // normalized lowercase hex — validated before storage
  fontPairKey: FontPairKey;
  /** theme-package settings (engine `settings` scope) — opaque primitives,
   * keys validated against the package manifest at render, not here */
  themeSettings: Record<string, string | number | boolean>;
};

const sectionSchema = z
  .object({
    type: z.enum(SECTION_TYPES),
    enabled: z.boolean(),
  })
  .strict();

export const siteConfigSchema = z
  .object({
    sections: z.array(sectionSchema).min(1, "Pick at least one section").max(SECTION_TYPES.length * 2, "Too many sections"),
    primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #1a7f5a"),
    fontPairKey: z.enum(FONT_PAIR_KEYS),
    themeSettings: z
      .record(z.union([z.string().max(120), z.number(), z.boolean()]))
      .refine((r) => Object.keys(r).length <= 24, "Too many theme settings")
      .default({}),
  })
  .strict();

function sanitizeThemeSettings(raw: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 24)) {
      if (!/^[a-z][a-z0-9_]{1,30}$/.test(k)) continue;
      if (typeof v === "string" && v.length <= 120) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
      else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}

/** Write path: parse + normalize (dedupe section types, append missing). */
export function normalizeSections(sections: SiteSectionConfig[]): SiteSectionConfig[] {
  const seen = new Set<SectionType>();
  const out: SiteSectionConfig[] = [];
  for (const s of sections) {
    if (seen.has(s.type)) continue;
    seen.add(s.type);
    out.push({ type: s.type, enabled: s.enabled });
  }
  for (const t of DEFAULT_SECTION_ORDER) {
    if (!seen.has(t)) out.push({ type: t, enabled: true });
  }
  return out;
}

export function buildSiteConfig(input: z.input<typeof siteConfigSchema>): SiteConfig | null {
  const parsed = siteConfigSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    sections: normalizeSections(parsed.data.sections),
    primaryColor: normalizeHexColor(parsed.data.primaryColor) ?? "#111827",
    fontPairKey: parsed.data.fontPairKey,
    themeSettings: sanitizeThemeSettings(parsed.data.themeSettings),
  };
}

/** The config every site without a stored one gets: all sections on, the
 * theme's own defaults. `themePrimary` is the legacy Business.primaryColor. */
export function defaultSiteConfig(themePrimary?: string | null): SiteConfig {
  return {
    sections: normalizeSections(DEFAULT_SECTION_ORDER.map((type) => ({ type, enabled: true }))),
    primaryColor: normalizeHexColor(themePrimary) ?? "#111827",
    fontPairKey: "clean",
    themeSettings: {},
  };
}

/** Read path: never throws, never half-trusts. Anything off-contract falls
 * back to defaults for the broken FIELD, not the whole page. */
export function parseSiteConfig(raw: unknown, legacyPrimary?: string | null): SiteConfig {
  const base = defaultSiteConfig(legacyPrimary);
  if (typeof raw !== "object" || raw === null) return base;
  const r = raw as Record<string, unknown>;

  const sections: SiteSectionConfig[] = [];
  if (Array.isArray(r.sections)) {
    const seen = new Set<SectionType>();
    for (const item of r.sections) {
      const s = sectionSchema.safeParse(item);
      if (!s.success || seen.has(s.data.type)) continue;
      seen.add(s.data.type);
      sections.push({ type: s.data.type, enabled: s.data.enabled });
    }
  }
  const normalized = normalizeSections(
    sections.length > 0 ? sections : base.sections
  );

  const color = normalizeHexColor(typeof r.primaryColor === "string" ? r.primaryColor : null);
  const font = FONT_PAIR_KEYS.includes(r.fontPairKey as FontPairKey)
    ? (r.fontPairKey as FontPairKey)
    : base.fontPairKey;

  return { sections: normalized, primaryColor: color ?? base.primaryColor, fontPairKey: font, themeSettings: sanitizeThemeSettings(r.themeSettings) };
}

/** Sections to render for a site: enabled AND backed by content. */
export function visibleSections(config: SiteConfig, has: Record<SectionType, boolean>): SectionType[] {
  return config.sections.filter((s) => s.enabled && has[s.type]).map((s) => s.type);
}
