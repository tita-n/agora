import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { normalizeCustomDomain } from "@/lib/domains";
import { addProjectDomain, removeProjectDomain, domainsApiConfigured } from "@/lib/vercel/domains-api";

export const dynamic = "force-dynamic";

/**
 * POST /api/business/domain   { domain }   — claim/update the business's
 * custom domain.  DELETE — release it.
 *
 * Same trust model as /api/business/profile: business resolved from the
 * SESSION, never from a client-sent id; role + origin re-checked server-side.
 *
 * The stored value is always the normalized hostname (see lib/domains).
 * Saving marks the business "pending" and, when the platform token is
 * configured, asks Vercel to attach the domain to the project. A Vercel
 * failure (domain owned by another account, API hiccup) does NOT reject the
 * save — the request is kept pending with the error surfaced to the owner,
 * because retrying "Check" after Vercel-side fixes should not require
 * retyping. A domain already claimed by another BUSINESS on this platform is
 * rejected with 409 — the @unique DB constraint is the hard backstop; the
 * pre-check only improves the message.
 */
async function ownerBusiness() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "business_owner")
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, customDomain: true },
  });
  if (!business)
    return { error: NextResponse.json({ error: "No business yet" }, { status: 404 }) };
  return { user, business };
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const ctx = await ownerBusiness();
  if (ctx.error) return ctx.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const raw = (body as { domain?: unknown })?.domain;
  const validated = normalizeCustomDomain(raw, env.ROOT_DOMAIN || "agora.test");
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 422 });
  }
  const domain = validated.domain;

  const clash = await prisma.business.findFirst({
    where: { customDomain: domain, NOT: { id: ctx.business!.id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json(
      { error: "Another business on Agora already claims that domain" },
      { status: 409 }
    );
  }

  await prisma.business.update({
    where: { id: ctx.business!.id },
    data: { customDomain: domain, domainStatus: "pending", domainError: null, domainCheckedAt: null },
  });

  let vercelNote: string | undefined;
  if (domainsApiConfigured()) {
    const res = await addProjectDomain(domain);
    if (!res.ok) {
      vercelNote = res.error ?? "Could not attach domain on Vercel";
      await prisma.business.update({
        where: { id: ctx.business!.id },
        data: { domainError: vercelNote },
      });
    }
  } else {
    vercelNote =
      "Platform domain API is not configured (VERCEL_ACCESS_TOKEN/VERCEL_PROJECT_ID) — the claim is saved, and verification can complete once an operator attaches the domain.";
  }

  return NextResponse.json({
    ok: true,
    domain,
    status: "pending",
    ...(vercelNote ? { note: vercelNote } : {}),
  });
}

export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const ctx = await ownerBusiness();
  if (ctx.error) return ctx.error;

  const current = ctx.business!.customDomain;
  await prisma.business.update({
    where: { id: ctx.business!.id },
    data: { customDomain: null, domainStatus: "none", domainError: null, domainCheckedAt: null },
  });
  // Best-effort detach on Vercel; a failure there must not block the owner
  // from releasing the claim on us (stale attachment is an operator to-do,
  // logged below).
  if (current && domainsApiConfigured()) {
    const res = await removeProjectDomain(current);
    if (!res.ok) console.warn(`[domain] Vercel detach failed for ${current}: ${res.error}`);
  }
  return NextResponse.json({ ok: true });
}
