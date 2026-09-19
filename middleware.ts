import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { classifyHost, tenantRewritePath, tenantHostRewritePath } from "@/lib/tenant";

/**
 * Agora multi-tenant subdomain routing (findings M-1 / M-2).
 *
 * Decision per request, from the Host header only (never X-Forwarded-Host):
 *  - apex ROOT_DOMAIN and www.ROOT_DOMAIN        -> main app
 *  - <valid-label>.ROOT_DOMAIN                   -> rewrite to /sites/<label>/<rest-of-path>
 *    (label must be a valid DNS label and non-reserved; anything else under
 *     the root — malformed, nested like a.b, or reserved like admin — 404s
 *     immediately instead of falling through to the main app)
 *  - any other host                              -> main app in development;
 *    in production, a CUSTOM-DOMAIN candidate (Phase 2): rewritten to
 *    /tenant-host, which serves content ONLY after a DB-exact,
 *    verified-domain lookup of this host — an unattached or unverified host
 *    still gets a 404, never the main app (the M-2 guarantee is preserved,
 *    just with one validated extra resolution path).
 *
 * Existence of the tenant itself is still resolved by the page via the DB —
 * a syntactically valid but unknown tenant (evil.agora.test) renders the
 * tenant-scoped "Site not found" 404, not the main app.
 */

function tenantNotFound(): NextResponse {
  return new NextResponse("404 — Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const root = (env.ROOT_DOMAIN || "agora.test").split(":")[0].toLowerCase();

  // Strict host allowlist (M-2) applies to production builds only, so local
  // development (/etc/hosts tricks, arbitrary ports) keeps working. Vercel
  // PREVIEW deployments are exempted too: they arrive on random
  // *.vercel.app hosts that are legitimately not under ROOT_DOMAIN, and
  // enforcing there would 404 every PR preview URL. VERCEL_ENV is
  // platform-injected and cannot be forged via headers.
  const strictHosts =
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV !== "preview";

  const route = classifyHost(host, root, strictHosts);

  if (route.kind === "main") return NextResponse.next();
  if (route.kind === "invalid") return tenantNotFound();

  // Custom-domain candidate (production only — in dev/preview foreign
  // hosts remain main-app for convenience, exactly as before Phase 2).
  if (route.kind === "tenantHost") {
    const url = req.nextUrl.clone();
    url.pathname = tenantHostRewritePath(url.pathname);
    return NextResponse.rewrite(url);
  }

  // Rewrite to the tenant site route, preserving the request's sub-path so
  // tenant hosts can later expose their own routes (/pricing, /catalog, ...).
  const url = req.nextUrl.clone();
  url.pathname = tenantRewritePath(route.subdomain, url.pathname);
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on every request except static assets and Next internals
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js|map|ico|txt|xml)$).*)",
  ],
};
