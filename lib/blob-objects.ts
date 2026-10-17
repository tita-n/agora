/**
 * Blob cleanup for content writes (Phase 2.5). The rule the README runbook
 * promises: files are deleted strictly AFTER the database has moved on —
 * delete a product: update rows first, then del(); replace images: persist
 * the new set first, then del() the removed ones. A failed del() is logged
 * and never fails the user's request (a stale file costs a fraction of a
 * kobo; a lost product row is a support ticket).
 */
import { del } from "@vercel/blob";
import { isOurBlobUrl, blobPathname } from "./blob-url";

/** Only our own store, and only tenant-upload prefixes (defense against a
 * malformed row pointing del() at something we shouldn't touch). */
function deletablePath(url: string): boolean {
  const p = blobPathname(url);
  return p !== null && /^(logos|products|gallery)\//.test(p);
}

export async function deleteBlobsAfterWrite(urls: (string | null | undefined)[], logTag: string): Promise<void> {
  const ours = [...new Set(urls.filter((u): u is string => isOurBlobUrl(u) && deletablePath(u)))];
  if (ours.length === 0) return;
  await Promise.all(
    ours.map(async (url) => {
      try {
        await del(url);
      } catch (err) {
        console.warn(
          `[${logTag}] could not delete ${blobPathname(url) ?? "blob"} after db update:`,
          err instanceof Error ? err.message : err
        );
      }
    })
  );
}
