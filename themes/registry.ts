/**
 * templateKey → theme module. THE single lookup boundary (Phase 2.5):
 * pages resolve a business's Theme.templateKey here; unknown/missing keys
 * fall back to Minimal, which is why the fallback is total (a typo in the
 * DB renders a correct simple site, not a 500). Themes are pure
 * presentational server components — see themes/types.ts for what that
 * guarantees and why it is the future third-party boundary.
 *
 * The DB's Theme.price (what the owner pays) and this map (how it renders)
 * are deliberately separate: registry keys are code, prices are data.
 */
import { MinimalTheme } from "./minimal";
import { BoutiqueTheme } from "./boutique";
import { BistroTheme } from "./bistro";
import { StudioTheme } from "./studio";
import type { ThemeModule } from "./types";

export const THEMES: Record<string, ThemeModule> = {
  [MinimalTheme.key]: MinimalTheme,
  [BoutiqueTheme.key]: BoutiqueTheme,
  [BistroTheme.key]: BistroTheme,
  [StudioTheme.key]: StudioTheme,
};

export const KNOWN_THEME_KEYS = Object.keys(THEMES);

export function resolveTheme(templateKey: string | null | undefined): ThemeModule {
  if (templateKey && THEMES[templateKey]) return THEMES[templateKey];
  return MinimalTheme;
}

/** Picker metadata for onboarding/dashboard (never trusts anything else). */
export const THEME_CATALOG: { key: string; label: string; tagline: string; forWho: string }[] =
  Object.values(THEMES).map(({ key, label, tagline, forWho }) => ({ key, label, tagline, forWho }));
