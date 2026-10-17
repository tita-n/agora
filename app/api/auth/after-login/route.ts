import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser, userCapabilities } from "@/lib/auth";
import { postLoginPath } from "@/lib/routing";

export const dynamic = "force-dynamic";

/**
 * Post-login landing (Phase 0 capability model): staff → /admin,
 * an owner → /dashboard, a developer → /developer, everyone else → /onboard.
 * Decided from a fresh DB read; the JWT carries identity only.
 */
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", _req.nextUrl.origin));
  const caps = await userCapabilities(user.id);
  return NextResponse.redirect(new URL(postLoginPath(caps), _req.nextUrl.origin));
}
