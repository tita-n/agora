/**
 * resolveSiteData — builds the SiteData v1 contract payload from the
 * database. THE single read path for tenant rendering (subdomain routes,
 * custom domains and previews share it, so what renders and what the og
 * tags promise can never disagree).
 *
 * Hard rules encoded here (unchanged from Phase 2.5):
 *  - explicit `select` on every query; content scoped by businessId;
 *  - EVERYTHING stored is re-validated at read: siteConfig/openingHours via
 *    their defensive parsers, image URLs against our blob host, social/map
 *    URLs through the write-time allowlist functions, WhatsApp as a digits
 *    regex. A hand-edited row degrades to "that field doesn't exist" — it
 *    can never inject an href.
 *  - WhatsApp links are built HERE (server-side, absolute https), templates
 *    only print them.
 */
import { prisma } from "./prisma";
import { isOurBlobUrl } from "./blob-url";
import { normalizeSocialUrl, type SocialPlatform } from "./contacts";
import { parseOpeningHours } from "./opening-hours";
import { parseSiteConfig } from "./site-config";
import { MAX_IMAGES_PER_PRODUCT, PAGE_SIZE_PRODUCTS } from "./content-limits";
import {
  buildWaLink,
  formatKobo,
  formatHours,
  siteDataSchema,
  type SiteData,
} from "@/core/agora-engine/site-data";

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
};

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

function revalidateSocial(platform: SocialPlatform, stored: string | null): string | undefined {
  if (!stored) return undefined;
  const r = normalizeSocialUrl(platform, stored);
  return r.ok && r.url ? r.url : undefined;
}

const digitsOrNull = (v: string | null): string | null =>
  typeof v === "string" && /^[1-9]\d{7,14}$/.test(v) ? v : null;

export interface SiteQueryOpts {
  page?: string | number | null;
  category?: string | null;
  /** request host — feeds meta.canonicalUrl so SEO tags agree with the URL */
  host?: string | null;
}

const productSelect = {
  id: true, name: true, description: true, priceKobo: true, category: true, inStock: true, imageUrls: true,
} as const;
type ProductRow = { id: string; name: string; description: string | null; priceKobo: number | null; category: string | null; inStock: boolean; imageUrls: string[] };

function mapProduct(p: ProductRow, shopName: string, whatsapp: string | null): SiteData["products"][number] {
  const price = typeof p.priceKobo === "number" && p.priceKobo >= 0 ? p.priceKobo : null;
  return {
    id: p.id,
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(price !== null ? { priceKobo: price } : {}),
    ...(price !== null ? { price: formatKobo(price) } : {}),
    ...(p.category ? { category: p.category } : {}),
    inStock: p.inStock !== false,
    imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls.filter(isOurBlobUrl).slice(0, MAX_IMAGES_PER_PRODUCT) : [],
    ...(buildWaLink(whatsapp, `Hi ${shopName}, I'd like to order: ${p.name}`) ? { waLink: buildWaLink(whatsapp, `Hi ${shopName}, I'd like to order: ${p.name}`)! } : {}),
    url: `/p/${p.id}`,
  };
}

