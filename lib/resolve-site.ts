/**
 * resolveSiteData — builds the theme contract payload from the database
 * (Phase 2.5). THE single read path for tenant rendering (subdomain page,
 * custom-domain page, metadata all share it, so what you see and what the
 * og-tags promise can never disagree).
 *
 * Hard rules encoded here:
 *  - explicit `select` on every query; content scoped by businessId;
 *  - EVERYTHING stored is re-validated at read: siteConfig/openingHours via
 *    their defensive parsers, image URLs against our blob host, social/map
 *    URLs through the same allowlist functions used at write time, whatsapp
 *    as a digits regex. A hand-edited row degrades to "that field doesn't
 *    exist" — it can never inject an href. Themes render these strings as
 *    plain React text.
 */
import { prisma } from "./prisma";
import { isOurBlobUrl } from "./blob-url";
import { normalizeSocialUrl, type SocialPlatform } from "./contacts";
import { parseOpeningHours } from "./opening-hours";
import { parseSiteConfig } from "./site-config";
import { MAX_IMAGES_PER_PRODUCT, PAGE_SIZE_PRODUCTS } from "./content-limits";
import type { SiteData, SiteGalleryImage, SiteProduct, SitePagination } from "./site-data";

const businessSelect = {
  id: true,
  name: true,
  description: true,
  logoUrl: true,
  primaryColor: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  whatsappNumber: true,
  instagramUrl: true,
  facebookUrl: true,
  tiktokUrl: true,
  mapsUrl: true,
  openingHours: true,
  siteConfig: true,
  theme: { select: { slug: true } },
} as const;

type BusinessRow = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  mapsUrl: string | null;
  openingHours: unknown;
  siteConfig: unknown;
  theme: { slug: string } | null;
};

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

function revalidateSocial(platform: SocialPlatform, stored: string | null): string | null {
  if (!stored) return null;
  const r = normalizeSocialUrl(platform, stored);
  return r.ok && r.url ? r.url : null;
}

export interface SiteQueryOpts {
  page?: string | number | null;
  category?: string | null;
}

export async function resolveSiteDataById(businessId: string, opts: SiteQueryOpts = {}): Promise<SiteData | null> {
  const business = (await prisma.business.findUnique({
    where: { id: businessId },
    select: businessSelect,
  })) as BusinessRow | null;
  if (!business) return null;

  const cat = typeof opts.category === "string" && opts.category.trim() ? opts.category.trim().slice(0, 60) : null;

  const pageSize = PAGE_SIZE_PRODUCTS;
  const start = (clampInt(opts.page, 1, 1_000_000, 1) - 1) * pageSize; // refined below once total is known

  // Content rows: explicit selects, business-scoped, stable ordering.
  const [productCount, productRows, serviceRows, galleryRows, testimonialRows, catRows] = await Promise.all([
    prisma.product.count({ where: { businessId, ...(cat ? { category: cat } : {}) } }),
    prisma.product.findMany({
      where: { businessId, ...(cat ? { category: cat } : {}) },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      // the grid page only — one big catalog never all rides one render
      skip: start,
      take: pageSize,
      select: { id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true },
    }),
    prisma.service.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, name: true, description: true, priceKobo: true, priceLabel: true },
    }),
    prisma.galleryImage.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, url: true, caption: true },
    }),
    prisma.testimonial.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, authorName: true, quote: true },
    }),
    // Categories from the WHOLE catalog (chips never disappear mid-pagination).
    prisma.product.findMany({ where: { businessId }, select: { category: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
  ]);

  // Grid pagination is server-side by construction: a 300-product owner
  // cannot make every page view heavy (one big catalog is 24 at a time).
  // Clamp out-of-range pages to the last one and RE-SLICE in memory (the
  // fetch above used the requested offset — at MAX_PRODUCTS a full list is
  // bounded, so clamping by slice costs nothing and never 302s a bookmark).
  const totalPages = Math.max(1, Math.ceil(productCount / pageSize));
  const page = clampInt(opts.page, 1, totalPages, 1);
  const clampedStart = (page - 1) * pageSize;

  const windowRows: { id: string; name: string; description: string | null; priceKobo: number | null; category: string | null; inStock: boolean; imageUrls: string[] }[] =
    clampedStart === start
      ? (productRows as never)
      : (
          await prisma.product.findMany({
            where: { businessId, ...(cat ? { category: cat } : {}) },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            skip: clampedStart,
            take: pageSize,
            select: { id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true },
          })
        );

  const products: SiteProduct[] = (windowRows as { id: string; name: string; description: string | null; priceKobo: number | null; category: string | null; inStock: boolean; imageUrls: string[] }[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    priceKobo: typeof p.priceKobo === "number" && p.priceKobo >= 0 ? Math.floor(p.priceKobo) : null,
    category: p.category,
    inStock: p.inStock !== false,
    imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls.filter(isOurBlobUrl).slice(0, MAX_IMAGES_PER_PRODUCT) : [],
  }));

  const categories: string[] = [];
  const seen = new Set<string>();
  for (const r of catRows as { category: string | null }[]) {
    if (r.category && !seen.has(r.category)) {
      seen.add(r.category);
      categories.push(r.category);
    }
  }

  const pagination: SitePagination | null =
    productCount > 0 ? { page, pageSize, totalItems: productCount, totalPages } : null;

  return {
    themeKey: business.theme?.slug ?? "minimal",
    business: {
      name: business.name,
      description: business.description,
      logoUrl: isOurBlobUrl(business.logoUrl) ? business.logoUrl : null,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone,
      address: business.address,
      whatsappDigits: typeof business.whatsappNumber === "string" && /^[1-9]\d{7,14}$/.test(business.whatsappNumber) ? business.whatsappNumber : null,
      instagramUrl: revalidateSocial("instagram", business.instagramUrl),
      facebookUrl: revalidateSocial("facebook", business.facebookUrl),
      tiktokUrl: revalidateSocial("tiktok", business.tiktokUrl),
      mapsUrl: typeof business.mapsUrl === "string" && /^https:\/\/\S+$/.test(business.mapsUrl) ? business.mapsUrl : null,
      openingHours: parseOpeningHours(business.openingHours),
    },
    config: parseSiteConfig(business.siteConfig, business.primaryColor),
    products,
    categories,
    activeCategory: cat,
    services: (serviceRows as { id: string; name: string; description: string | null; priceKobo: number | null; priceLabel: string | null }[]).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      priceKobo: typeof s.priceKobo === "number" && s.priceKobo >= 0 ? Math.floor(s.priceKobo) : null,
      priceLabel: s.priceLabel,
    })),
    gallery: (galleryRows as { id: string; url: string; caption: string | null }[]).map((g) => ({
      id: g.id,
      url: g.url,
      caption: g.caption,
    })).filter((g): g is SiteGalleryImage => isOurBlobUrl(g.url)),
    testimonials: (testimonialRows as { id: string; authorName: string; quote: string }[]).map((t) => ({
      id: t.id,
      authorName: t.authorName,
      quote: t.quote,
    })),
    pagination,
  };
}

/** SEO metadata inputs (title/description/og) — minimal extra query. */
export async function loadSiteMeta(businessId: string) {
  const b = (await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, description: true, logoUrl: true },
  })) as { name: string; description: string | null; logoUrl: string | null } | null;
  if (!b) return null;
  return { name: b.name, description: b.description, logoUrl: isOurBlobUrl(b.logoUrl) ? b.logoUrl : null };
}
