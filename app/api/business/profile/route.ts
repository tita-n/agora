import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { draftSchema } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/business/profile — dashboard profile editing.
 *
 * Same validators as onboarding (minus subdomain — identity is fixed after
 * purchase — and minus logoUrl, which the upload flow owns via the
 * completion callback). Business is resolved from the SESSION's user id;
 * the client never sends a business id, so there is no IDOR surface.
 */
// Phase 2.5 note: draftSchema also carries `themeKey` — a profile PATCH
// must never move a business to another theme (theme switching is out of
// scope: price, payment and dev payout all hang off it). Omitting it here
// PLUS the inherited .strict() means sending themeKey/themeId is a hard
// 422 ("Unrecognized key") — physically impossible, not politely declined.
const profileSchema = draftSchema.omit({ subdomain: true, logoUrl: true, themeKey: true });

export async function PATCH(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "business_owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    select: { id: true },
  });
  if (!business) return NextResponse.json({ error: "No business yet" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Please fix the highlighted fields",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 422 }
    );
  }

  const d = parsed.data;
  await prisma.business.update({
    where: { id: business.id },
    data: {
      name: d.name,
      description: d.description ?? null,
      contactEmail: d.contactEmail ?? null,
      contactPhone: d.contactPhone ?? null,
      address: d.address ?? null,
      primaryColor: d.primaryColor ?? null,
      // Phase 2.5 fields (normalized by the shared schema's transforms).
      // `?? null` on purpose: clearing a field must clear the column too.
      whatsappNumber: d.whatsappNumber ?? null,
      instagramUrl: d.instagramUrl ?? null,
      facebookUrl: d.facebookUrl ?? null,
      tiktokUrl: d.tiktokUrl ?? null,
      mapsUrl: d.mapsUrl ?? null,
      openingHours: d.openingHours ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}
