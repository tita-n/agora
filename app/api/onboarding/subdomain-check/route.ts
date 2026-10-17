import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  subdomainShapeIssue,
  subdomainOccupancyIssue,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/subdomain-check?subdomain=demo
 * Auth-gated live availability feedback for onboarding step 1.
 * Validation = lib/tenant.ts rules (regex + reserved) then DB occupancy
 * (existing businesses and live onboarding holds) — the single source of
 * truth shared with payment-init and webhook fulfillment.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (req.nextUrl.searchParams.get("subdomain") ?? "").trim().toLowerCase();
  if (!raw) return NextResponse.json({ available: false, reason: "Enter a subdomain." });

  const shapeIssue = subdomainShapeIssue(raw);
  if (shapeIssue) return NextResponse.json({ available: false, reason: shapeIssue });

  const occupancy = await subdomainOccupancyIssue(raw);
  if (occupancy) return NextResponse.json({ available: false, reason: occupancy });

  return NextResponse.json({ available: true });
}
