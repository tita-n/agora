/**
 * Zod schemas for every tenant-content write (Phase 2.5). One module used
 * by every API route so caps/lengths/rules cannot drift between products and
 * services and gallery. Prices are kobo integers >= 0 (same unit rule as
 * Theme.price — never floats). All caps sourced from lib/content-limits.
 */
import { z } from "zod";
import { blobUrlArray } from "./blob-url";
import {
  MAX_PRODUCT_CATEGORY,
  MAX_PRODUCT_DESCRIPTION,
  MAX_PRODUCT_NAME,
  MAX_IMAGES_PER_PRODUCT,
  MAX_SERVICE_DESCRIPTION,
  MAX_SERVICE_NAME,
  MAX_PRICE_LABEL,
  MAX_GALLERY_CAPTION,
  MAX_TESTIMONIAL_AUTHOR,
  MAX_TESTIMONIAL_QUOTE,
} from "./content-limits";

const trimmed = (min: number, max: number, field: string) =>
  z
    .string()
    .trim()
    .min(min, `${field} is required`)
    .max(max, `${field} is too long (max ${max} characters)`);

const priceKobo = z
  .number({ invalid_type_error: "Price must be a number of naira" })
  .int("Price must be a whole amount")
  .min(0, "Price cannot be negative")
  .max(1_000_000_000, "That price is out of range");

const optionalPrice = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  priceKobo.optional()
);

const sortOrder = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : v),
  z.number().int().min(0).max(10000)
);

export const productInput = z
  .object({
    name: trimmed(1, MAX_PRODUCT_NAME, "Product name"),
    description: z
      .string()
      .trim()
      .max(MAX_PRODUCT_DESCRIPTION, `Description too long (max ${MAX_PRODUCT_DESCRIPTION})`)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    priceKobo: optionalPrice,
    category: z
      .string()
      .trim()
      .max(MAX_PRODUCT_CATEGORY, `Category too long (max ${MAX_PRODUCT_CATEGORY})`)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    inStock: z.preprocess((v) => v !== false, z.boolean()),
    sortOrder,
    imageUrls: blobUrlArray(MAX_IMAGES_PER_PRODUCT).default([]),
  })
  .strict();
export type ProductInput = z.infer<typeof productInput>;

export const productPatch = productInput.partial().extend({ id: z.string().min(1) }).strict();

export const serviceInput = z
  .object({
    name: trimmed(1, MAX_SERVICE_NAME, "Service name"),
    description: z
      .string()
      .trim()
      .max(MAX_SERVICE_DESCRIPTION, `Description too long (max ${MAX_SERVICE_DESCRIPTION})`)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    priceKobo: optionalPrice,
    priceLabel: z
      .string()
      .trim()
      .max(MAX_PRICE_LABEL, `Label too long (max ${MAX_PRICE_LABEL})`)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    sortOrder,
  })
  .strict();
export type ServiceInput = z.infer<typeof serviceInput>;

export const servicePatch = serviceInput.partial().extend({ id: z.string().min(1) }).strict();

export const galleryInput = z
  .object({
    url: z.string().trim().regex(/^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/\S+$/i, "Gallery images must be uploaded through Agora"),
    caption: z
      .string()
      .trim()
      .max(MAX_GALLERY_CAPTION, `Caption too long (max ${MAX_GALLERY_CAPTION})`)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
    sortOrder,
  })
  .strict();
export type GalleryInput = z.infer<typeof galleryInput>;

export const galleryPatch = z
  .object({ id: z.string().min(1), caption: galleryInput.shape.caption, sortOrder })
  .strict();

export const testimonialInput = z
  .object({
    authorName: trimmed(1, MAX_TESTIMONIAL_AUTHOR, "Author name"),
    quote: trimmed(1, MAX_TESTIMONIAL_QUOTE, "Quote"),
    sortOrder,
  })
  .strict();
export type TestimonialInput = z.infer<typeof testimonialInput>;

export const testimonialPatch = testimonialInput.partial().extend({ id: z.string().min(1) }).strict();

/** Reorder endpoint input: a full ordering of the business's item ids. */
export const reorderInput = z
  .object({
    kind: z.enum(["products", "services", "gallery", "testimonials"]),
    ids: z.array(z.string().min(1)).min(1).max(400),
  })
  .strict();

/** id used in DELETE/PATCH routes — opaque cuid, nothing more trusted. */
export const itemId = z.string().trim().regex(/^[a-z0-9]{10,40}$/, "Invalid id");
