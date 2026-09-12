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

  const role = session.user.role;
  if (role === "business_owner" || role === "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (role === "developer" || role === "admin") {
    return NextResponse.redirect(new URL("/dev", req.url));
  }
  return NextResponse.redirect(new URL("/", req.url));
}
