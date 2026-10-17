import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionUpdateUrl } from "@/lib/paystack";

export const dynamic = "force-dynamic";

/**
 * GET /api/business/billing-portal
 * Owner-only redirect to Paystack's "update payment" page for the
 * business's subscription. Only touches the caller's own business
 * (resolved from the session, never from client input).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "business_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { paystackSubscriptionCode: true },
  });
  if (!business?.paystackSubscriptionCode) {
    return NextResponse.json(
      { error: "No subscription on this account yet." },
      { status: 404 }
    );
  }

  try {
    const url = await getSubscriptionUpdateUrl(business.paystackSubscriptionCode);
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open the billing page" },
      { status: 502 }
    );
  }
}
