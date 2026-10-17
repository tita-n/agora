import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";
import { devShareKobo, previousCalendarMonth } from "@/lib/billing/payouts";
import { HOSTING_FEE_KOBO } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/dev-payouts  (Vercel Cron, monthly — 06:00 UTC on the 1st,
 * see vercel.json; also safe to run by hand any time: it RECOMPUTES the
 * previous month's owed rows)
 *
 * For each developer: amountKobo = Σ floor(0.7 × theme price) over every
 * payment CONFIRMED in the previous calendar month (UTC) on a business
 * running one of their themes. The ₦5,000 hosting fee and all usage
 * overage stay 100% platform revenue (settled policy — the split base is
 * the dev's price, nothing else).
 *
 * The price is taken from the payment row itself (baseKobo − fee), NOT the
 * theme's current price: a dev who repriced their theme mid-month must not
 * change what was actually collected. Rows created before baseKobo existed
 * are skipped and counted in the response — deliberate: the ledger starts
 * at Phase 2 rather than backfilling from mutable fields.
 *
 * paid rows are IMMUTABLE (cron never rewrites them); owed rows are
 * overwritten, which makes late confirmations self-healing. One-business-
 * per-owner + theme-never-swapped remain documented simplifications of the
 * association (business → theme → dev at confirmation time == now).
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), env.CRON_SECRET, process.env.NODE_ENV === "production")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { periodStart, periodEnd } = previousCalendarMonth();

  const payments = await prisma.pendingPayment.findMany({
    where: { status: "confirmed", confirmedAt: { gte: periodStart, lt: periodEnd } },
    select: {
      id: true,
      kind: true,
      baseKobo: true,
      business: { select: { theme: { select: { devId: true, price: true } } } },
    },
  });

  // Aggregate per dev in memory (one pass; N businesses is small by design).
  const byDev = new Map<string, number>();
  let skippedNoBase = 0;
  for (const p of payments) {
    const devId = p.business?.theme?.devId;
    if (!devId) continue; // theme unpublished/deleted — operator review case
    if (p.baseKobo == null) {
      skippedNoBase++;
      continue;
    }
    const priceKobo = p.baseKobo - HOSTING_FEE_KOBO;
    if (!Number.isSafeInteger(priceKobo) || priceKobo <= 0) {
      skippedNoBase++;
      continue;
    }
    byDev.set(devId, (byDev.get(devId) ?? 0) + devShareKobo(priceKobo));
  }

  let created = 0;
  let recomputed = 0;
  let immutablePaid = 0;
  const lines: string[] = [];

  for (const [devId, amountKobo] of [...byDev.entries()].sort()) {
    const existing = await prisma.devPayout.findFirst({
      where: { devId, periodStart },
      select: { id: true, status: true, amountKobo: true },
    });
    if (existing?.status === "paid") {
      immutablePaid++;
      continue;
    }
    if (existing) {
      if (existing.amountKobo !== amountKobo) {
        await prisma.devPayout.update({
          where: { id: existing.id },
          data: { amountKobo, periodEnd },
        });
        recomputed++;
        lines.push(`${devId}: recomputed ${existing.amountKobo} → ${amountKobo} kobo`);
      }
      continue;
    }
    await prisma.devPayout.create({
      data: { devId, periodStart, periodEnd, amountKobo, status: "owed" },
    });
    created++;
    lines.push(`${devId}: owed ${amountKobo} kobo for ${periodStart.toISOString().slice(0, 7)}`);
  }

  const summary = {
    period: `${periodStart.toISOString().slice(0, 10)} → ${periodEnd.toISOString().slice(0, 10)}`,
    confirmedPayments: payments.length,
    devs: byDev.size,
    created,
    recomputed,
    immutablePaid,
    skippedNoBase,
    details: lines,
  };
  console.log(`[cron:dev-payouts] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
