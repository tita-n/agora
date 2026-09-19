/**
 * Exact per-business Blob storage measurement (Phase 2) — works on ANY
 * plan because it uses the Blob SDK's `list` with the store's read token
 * (BLOB_READ_WRITE_TOKEN), no Analytics entitlement involved.
 *
 * Attribution rule: today every upload lands under `logos/<userId>/`
 * (enforced by /api/blob/token). Storage is therefore measured per OWNER
 * and attributed to that owner's business — the same one-business-per-owner
 * assumption the upload token route already documents. When multi-business
 * owners arrive, the upload prefix moves to `logos/<businessId>/` and this
 * function changes its key, not its logic.
 *
 * Unit: decimal GB (bytes / 1e9), matching Vercel's own storage accounting
 * and the overage module's convention.
 */
import { list } from "@vercel/blob";
import { env } from "@/lib/env";

const BYTES_PER_GB = 1e9;

export type BlobStorageOutcome =
  | { status: "ok"; bytes: number; blobs: number }
  | { status: "unconfigured" }
  | { status: "unavailable"; reason: string };

export async function ownerBlobBytes(ownerId: string): Promise<BlobStorageOutcome> {
  if (!env.BLOB_READ_WRITE_TOKEN) return { status: "unconfigured" };
  try {
    // Manual pagination (the SDK exposes `list`; `listAll` is not exported
    // in this major). Safety cap: at store limits the store is small by
    // design — if a future store isn't, capped-and-flagged beats runaway.
    const CAP = 100; // 100 pages × 1000 blobs = 100k objects
    let bytes = 0;
    let count = 0;
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list({ prefix: `logos/${ownerId}/`, cursor, limit: 1000 });
      for (const blob of page.blobs) {
        bytes += Number.isFinite(blob.size) && blob.size > 0 ? blob.size : 0;
        count++;
      }
      cursor = page.hasMore ? page.cursor : undefined;
      pages++;
    } while (cursor && pages < CAP);
    if (cursor && pages >= CAP) {
      console.warn(`[blob-meter] ${ownerId}: capped at ${CAP} pages — total size may be UNDER-counted`);
    }
    return { status: "ok", bytes, blobs: count };
  } catch (err) {
    return {
      status: "unavailable",
      reason: err instanceof Error ? err.message : "blob list failed",
    };
  }
}

export function bytesToGb(bytes: number): number {
  return bytes / BYTES_PER_GB;
}
