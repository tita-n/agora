import { put as blobPut } from "@vercel/blob";
import { isOurBlobUrl } from "@/lib/blob-url";

/**
 * Storage interface for immutable template packages (R2-swappable, per
 * docs/ARCHITECTURE.md). The DB stores the public blob URL as
 * ThemeVersion.storageKey; fetchPackage re-validates the host on EVERY read
 * (belt for rows written before/after any policy change).
 */
export interface ThemePackageStorage {
  /** store + return the public URL (immutable: keys are never overwritten) */
  storePackage(preferredPath: string, bytes: Uint8Array): Promise<string>;
  fetchPackage(url: string): Promise<Uint8Array>;
}

const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;

export const blobPackageStorage: ThemePackageStorage = {
  async storePackage(preferredPath, bytes) {
    const res = await blobPut(preferredPath, bytes as unknown as ArrayBuffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/zip",
    });
    if (!isOurBlobUrl(res.url)) throw new Error("storage: unexpected blob host");
    return res.url;
  },
  async fetchPackage(url) {
    // public read straight off the (host-validated) URL — no SDK round trip
    if (!isOurBlobUrl(url)) throw new Error("storage: refusing fetch off the blob host");
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`storage: fetch ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_PACKAGE_BYTES) throw new Error("storage: package over size ceiling");
    return new Uint8Array(buf);
  },
};

export const storage: ThemePackageStorage = blobPackageStorage;