export async function resolveSiteDataById(businessId: string, opts: SiteQueryOpts = {}): Promise<SiteData | null> {
  const business = (await prisma.business.findUnique({
    where: { id: businessId },
    select: businessSelect,
  })) as BusinessRow | null;
  if (!business) return null;

  const cat = typeof opts.category === "string" && opts.category.trim() ? opts.category.trim().slice(0, 60) : null;
  const whatsapp = digitsOrNull(business.whatsappNumber);
  const config = parseSiteConfig(business.siteConfig, business.primaryColor);

  const pageSize = PAGE_SIZE_PRODUCTS;
  const start = (clampInt(opts.page, 1, 1_000_000, 1) - 1) * pageSize;

  const [productCount, productRows, serviceRows, galleryRows, testimonialRows, catRows] = await Promise.all([
    prisma.product.count({ where: { businessId, ...(cat ? { category: cat } : {}) } }),
    prisma.product.findMany({
      where: { businessId, ...(cat ? { category: cat } : {}) },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      skip: start,
      take: pageSize,
      select: productSelect,
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
    prisma.product.findMany({ where: { businessId }, select: { category: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
  ]);

  // server-side pagination clamp: out-of-range pages re-fetch at the last
  // real page (never 302, never mis-slice) — Phase 2.5 behavior, kept.
  const totalPages = Math.max(1, Math.ceil(productCount / pageSize));
  const page = clampInt(opts.page, 1, totalPages, 1);
  const clampedStart = (page - 1) * pageSize;
  const windowRows: ProductRow[] =
    clampedStart === start
      ? (productRows as ProductRow[])
      : ((await prisma.product.findMany({
          where: { businessId, ...(cat ? { category: cat } : {}) },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          skip: clampedStart,
          take: pageSize,
          select: productSelect,
        })) as ProductRow[]);

  const products = windowRows.map((p) => mapProduct(p, business.name, whatsapp));

  const categories: string[] = [];
  const seen = new Set<string>();
  for (const r of catRows as { category: string | null }[]) {
    if (r.category && !seen.has(r.category)) {
      seen.add(r.category);
      categories.push(r.category);
    }
  }

  const pageLink = (n: number) => {
    const params = new URLSearchParams();
    if (n > 1) params.set("page", String(n));
    if (cat) params.set("category", cat);
    const qs = params.toString();
    return qs ? `?${qs}` : "./";
  };

  const hours = formatHours(parseOpeningHours(business.openingHours));

  const meta = {
    title: business.name.slice(0, 120),
    ...(business.description ? { description: business.description.slice(0, 300) } : {}),
    ...(opts.host ? { canonicalUrl: `https://${opts.host}/` } : {}),
    ...(isOurBlobUrl(business.logoUrl) ? { ogImageUrl: business.logoUrl } : {}),
  };

  return siteDataSchema.parse({
    business: {
      name: business.name,
      ...(business.description ? { tagline: undefined, description: business.description.slice(0, 2000) } : {}),
      ...(isOurBlobUrl(business.logoUrl) ? { logoUrl: business.logoUrl } : {}),
      ...(business.contactEmail ? { contactEmail: business.contactEmail } : {}),
      ...(business.contactPhone ? { contactPhone: business.contactPhone } : {}),
      ...(business.address ? { address: business.address } : {}),
      ...(buildWaLink(whatsapp, `Hi ${business.name}, I found your site on Agora`) ? { whatsappUrl: buildWaLink(whatsapp, `Hi ${business.name}, I found your site on Agora`) } : {}),
      ...(revalidateSocial("instagram", business.instagramUrl) ? { instagramUrl: revalidateSocial("instagram", business.instagramUrl) } : {}),
      ...(revalidateSocial("facebook", business.facebookUrl) ? { facebookUrl: revalidateSocial("facebook", business.facebookUrl) } : {}),
      ...(revalidateSocial("tiktok", business.tiktokUrl) ? { tiktokUrl: revalidateSocial("tiktok", business.tiktokUrl) } : {}),
      ...(business.mapsUrl && /^https:\/\/\S+$/.test(business.mapsUrl) ? { mapsUrl: business.mapsUrl } : {}),
    },
    meta,
    hours,
    sections: config.sections,
    products,
    services: (serviceRows as { id: string; name: string; description: string | null; priceKobo: number | null; priceLabel: string | null }[]).map((s) => {
      const price = typeof s.priceKobo === "number" && s.priceKobo >= 0 ? s.priceKobo : null;
      const wa = buildWaLink(whatsapp, `Hi ${business.name}, I'd like to book: ${s.name}`);
      return {
        id: s.id,
        name: s.name,
        ...(s.description ? { description: s.description } : {}),
        ...(price !== null ? { priceKobo: price, price: formatKobo(price, s.priceLabel) } : {}),
        ...(s.priceLabel ? { priceLabel: s.priceLabel } : {}),
        ...(wa ? { waLink: wa } : {}),
      };
    }),
    gallery: (galleryRows as { id: string; url: string; caption: string | null }[])
      .filter((g) => isOurBlobUrl(g.url))
      .map((g, i) => ({
        id: g.id,
        url: g.url,
        alt: (g.caption ?? `${business.name} photo ${i + 1}`).slice(0, 160),
        ...(g.caption ? { caption: g.caption } : {}),
      })),
    testimonials: (testimonialRows as { id: string; authorName: string; quote: string }[]).map((t) => ({
      id: t.id,
      authorName: t.authorName,
      quote: t.quote,
    })),
    settings: {
      primary_color: config.primaryColor,
      font_pair: config.fontPairKey,
      ...(config.themeSettings ?? {}),
    },
    pagination: {
      page,
      pageSize,
      total: productCount,
      pages: totalPages,
      ...(page > 1 ? { prevHref: pageLink(page - 1) } : {}),
      ...(page < totalPages ? { nextHref: pageLink(page + 1) } : {}),
    },
    filters: {
      categories,
      ...(cat ? { active: cat } : {}),
    },
  });
}

/** Product detail lookup (id may sit OUTSIDE the current listing page). */
export async function resolveSiteProduct(businessId: string, productId: string) {
  const [p, business] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, businessId }, select: productSelect }),
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true, whatsappNumber: true } }),
  ]);
  if (!p || !business) return null;
  return mapProduct(p as ProductRow, business.name, digitsOrNull(business.whatsappNumber as string | null));
}

/** SEO metadata inputs for redirects/canonical checks — minimal extra query. */
export async function loadSiteMeta(businessId: string) {
  const b = (await prisma.business.findUnique({
    where: { id: businessId },
    select: { name: true, description: true, logoUrl: true },
  })) as { name: string; description: string | null; logoUrl: string | null } | null;
  if (!b) return null;
  return { name: b.name, description: b.description, logoUrl: isOurBlobUrl(b.logoUrl) ? b.logoUrl : null };
}
