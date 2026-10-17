/**
 * The one place that knows what "a blob WE minted" means. Stored image URLs
 * (product images, gallery, logo) must match this — validated on write and
 * re-checked on read — so the render pipeline never receives an arbitrary
 * remote URL, and the delete-cleanup paths never call del() on a URL that
 * isn't ours.
 */

/** Vercel Blob public URL shape (store-prefixed host, https). Same host
 * rules as the logo regex that predates this file (extracted, not new). */
export const BLOB_URL_RE =
  /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]+$/i;

export const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$|\.blob\.vercel-storage\.com$/i;

export function isOurBlobUrl(v: unknown): v is string {
  return typeof v === "string" && BLOB_URL_RE.test(v);
}

/** Only for URLs already known to be ours: the pathname under the store. */
export function blobPathname(url: string): string | null {
  try {
    const u = new URL(url);
    if (!BLOB_HOST_RE.test(u.hostname)) return null;
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return null;
  }
}

import { z } from "zod";

/** zod helper: array of our-blob URLs, capped. */
export function blobUrlArray(max: number) {
  return z
    .array(z.string().trim().regex(BLOB_URL_RE, "Images must be uploaded through Agora (only our blob host is accepted)"))
    .max(max, `At most ${max} image${max === 1 ? "" : "s"}`);
}
