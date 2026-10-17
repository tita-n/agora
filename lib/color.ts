/**
 * Colour utilities for theme accent handling (Phase 2.5). Pure, unit-tested
 * (scripts/phase25-units.ts) — themes import these instead of each carrying
 * their own contrast math.
 */

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_COLOR_RE.test(v);
}

/** Normalize to lowercase #rrggbb; returns null for anything else. */
export function normalizeHexColor(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return HEX_COLOR_RE.test(s) ? s : null;
}

function channel(v: number): number {
  // WCAG relative luminance transform (sRGB → linear)
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Pick readable text (near-black or white) for `background` (a validated
 * hex). Crossover at the point where contrast-to-white stops beating
 * contrast-to-black; WCAG contrast ratio C = (L1+0.05)/(L2+0.05).
 *
 * White text contrast vs bg C = 1.05 / (L + 0.05)
 * Black-ish text (our ink #111827, L≈0.0114) C = (L + 0.05) / 0.0614
 * White wins when L < 0.1791 (the root of the equality).
 */
export function readableTextColor(background: string): "#ffffff" | "#111827" {
  const h = normalizeHexColor(background);
  if (!h) return "#111827"; // unvalidated input never reaches a style
  return relativeLuminance(h) < 0.1791 ? "#ffffff" : "#111827";
}
