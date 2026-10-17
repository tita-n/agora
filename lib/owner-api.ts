/**
 * Shared guard for every tenant-content mutation (Phase 2.5). ONE funnel so
 * the four checks that must never drift live in one file:
 *   1. same-origin (cookie-auth mutation; NextAuth only CSRF-protects its
 *      own endpoints),
 *   2. authenticated session,
 *   3. role business_owner (admins manage via their own surfaces),
 *   4. the business is resolved FROM THE SESSION — businessId never travels
 *      from the client (IDOR rule: every item query below is
 *      `where: { id, businessId }`).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./prisma";

export type OwnerContext = { ok: true; userId: string; businessId: string } | { ok: false; res: NextResponse };

export async function ownerContext(req: NextRequest): Promise<OwnerContext> {
  if (req.headers.get("origin") !== req.nextUrl.origin) {
    return { ok: false, res: NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 }) };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!business) return { ok: false, res: NextResponse.json({ error: "No business yet" }, { status: 404 }) };
  return { ok: true, userId: user.id, businessId: business.id };
}

export function validationError(error: unknown): NextResponse {
  const issues =
    typeof error === "object" && error !== null && "issues" in error
      ? (error as { issues: { path: (string | number)[]; message: string }[] }).issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        }))
      : [];
  return NextResponse.json({ error: "Please fix the highlighted fields", issues }, { status: 422 });
}

export async function parseBody(req: NextRequest): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
