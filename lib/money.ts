/**
 * Kobo → "₦5,050" display string. Hand-rolled grouping (no Intl) so server
 * and browser output are byte-identical, and kobo remain exact: odd amounts
 * render as ₦50.50, never rounded. Server or client safe.
 */
export function formatNaira(kobo: number): string {
  if (!Number.isSafeInteger(kobo) || kobo < 0) return "—";
  const whole = Math.floor(kobo / 100);
  const frac = kobo % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac === 0
    ? `\u20A6${grouped}`
    : `\u20A6${grouped}.${frac.toString().padStart(2, "0")}`;
}
