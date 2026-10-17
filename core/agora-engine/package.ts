/**
 * Template PACKAGE rules (docs/TEMPLATE_SPEC.md) — pure. A "package" in
 * this codebase is a flat map of POSIX-relative path → content. Validation
 * and rendering never see the filesystem; loaders (lib/templates/) turn
 * zips or local directories into this map.
 */
import { z } from "zod";
import { sectionTypes } from "./site-data";

export const PACKAGE_LIMITS = {
  maxFiles: 64,
  maxFileBytes: 256 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
  maxLiquidBytes: 128 * 1024,
  maxOutputBytes: 1024 * 1024,
} as const;

export const ASSET_EXT = ["css", "js", "json", "svg", "png", "jpg", "jpeg", "webp", "avif", "woff", "woff2"] as const;

export const themeManifestSchema = z.object({
  apiVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/),
  name: z.string().min(2).max(60),
  version: z.string().regex(/^\d+\.\d+\.\d+$/), // strict semver
  description: z.string().max(500),
  categories: z.array(z.string().min(2).max(30)).min(1).max(6),
  supportedSections: z.array(z.enum(sectionTypes)).min(1).max(sectionTypes.length),
  pluginSlots: z.array(z.enum(["floating-widget", "footer-strip"])).default([]),
  settings: z
    .record(
      z.object({
        type: z.enum(["boolean", "select", "color", "text", "image"]),
        default: z.union([z.string(), z.boolean(), z.number()]),
        options: z.array(z.string()).min(1).max(20).optional(),
        label: z.string().max(60).optional(),
      })
    )
    .default({}),
});
export type ThemeManifest = z.infer<typeof themeManifestSchema>;

export const settingsSchemaEntry = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  label: z.string().min(2).max(60),
  type: z.enum(["boolean", "select", "color", "text", "image"]),
  default: z.union([z.string(), z.boolean(), z.number()]),
  options: z.array(z.string()).min(1).max(20).optional(),
});
export type SettingsSchemaEntry = z.infer<typeof settingsSchemaEntry>;

export type PackageFiles = Map<string, string | Uint8Array>;

const SAFE_PATH = /^[a-z0-9][a-z0-9._/-]{0,119}$/;

/** Path safety for every file in a package: lowercase POSIX, no traversal,
 * no double slashes, no absolute, extension rules where relevant. */
export function packagePathIssues(path: string, sizeBytes: number, isAsset: boolean): string[] {
  const issues: string[] = [];
  if (!SAFE_PATH.test(path)) issues.push(`unsafe path "${path}"`);
  if (path.includes("..") || path.startsWith("/") || path.includes("//")) issues.push(`traversal/absolute path "${path}"`);
  if (isAsset) {
    const ext = path.split(".").pop() ?? "";
    if (!(ASSET_EXT as readonly string[]).includes(ext)) issues.push(`asset type .${ext} not allowed (${path})`);
    if (!path.startsWith("assets/")) issues.push(`asset must live under assets/ (${path})`);
  }
  if (sizeBytes > PACKAGE_LIMITS.maxFileBytes) issues.push(`file over 256KB (${path})`);
  return issues;
}

/** Merge tenant-provided values over the package's settings schema
 * defaults (booleans stay booleans; colors only pass as #rrggbb). */
export function resolveSettings(
  manifest: ThemeManifest,
  tenant: Record<string, unknown> | undefined | null
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, spec] of Object.entries(manifest.settings)) {
    const v = tenant?.[key];
    if (typeof v === typeof spec.default) {
      if (spec.type === "color" && typeof v === "string" && !/^#[0-9a-fA-F]{6}$/.test(v)) {
        out[key] = spec.default;
        continue;
      }
      if (spec.type === "select" && typeof v === "string" && spec.options && !spec.options.includes(v)) {
        out[key] = spec.default;
        continue;
      }
      out[key] = v as string | number | boolean;
    } else {
      out[key] = spec.default;
    }
  }
  return out;
}
