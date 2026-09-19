/**
 * Fair Use Policy thresholds + overage pricing (Phase 2).
 *
 * PURE MODULE: no DB, no network, no env reads — the rates below are the
 * final modeled numbers from the pricing model, and keeping the calculation
 * side-effect-free is what lets unit tests pin the exact reference
 * scenarios. Do not import prisma/env into this file.
 *
 * Policy (as settled):
 *   Page bandwidth   6 GB/month included   ₦500 per GB over
 *   Blob storage     5 MB included          ₦100 per GB per month over
 *   Blob transfer    2 GB/month included    ₦200 per GB over
 *
 * Units: usage arrives in (decimal) GB — same convention as Vercel's own
 * accounting. The 5 MB storage allowance is 0.005 decimal GB. Money leaves
 * as whole kobo: each component is computed in kobo and rounded once, per
 * component (never chained rounding on the total).
 */

export const FUP_LIMITS = {
  /** monthly page bandwidth included, in GB */
  includedBandwidthGb: 6,
  /** blob storage included, in decimal GB (5 MB) */
  includedBlobStorageGb: 0.005,
  /** monthly blob transfer included, in GB */
  includedBlobTransferGb: 2,
} as const;

export const OVERAGE_RATES_KOBO_PER_GB = {
  /** ₦500/GB */
  bandwidth: 50_000,
  /** ₦100/GB/month */
  blobStorage: 10_000,
  /** ₦200/GB */
  blobTransfer: 20_000,
} as const;

export interface UsageInputs {
  bandwidthGb: number;
  blobStorageGb: number;
  blobTransferGb: number;
}

export interface OverageBreakdown {
  bandwidthOverageKobo: number;
  storageOverageKobo: number;
  transferOverageKobo: number;
  totalOverageKobo: number;
}

/** NaN/Infinity/negatives clamp to "no usage" — the function never returns
 * a negative charge and never throws on garbage in (garbage in the usage
 * table must degrade to ₦0 overage, not to a broken billing run). */
function gbUsed(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function calculateOverageKobo(usage: UsageInputs): OverageBreakdown {
  const excessGb = (used: number, included: number) =>
    Math.max(0, gbUsed(used) - included);

  const bandwidthOverageKobo = Math.round(
    excessGb(usage.bandwidthGb, FUP_LIMITS.includedBandwidthGb) *
      OVERAGE_RATES_KOBO_PER_GB.bandwidth
  );
  const storageOverageKobo = Math.round(
    excessGb(usage.blobStorageGb, FUP_LIMITS.includedBlobStorageGb) *
      OVERAGE_RATES_KOBO_PER_GB.blobStorage
  );
  const transferOverageKobo = Math.round(
    excessGb(usage.blobTransferGb, FUP_LIMITS.includedBlobTransferGb) *
      OVERAGE_RATES_KOBO_PER_GB.blobTransfer
  );

  return {
    bandwidthOverageKobo,
    storageOverageKobo,
    transferOverageKobo,
    totalOverageKobo:
      bandwidthOverageKobo + storageOverageKobo + transferOverageKobo,
  };
}

/** Itemized, human-readable lines for emails/UI (label + exact kobo),
 * derived from the same pure numbers — the "why is this the number it is"
 * that both the owner and the admin get to see. */
export function overageLines(
  usage: UsageInputs,
  breakdown: OverageBreakdown = calculateOverageKobo(usage)
): { label: string; kobo: number }[] {
  const lines: { label: string; kobo: number }[] = [];
  if (breakdown.bandwidthOverageKobo > 0) {
    lines.push({
      label: `Bandwidth ${fmtGb(usage.bandwidthGb)} − ${FUP_LIMITS.includedBandwidthGb} GB included × ₦500/GB`,
      kobo: breakdown.bandwidthOverageKobo,
    });
  }
  if (breakdown.storageOverageKobo > 0) {
    lines.push({
      label: `File storage ${fmtGb(usage.blobStorageGb)} − 5 MB included × ₦100/GB`,
      kobo: breakdown.storageOverageKobo,
    });
  }
  if (breakdown.transferOverageKobo > 0) {
    lines.push({
      label: `File downloads ${fmtGb(usage.blobTransferGb)} − ${FUP_LIMITS.includedBlobTransferGb} GB included × ₦200/GB`,
      kobo: breakdown.transferOverageKobo,
    });
  }
  return lines;
}

function fmtGb(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return "0 GB";
  return `${gb < 1 ? gb.toFixed(3).replace(/0+$/, "").replace(/\.$/, ".0") : gb.toFixed(1)} GB`;
}
