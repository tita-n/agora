/**
 * The closed set of theme presentation keys (Phase 2.5) — its own module
 * so validation layers (onboarding draft schema, site-config writes) never
 * import React components by importing the registry. themes/registry.ts must
 * cover EXACTLY these keys; scripts/phase25-units.ts fails the build if the
 * two ever drift apart.
 */
export const THEME_KEYS = ["minimal", "boutique", "bistro", "studio"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export const DEFAULT_THEME_KEY: ThemeKey = "minimal";

export function isThemeKey(v: unknown): v is ThemeKey {
  return typeof v === "string" && (THEME_KEYS as readonly string[]).includes(v);
}
