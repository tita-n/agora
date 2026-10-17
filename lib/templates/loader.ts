import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { unzipSync, zipSync } from "fflate";
import { prisma } from "@/lib/prisma";
import type { PackageFiles, ThemeManifest } from "@/core/agora-engine";
import { themeManifestSchema } from "@/core/agora-engine";
import { storage } from "./storage";

/**
 * Load a ThemeVersion's package into a file map + parsed manifest.
 *
 *  - storageKey "local:<slug>" (dev seed + Vercel preview builds ONLY) reads
 *    themes-packages/<slug> straight from the repo checkout — that is what
 *    lets demos and preview iframes work before blobs exist. Production
 *    refuses local: keys (see localModeAllowed at the fetch point).
 *  - Otherwise: fetch the immutable zip from blob storage, VERIFY its
 *    sha256 against ThemeVersion.checksum (a corrupted/tampered object fails
 *    closed — never a silent fallback), unzip into the map.
 * In-process cache keyed by versionId — versions are immutable, so a cached
 * entry never goes stale except by process restart.
 */

export const PACKAGES_ROOT = path.join(process.cwd(), "themes-packages");

export type LoadedPackage = { files: PackageFiles; manifest: ThemeManifest; versionId: string };

const cache = new Map<string, LoadedPackage>();
const CACHE_MAX = 24;

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function zipPackageFiles(files: PackageFiles): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of files) entries[k] = typeof v === "string" ? new TextEncoder().encode(v) : v;
  return zipSync(entries, { level: 6 });
}

function putInMap(files: PackageFiles, name: string, bytes: Uint8Array): void {
  const texty = /\.(liquid|css|json|txt|md)$/i.test(name);
  files.set(name, texty ? new TextDecoder().decode(bytes) : bytes);
}

export function readLocalPackage(slug: string): PackageFiles {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) throw new Error("loader: bad local slug");
  const root = path.join(PACKAGES_ROOT, slug);
  if (!fs.existsSync(root)) throw new Error("loader: package directory missing");
  const files: PackageFiles = new Map();
  const walk = (dir: string, rel = "") => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), relPath);
      else putInMap(files, relPath, new Uint8Array(fs.readFileSync(path.join(dir, ent.name))));
    }
  };
  walk(root);
  return files;
}

/** The checksum seed/publish agree on: sha256 over the ZIP bytes. */
export function packageChecksum(files: PackageFiles): string {
  return sha256(zipPackageFiles(files));
}

export function localModeAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}

function parseManifest(files: PackageFiles): ThemeManifest {
  const manifestRaw = files.get("theme.json");
  const text = typeof manifestRaw === "string" ? manifestRaw : new TextDecoder().decode(manifestRaw ?? new Uint8Array());
  const parsed = themeManifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("loader: stored package manifest invalid");
  return parsed.data;
}

async function loadByStorageKey(storageKey: string, checksum: string | null): Promise<PackageFiles> {
  if (storageKey.startsWith("local:")) {
    if (!localModeAllowed()) throw new Error("loader: local packages are dev/preview only");
    return readLocalPackage(storageKey.slice("local:".length));
  }
  const bytes = await storage.fetchPackage(storageKey);
  if (checksum && sha256(bytes) !== checksum) throw new Error("loader: checksum mismatch");
  const zipped = unzipSync(bytes);
  const files: PackageFiles = new Map();
  for (const [name, content] of Object.entries(zipped)) putInMap(files, name, content as Uint8Array);
  return files;
}

/** Resolve the ONE version a business renders + load it. */
export async function loadPackageForTheme(themeId: string | null): Promise<LoadedPackage | null> {
  if (!themeId) return null;
  const theme = await prisma.theme.findUnique({ where: { id: themeId }, select: { currentVersionId: true } });
  if (!theme?.currentVersionId) return null;
  const cached = cache.get(theme.currentVersionId);
  if (cached) return cached;
  const version = await prisma.themeVersion.findUnique({
    where: { id: theme.currentVersionId },
    select: { id: true, storageKey: true, checksum: true, themeId: true },
  });
  if (!version || version.themeId !== themeId) return null;
  const files = await loadByStorageKey(version.storageKey, version.checksum);
  const pkg: LoadedPackage = { files, manifest: parseManifest(files), versionId: version.id };
  cache.set(version.id, pkg);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return pkg;
}

/** Direct version load for the fixture-preview + asset routes. */
export async function loadPackageByVersionId(versionId: string): Promise<LoadedPackage | null> {
  const cached = cache.get(versionId);
  if (cached) return cached;
  const version = await prisma.themeVersion.findUnique({
    where: { id: versionId },
    select: { id: true, storageKey: true, checksum: true },
  });
  if (!version) return null;
  const files = await loadByStorageKey(version.storageKey, version.checksum);
  const pkg: LoadedPackage = { files, manifest: parseManifest(files), versionId: version.id };
  cache.set(version.id, pkg);
  return pkg;
}

/** The latest published version row of a theme slug (preview surface). */
export async function currentVersionIdForSlug(slug: string): Promise<string | null> {
  const theme = await prisma.theme.findUnique({
    where: { slug },
    select: { currentVersionId: true, status: true },
  });
  if (!theme || (theme.status !== "published" && theme.status !== "unlisted")) return null;
  return theme.currentVersionId;
}
