/**
 * Hard caps for tenant content (Phase 2.5). ONE file, imported by every
 * write path — the API routes enforce these and the dashboard shows them in
 * helper text, so the number a user sees is the number that rejects them.
 *
 * They are also the first line of defence for the storage fair-use model:
 * a tenant cannot manufacture overage damage for the platform by creating
 * ten thousand image rows. The blob layer caps bytes per file separately.
 */
export const MAX_PRODUCTS = 300;
export const MAX_IMAGES_PER_PRODUCT = 5;
export const MAX_SERVICES = 60;
export const MAX_GALLERY_IMAGES = 40;
export const MAX_TESTIMONIALS = 40;

/** Field length caps — mirrored 1:1 by the DB CHECK constraints in
 * migration 20261017130000_phase25_content; change both together. */
export const MAX_PRODUCT_NAME = 120;
export const MAX_PRODUCT_DESCRIPTION = 1000;
export const MAX_PRODUCT_CATEGORY = 60;
export const MAX_SERVICE_NAME = 120;
export const MAX_SERVICE_DESCRIPTION = 1000;
export const MAX_PRICE_LABEL = 30;
export const MAX_GALLERY_CAPTION = 160;
export const MAX_TESTIMONIAL_AUTHOR = 80;
export const MAX_TESTIMONIAL_QUOTE = 400;
export const MAX_SOCIAL_URL = 300;
export const MAX_MAPS_URL = 400;

export const PAGE_SIZE_PRODUCTS = 24;
