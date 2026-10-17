import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fulfillPaidSession } from "@/lib/onboarding";
import { tenantSiteUrl } from "@/lib/site-urls";

export const dynamic = "force-dynamic";

/**
 * POST /api/onboarding/confirm  { reference }
 *
 * Called by the callback page right after Paystack redirects back. Does NOT
 * trust the redirect itself — it re-verifies the charge against Paystack's
 * API via the same idempotent fulfillment the webhook uses, then returns the
 * live site. If the webhook gets there first, this returns the same result;
 * if neither can finish yet, the client polls.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let reference: string;
  try {
    reference = String((await req.json() as { reference?: unknown }).reference ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!reference.startsWith("aos_")) {
    return NextResponse.json({ error: "Unknown reference" }, { status: 400 });
  }

  // Ownership: a caller may only confirm their own session.
  const owned = await prisma.onboardingSession.findUnique({
    where: { reference },
    select: { userId: true },
  });
  if (!owned || owned.userId !== user.id) {
    return NextResponse.json({ error: "Unknown reference" }, { status: 404 });
  }

  const result = await fulfillPaidSession(reference);
  if (!result.ok) {
    return NextResponse.json({ ready: false, reason: result.reason }, { status: 200 });
  }

  const business = await prisma.business.findUnique({
    where: { id: result.businessId },
    select: { name: true, subdomain: true },
  });
  return NextResponse.json({
    ready: true,
    name: business?.name,
    siteUrl: business ? tenantSiteUrl(business.subdomain) : null,
    pathUrl: business ? `/sites/${business.subdomain}` : null,
  });
}
