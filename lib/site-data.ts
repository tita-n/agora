/**
 * SiteData — THE theme contract payload (Phase 2.5). Plain, serialized data
 * only: no Prisma types, no User, no session, no functions. `lib/resolve-
 * site.ts` builds it (DB + validation), pages pass it to a theme, and
 * themes receive exactly one prop. Nothing between those steps is client-
 * controlled. Because every string in here renders as React text, the only
 * URL-shaped fields (images, social links, maps, wa.me) have each been put
 * through their own validator on the way in — and are re-validated on read
 * in resolve-site, so a hand-edited row still cannot produce an unsafe href.
 */
import type { SiteConfig } from "./site-config";
import type { OpeningHours } from "./opening-hours";

export interface SiteProduct {
  id: string;
  name: string;
  description: string | null;
  /** kobo; null = "price on request" */
  priceKobo: number | null;
  category: string | null;
  inStock: boolean;
  /** already validated blob URLs (max 5) */
  imageUrls: string[];
}

export interface SiteService {
  id: string;
  name: string;
  description: string | null;
  priceKobo: number | null;
  priceLabel: string | null;
}

export interface SiteGalleryImage {
  id: string;
  url: string;
  caption: string | null;
}

export interface SiteTestimonial {
  id: string;
  authorName: string;
  quote: string;
}

export interface SiteBusiness {
  name: string;
  description: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  /** normalized digits, validated at read; null = no usable number */
  whatsappDigits: string | null;
  /** already-validated https links on the platform allowlist, or null */
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  mapsUrl: string | null;
  openingHours: OpeningHours | null;
}

export interface SitePagination {
  page: number; // 1-based
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SiteData {
  themeKey: string;
  business: SiteBusiness;
  config: SiteConfig;
  products: SiteProduct[];
  /** all category values present, in first-appearance order (filter chips) */
  categories: string[];
  /** the ?cat= filter currently applied, null = all */
  activeCategory: string | null;
  services: SiteService[];
  gallery: SiteGalleryImage[];
  testimonials: SiteTestimonial[];
  /** set when the products section paginates */
  pagination: SitePagination | null;
}

/** ₦ display for a kobo price; null → "Price on request". */
export function priceText(kobo: number | null, label?: string | null): string {
  if (kobo === null || kobo === undefined) return "Price on request";
  const naira = (kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 });
  const s = `₦${naira}`;
  return label ? `${label} ${s}` : s;
}
