import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getDomainState,
  domainsApiConfigured,
} from "@/lib/vercel/domains-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/business/domain/check — "Check now".
 *
 * Verification state is ONLY ever taken from Vercel's project-domain record
 * (DNS seen + TLS issued on THIS project) — never inferred from our own
 * DNS lookups, which cannot see the certificate half. verified flips the
 * business to "verified" (which simultaneously activates tenant-host
 * serving and the subdomain→domain redirect); anything else stays "pending"
 * with the reason surfaced, since provider-propagation failures are
 * transient by nature. The response carries Vercel's expected records when
 * known, so the dashboard can show the EXACT values instead of generic
 * guidance.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "business_owner")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, customDomain: true },
  });
  if (!business) return NextResponse.json({ error: "No business yet" }, { status: 404 });
  if (!business.customDomain)
    return NextResponse.json({ error: "No custom domain on this business" }, { status: 400 });

  const now = new Date();

  if (!domainsApiConfigured()) {
    await prisma.business.update({
      where: { id: business.id },
      data: { domainCheckedAt: now },
    });
    return NextResponse.json({
      ok: true,
      verified: false,
      reason:
        "Platform domain API not configured — an operator must complete the attach/verification check.",
    });
  }

  const state = await getDomainState(business.customDomain);
  if (state.status !== "state") {
    // Transient API/platform failure: keep "pending", surface the reason,
    // stamp the attempt. Never flip to a scary "failed" on a network blip.
    await prisma.business.update({
      where: { id: business.id },
      data: { domainCheckedAt: now, domainError: state.status === "error" ? state.reason : "unconfigured" },
    });
    return NextResponse.json({ ok: true, verified: false, reason: state.status === "error" ? state.reason : "unconfigured" });
  }

  const { verified, cname, apexA } = state.data;
  await prisma.business.update({
    where: { id: business.id },
    data: {
      domainStatus: verified ? "verified" : "pending",
      domainCheckedAt: now,
      domainError: verified ? null : "DNS not detected yet — records can take up to 24h to apply",
    },
  });
  return NextResponse.json({
    ok: true,
    verified,
    ...(cname ? { cname } : {}),
    ...(apexA ? { apexA } : {}),
  });
}
