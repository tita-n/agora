/**
 * SiteData contract v1 — the ONLY shape a template package may receive
 * (docs/TEMPLATE_SPEC.md). PURE MODULE: imports nothing from next/*, react,
 * or @prisma/* (enforced by scripts/engine-units.ts) so it can ship later
 * as part of a standalone npm package for template authors.
 *
 * Every field is defensive-by-construction: arrays default empty, strings
 * arrive pre-validated, hours arrive pre-formatted, WhatsApp links arrive
 * pre-built. A template rendering `fixtures/empty.json` must work exactly
 * as well as one rendering a full business.
 */
import { z } from "zod";

// ── primitives ────────────────────────────────────────────────────────────

/** WhatsApp deep link builder (server-side only — templates never build
 * URLs). `^1?[0-9]` guard rejects leading-zero junk the same way the
 * platform's read-validation does. */
export function buildWaLink(digits: string | null | undefined, text: string): string | null {
  if (!digits || !/^[1-9]\d{7,14}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Kobo → "₦1,234" (or "from ₦1,234" with a priceLabel). */
export function formatKobo(kobo: number, label?: string | null): string {
  const naira = Math.round(kobo / 100).toLocaleString("en-NG");
  const base = `₦${naira}`;
  return label ? `${label} ${base}` : base;
}

// ── the contract ──────────────────────────────────────────────────────────

export const hoursEntrySchema = z.object({
  day: z.string(), // "Monday"
  closed: z.boolean(),
  open: z.string().optional(), // "09:30"
  close: z.string().optional(), // "18:00"
});
export type SiteHoursEntry = z.infer<typeof hoursEntrySchema>;

export const sectionTypes = [
  "hero", "about", "products", "services", "gallery", "testimonials", "hours", "contact",
] as const;
export const sectionSchema = z.object({
  type: z.enum(sectionTypes),
  enabled: z.boolean(),
});

export const siteDataSchema = z.object({
  business: z.object({
    name: z.string().min(1).max(120),
    tagline: z.string().max(160).optional(),
    description: z.string().max(2000).optional(),
    // image refs: absolute https OR a package asset filename (engine resolves;
    // loaders guarantee blob-host https for everything tenant-supplied)
    logoUrl: z.string().min(4).max(400).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().max(40).optional(),
    address: z.string().max(300).optional(),
    whatsappUrl: z.string().url().optional(),
    instagramUrl: z.string().url().optional(),
    facebookUrl: z.string().url().optional(),
    tiktokUrl: z.string().url().optional(),
    mapsUrl: z.string().url().optional(),
  }),
  meta: z
    .object({
      title: z.string().max(120).default("Site"),
      description: z.string().max(300).optional(),
      canonicalUrl: z.string().url().optional(),
      ogImageUrl: z.string().url().optional(),
    })
    .default({ title: "Site" }),
  hours: z.array(hoursEntrySchema).max(7).default([]),
  sections: z.array(sectionSchema).default([]),
  products: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(120),
        description: z.string().max(1000).optional(),
        priceKobo: z.number().int().nonnegative().optional(),
        priceLabel: z.string().max(20).optional(),
        price: z.string().optional(), // pre-formatted; "" when no price
        category: z.string().max(60).optional(),
        inStock: z.boolean().default(true),
        imageUrls: z.array(z.string().min(4).max(400)).max(5).default([]),
        waLink: z.string().url().optional(),
        url: z.string().max(300).optional(), // detail-page path (relative)
      })
    )
    .default([]),
  services: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(120),
        description: z.string().max(1000).optional(),
        priceKobo: z.number().int().nonnegative().optional(),
        priceLabel: z.string().max(20).optional(),
        price: z.string().optional(),
        waLink: z.string().url().optional(),
      })
    )
    .default([]),
  gallery: z
    .array(
      z.object({
        id: z.string(),
        url: z.string().min(4).max(400),
        alt: z.string().max(160),
        caption: z.string().max(200).optional(),
      })
    )
    .default([]),
  testimonials: z
    .array(
      z.object({
        id: z.string(),
        authorName: z.string().max(80),
        quote: z.string().max(400),
      })
    )
    .default([]),
  settings: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
  pagination: z
    .object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().default(24),
      total: z.number().int().nonnegative().default(0),
      pages: z.number().int().nonnegative().default(1),
      prevHref: z.string().optional(),
      nextHref: z.string().optional(),
    })
    .default({ page: 1, pageSize: 24, total: 0, pages: 1 }),
  filters: z
    .object({
      categories: z.array(z.string().max(60)).default([]),
      active: z.string().max(60).optional(),
    })
    .default({ categories: [] }),
});
export type SiteData = z.infer<typeof siteDataSchema>;

/** The minimal "name only" shape every site must render under. */
export const EMPTY_SITE_DATA: SiteData = siteDataSchema.parse({
  business: { name: "Test Business" },
});

export type SectionType = (typeof sectionTypes)[number];

/** Section slice keys the renderer attaches per section type. */
export const SECTION_SLICE: Partial<Record<(typeof sectionTypes)[number], "products" | "services" | "gallery" | "testimonials">> = {
  products: "products",
  services: "services",
  gallery: "gallery",
  testimonials: "testimonials",
};

/** Format the platform's {monday: {...}} openingHours JSON into the
 * ordered, display-ready hours array of the contract. Defensive: anything
 * unrecognised is skipped, never thrown. */
export function formatHours(raw: unknown): SiteHoursEntry[] {
  const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const out: SiteHoursEntry[] = [];
  for (let i = 0; i < 7; i++) {
    const key = WEEK[i].toLowerCase();
    const v = (raw as Record<string, unknown>)[key];
    if (!v || typeof v !== "object") continue;
    const o = v as { closed?: unknown; open?: unknown; close?: unknown };
    if (o.closed === true) {
      out.push({ day: WEEK[i], closed: true });
    } else if (typeof o.open === "string" && typeof o.close === "string") {
      out.push({ day: WEEK[i], closed: false, open: o.open, close: o.close });
    }
  }
  return out;
}
