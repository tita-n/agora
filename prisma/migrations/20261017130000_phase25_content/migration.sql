-- Phase 2.5 — content model + theme presentation keys.
-- Hand-reconciled against prisma/schema.prisma (2026-10-17). CHECK
-- constraints mirror lib/content-limits.ts + lib/content-schema.ts exactly;
-- if you change one side, change the other.

-- AlterTable: Business contact/social/hours/config columns (all nullable —
-- existing sites keep rendering with theme defaults).
ALTER TABLE "Business" ADD COLUMN     "whatsappNumber" TEXT,
ADD COLUMN     "instagramUrl" TEXT,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "openingHours" JSONB,
ADD COLUMN     "siteConfig" JSONB;

-- WhatsApp stores ONLY normalized digits with country code; social/maps are
-- https-only. These checks make a hand-edited row impossible, so the render
-- path's re-validation is defense in depth, not the only gate.
ALTER TABLE "Business" ADD CONSTRAINT "Business_whatsapp_digits" CHECK ("whatsappNumber" IS NULL OR "whatsappNumber" ~ '^[0-9]{8,15}$');
ALTER TABLE "Business" ADD CONSTRAINT "Business_instagram_https" CHECK ("instagramUrl" IS NULL OR "instagramUrl" ~ '^https://');
ALTER TABLE "Business" ADD CONSTRAINT "Business_facebook_https" CHECK ("facebookUrl" IS NULL OR "facebookUrl" ~ '^https://');
ALTER TABLE "Business" ADD CONSTRAINT "Business_tiktok_https" CHECK ("tiktokUrl" IS NULL OR "tiktokUrl" ~ '^https://');
ALTER TABLE "Business" ADD CONSTRAINT "Business_maps_https" CHECK ("mapsUrl" IS NULL OR "mapsUrl" ~ '^https://');

-- AlterTable: Theme.templateKey — existing rows (the single "Minimal" theme)
-- backfill through the column default, which is exactly the value they must
-- keep: Minimal stays the fallback presentation for every current business.
ALTER TABLE "Theme" ADD COLUMN     "templateKey" TEXT NOT NULL DEFAULT 'minimal';
UPDATE "Theme" SET "templateKey" = 'minimal' WHERE "templateKey" = '' OR "templateKey" IS NULL;
CREATE INDEX "Theme_templateKey_idx" ON "Theme"("templateKey");

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceKobo" INTEGER,
    "category" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Product_name_len" CHECK (char_length("name") BETWEEN 1 AND 120),
    CONSTRAINT "Product_desc_len" CHECK ("description" IS NULL OR char_length("description") <= 1000),
    CONSTRAINT "Product_category_len" CHECK ("category" IS NULL OR char_length("category") BETWEEN 1 AND 60),
    CONSTRAINT "Product_price_nonneg" CHECK ("priceKobo" IS NULL OR "priceKobo" >= 0),
    CONSTRAINT "Product_images_cap" CHECK (coalesce(array_length("imageUrls", 1), 0) <= 5),
    CONSTRAINT "Product_image_urls" CHECK (coalesce(array_length("imageUrls", 1), 0) = 0 OR NOT EXISTS (
        SELECT 1 FROM unnest("imageUrls") AS u WHERE u NOT LIKE 'https://%'
    ))
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceKobo" INTEGER,
    "priceLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Service_name_len" CHECK (char_length("name") BETWEEN 1 AND 120),
    CONSTRAINT "Service_desc_len" CHECK ("description" IS NULL OR char_length("description") <= 1000),
    CONSTRAINT "Service_price_nonneg" CHECK ("priceKobo" IS NULL OR "priceKobo" >= 0),
    CONSTRAINT "Service_price_label_len" CHECK ("priceLabel" IS NULL OR char_length("priceLabel") BETWEEN 1 AND 30)
);

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GalleryImage_url_https" CHECK ("url" LIKE 'https://%'),
    CONSTRAINT "GalleryImage_caption_len" CHECK ("caption" IS NULL OR char_length("caption") BETWEEN 1 AND 160)
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Testimonial_author_len" CHECK (char_length("authorName") BETWEEN 1 AND 80),
    CONSTRAINT "Testimonial_quote_len" CHECK (char_length("quote") BETWEEN 1 AND 400)
);

-- CreateIndex
CREATE INDEX "Product_businessId_idx" ON "Product"("businessId");
CREATE INDEX "Product_businessId_sortOrder_idx" ON "Product"("businessId", "sortOrder");
CREATE INDEX "Service_businessId_idx" ON "Service"("businessId");
CREATE INDEX "Service_businessId_sortOrder_idx" ON "Service"("businessId", "sortOrder");
CREATE INDEX "GalleryImage_businessId_idx" ON "GalleryImage"("businessId");
CREATE INDEX "GalleryImage_businessId_sortOrder_idx" ON "GalleryImage"("businessId", "sortOrder");
CREATE INDEX "Testimonial_businessId_idx" ON "Testimonial"("businessId");
CREATE INDEX "Testimonial_businessId_sortOrder_idx" ON "Testimonial"("businessId", "sortOrder");

-- AddForeignKey (all: tenant content dies with the business — CASCADE)
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
