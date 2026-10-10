import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

/**
 * Post-login landing router. Redirects are built from the request URL
 * (finding M-5), never from NEXTAUTH_URL — an absolute env-based target
 * silently sends users to a stale/localhost origin when the env var is
 * missing or misconfigured.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.redirect(new URL("/login", req.url));

  // One condition per role, checked in order; the previous version routed
  // admin into the business-owner branch (there was no /admin landing until
  // Phase 2) and carried a dead `|| role === "admin"` in the developer
  // branch below it — an unreachable second opinion on the same role.
  const role = session.user.role;
  if (role === "admin") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  if (role === "business_owner") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (role === "developer") {
    return NextResponse.redirect(new URL("/dev", req.url));
  }
  return NextResponse.redirect(new URL("/", req.url));
}
