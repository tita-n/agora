import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isCronAuthorized } from "@/lib/cron-auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const GRACE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/cron/past-due-sweep  (Vercel Cron, daily — see vercel.json)
 *
 * Businesses whose nextBillingDate passed more than GRACE_DAYS ago with no
 * confirmed renewal → subscriptionStatus "past_due". The date check IS the
 * "no confirmed renewal payment" test: confirming a renewal payment moves
 * nextBillingDate forward (see /api/admin/payments/confirm), so a date still
 * in the past means nothing was confirmed.
 *
 * Sites are NOT taken down — past_due businesses keep rendering; the
 * dashboard shows the calm notice. Full suspension is a later decision.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req.headers.get("authorization"), env.CRON_SECRET, process.env.NODE_ENV === "production")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - GRACE_DAYS * DAY_MS);
  const result = await prisma.business.updateMany({
    where: {
      subscriptionStatus: "active",
      nextBillingDate: { not: null, lt: cutoff },
    },
    data: { subscriptionStatus: "past_due" },
  });

  const summary = { swept: result.count, graceDays: GRACE_DAYS };
  console.log(`[cron:past-due-sweep] ${JSON.stringify(summary)}`);
  return NextResponse.json(summary);
}
