/**
 * Developer payout ledger math (Phase 2) — PURE module, same rule as
 * overage.ts: no DB/env/network, so the split policy is unit-testable.
 *
 * Policy (explicitly settled, not reinterpretation-able):
 *  - Dev share = 70% of the dev's THEME PRICE per confirmed payment.
 *    The ₦5,000 platform hosting fee and 100% of usage overage stay
 *    platform revenue — they are NOT part of the split base.
 *  - floor() per payment (whole kobo), so rounding always favors the
 *    platform, never mints kobo out of nothing.
 *  - Period window = previous calendar month, computed on the 1st.
 */

export const DEV_SHARE = 0.7;

export function devShareKobo(themePriceKobo: number): number {
  if (!Number.isSafeInteger(themePriceKobo) || themePriceKobo <= 0) return 0;
  return Math.floor(themePriceKobo * DEV_SHARE);
}

/** Aggregate a period's confirmed payments into the dev's owed kobo.
 * `pricesKobo` = theme price captured for each confirmed payment (one entry
 * per payment, including duplicate businesses on the same theme — every
 * confirmed payment counts once). */
export function computeOwedKobo(pricesKobo: number[]): number {
  return pricesKobo.reduce((sum, price) => sum + devShareKobo(price), 0);
}

/** [previous calendar month start, this month start) in UTC. */
export function previousCalendarMonth(now: Date = new Date()): {
  periodStart: Date;
  periodEnd: Date;
} {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodStart = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getMonth() - 1, 1));
  return { periodStart, periodEnd };
}

/** "August 2026" style label for UI rows, from the period start. */
export function payoutPeriodLabel(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodStart);
}
